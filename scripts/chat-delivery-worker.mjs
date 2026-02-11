#!/usr/bin/env node

// Chat Delivery Worker
// - Polls Supabase chat_delivery_queue for queued rows
// - Claims rows, runs OpenClaw agent turn, writes reply back to project_chat_messages
// - Watchdog: marks stale rows failed after 2 minutes
//
// Designed to run on the Mac mini executor. Safe defaults:
// - hard timeouts on agent execution
// - best-effort logging only

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

// Prefer local dev env files (match cron-mirror behavior)
dotenv.config();
dotenv.config({ path: '.env.local', override: false });

const exec = promisify(_exec);

const PROJECT_ID =
  process.env.CLAWDOS_PROJECT_ID ||
  process.env.CLAWDOX_PROJECT_ID ||
  process.env.CLAWDO_PROJECT_ID ||
  'front-office';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

const POLL_MS = Number(process.env.CLAWDOS_CHAT_POLL_MS || 2000);
const BATCH = Number(process.env.CLAWDOS_CHAT_BATCH || 5);
const STALE_MS = Number(process.env.CLAWDOS_CHAT_STALE_MS || 120000);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[chat-worker] Missing SUPABASE_URL/SUPABASE_KEY env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function agentIdShortFromKey(agentKey) {
  const parts = String(agentKey || '').split(':');
  return parts.length >= 2 ? parts[1] : String(agentKey || '');
}

async function markStaleFailed() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  try {
    // Mark queued rows older than cutoff as failed
    await supabase
      .from('chat_delivery_queue')
      .update({ status: 'failed', completed_at: new Date().toISOString(), result: { error: 'stale_timeout' } })
      .eq('project_id', PROJECT_ID)
      .in('status', ['queued', 'delivered'])
      .lt('created_at', cutoff);
  } catch (e) {
    console.warn('[chat-worker] stale watchdog failed:', e?.message || e);
  }
}

async function claimRow(id) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('chat_delivery_queue')
    .update({ status: 'delivered', picked_up_at: nowIso })
    .eq('project_id', PROJECT_ID)
    .eq('id', id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function processRow(row) {
  const nowIso = new Date().toISOString();

  // Load message body + thread
  const { data: msg, error: msgErr } = await supabase
    .from('project_chat_messages')
    .select('id,thread_id,message')
    .eq('project_id', PROJECT_ID)
    .eq('id', row.message_id)
    .maybeSingle();
  if (msgErr) throw msgErr;
  if (!msg) throw new Error('message_not_found');

  const agentIdShort = agentIdShortFromKey(row.target_agent_key);
  const sessionId = `clawdos:${PROJECT_ID}:${msg.thread_id || row.target_agent_key}`;

  // Run agent turn via OpenClaw gateway.
  // Hard timeout so worker can't hang forever.
  let stdout = '';
  try {
    const r = await exec(
      `openclaw agent --agent ${JSON.stringify(agentIdShort)} --session-id ${JSON.stringify(sessionId)} --channel last --message ${JSON.stringify(msg.message)} --json --timeout 120`,
      { timeout: 140000 }
    );
    stdout = r.stdout || '';
  } catch (e) {
    const errMsg = String(e?.message || e);
    await supabase
      .from('chat_delivery_queue')
      .update({ status: 'failed', completed_at: nowIso, result: { error: errMsg } })
      .eq('project_id', PROJECT_ID)
      .eq('id', row.id);
    return;
  }

  // Extract only the actual reply payload text (avoid dumping run metadata into chat)
  let replyText = '';
  try {
    const parsed = JSON.parse(stdout);
    const payloads = parsed?.result?.payloads || parsed?.payloads;
    if (Array.isArray(payloads) && payloads.length > 0) {
      replyText = payloads.map((p) => p?.text).filter(Boolean).join('\n\n');
    }
    if (!replyText) {
      replyText =
        parsed?.reply ||
        parsed?.message ||
        parsed?.text ||
        parsed?.result?.reply ||
        parsed?.result?.text ||
        parsed?.output?.text ||
        parsed?.output?.message ||
        '';
    }
  } catch {
    // ignore
  }
  if (!replyText) replyText = String(stdout || '').trim();

  // Write response
  await supabase.from('project_chat_messages').insert({
    project_id: PROJECT_ID,
    thread_id: msg.thread_id || null,
    author: row.target_agent_key,
    target_agent_key: null,
    message: replyText || '(no reply)',
  });

  // Mark processed
  await supabase
    .from('chat_delivery_queue')
    .update({ status: 'processed', completed_at: nowIso, result: { ok: true } })
    .eq('project_id', PROJECT_ID)
    .eq('id', row.id);
}

async function loop() {
  console.log('[chat-worker] starting', { PROJECT_ID, POLL_MS, BATCH });

  while (true) {
    await markStaleFailed();

    let rows = [];
    try {
      const { data, error } = await supabase
        .from('chat_delivery_queue')
        .select('*')
        .eq('project_id', PROJECT_ID)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(BATCH);
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      console.warn('[chat-worker] poll failed:', e?.message || e);
      await sleep(POLL_MS);
      continue;
    }

    if (rows.length === 0) {
      await sleep(POLL_MS);
      continue;
    }

    for (const r of rows) {
      try {
        const claimed = await claimRow(r.id);
        if (!claimed) continue; // someone else claimed it
        await processRow(claimed);
      } catch (e) {
        console.warn('[chat-worker] process failed:', e?.message || e);
        try {
          await supabase
            .from('chat_delivery_queue')
            .update({ status: 'failed', completed_at: new Date().toISOString(), result: { error: String(e?.message || e) } })
            .eq('project_id', PROJECT_ID)
            .eq('id', r.id);
        } catch {
          // ignore
        }
      }
    }
  }
}

loop().catch((e) => {
  console.error('[chat-worker] fatal:', e);
  process.exit(1);
});
