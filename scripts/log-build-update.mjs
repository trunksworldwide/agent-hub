#!/usr/bin/env node

/**
 * Log a short Supabase activities entry (type=build_update).
 *
 * Usage:
 *   node scripts/log-build-update.mjs --message "..." [--project front-office] [--actor agent:main:main]
 *
 * Env:
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *   (or SUPABASE_URL / SUPABASE_ANON_KEY)
 *
 *   If present, we prefer a service role key for reliability with RLS:
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env then .env.local (local should override)
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const message = (args.message || '').toString().trim();
const projectId = (args.project || process.env.CLAWDOS_PROJECT || 'front-office').toString();
const actor = (args.actor || 'agent:main:main').toString();

if (!message) {
  console.error('Missing --message');
  process.exit(2);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_KEY;

const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseKey = serviceKey || anon;

if (!url || !supabaseKey) {
  console.error('Missing Supabase env (VITE_SUPABASE_URL + key). Skipping.');
  process.exit(0);
}

const supabase = createClient(url, supabaseKey);

const { error } = await supabase.from('activities').insert({
  project_id: projectId,
  type: 'build_update',
  message,
  actor_agent_key: actor,
});

if (error) {
  console.error('Failed to insert build_update activity:', error);
  process.exit(1);
}

// Best-effort presence bump so build updates show up as real agent activity.
const normalizeAgentKey = (raw) => {
  const parts = String(raw || '').split(':');
  if (parts[0] === 'agent' && parts.length >= 3) return parts.slice(0, 3).join(':');
  return String(raw || '').trim();
};

if (String(actor || '').startsWith('agent:')) {
  try {
    await supabase.from('agent_status').upsert(
      {
        project_id: projectId,
        agent_key: normalizeAgentKey(actor),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent_key' }
    );
  } catch {
    // fail soft
  }
}

console.log('Logged build_update activity.');
