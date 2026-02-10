import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';

// Prefer local dev env files.
dotenv.config();
dotenv.config({ path: '.env.local', override: false });

// NOTE: project id must match what the UI/brain-doc-sync uses.
// Primary env: CLAWDOS_PROJECT_ID (canonical).
// Keep legacy fallbacks to avoid breaking older setups.
const PROJECT_ID =
  process.env.CLAWDOS_PROJECT_ID ||
  process.env.CLAWDOX_PROJECT_ID ||
  process.env.CLAWDO_PROJECT_ID ||
  'front-office';
const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error('Missing env vars. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, service);

const EXECUTOR_BIN =
  process.env.EXECUTOR_BIN ||
  process.env.CLAWDBOT_BIN ||
  process.env.OPENCLAW_BIN ||
  '/opt/homebrew/bin/openclaw';

function runCmd(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => {
      stderr += `\n[cron-mirror] timeout after ${timeoutMs}ms`;
      try {
        p.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    p.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    p.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    p.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

function stableHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function scheduleToMirror(job) {
  const sch = job?.schedule;
  if (!sch || typeof sch !== 'object') return { schedule_kind: null, schedule_expr: null, tz: null };

  if (sch.kind === 'cron') return { schedule_kind: 'cron', schedule_expr: String(sch.expr || ''), tz: String(sch.tz || '') || null };
  if (sch.kind === 'every') return { schedule_kind: 'every', schedule_expr: String(sch.everyMs ?? ''), tz: null };
  return { schedule_kind: String(sch.kind || ''), schedule_expr: null, tz: null };
}

async function mirrorCronList() {
  const { code, stdout, stderr } = await runCmd(EXECUTOR_BIN, ['cron', 'list', '--all', '--json'], 20_000);
  if (code !== 0) throw new Error(`executor cron list failed: ${stderr || stdout}`);

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    throw new Error(`Failed to parse executor cron list JSON: ${String(e)}\nstdout: ${stdout.slice(0, 500)}`);
  }

  const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : Array.isArray(parsed) ? parsed : [];

  const fingerprint = stableHash(
    JSON.stringify(
      jobs
        .map((j) => ({
          id: j.id,
          name: j.name,
          enabled: j.enabled,
          schedule: j.schedule,
          nextRunAtMs: j.state?.nextRunAtMs,
          lastRunAtMs: j.state?.lastRunAtMs,
          lastStatus: j.state?.lastStatus,
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    )
  );

  const stateJobId = '__mirror_state__';
  const { data: stateRow, error: stateErr } = await sb
    .from('cron_mirror')
    .select('schedule_expr')
    .eq('project_id', PROJECT_ID)
    .eq('job_id', stateJobId)
    .maybeSingle();
  if (stateErr) throw stateErr;

  const prev = stateRow?.schedule_expr || null;
  const changed = prev !== fingerprint;

  if (!changed) {
    // Even when the fingerprint hasn't changed, ensure stale rows are pruned.
    // This keeps Supabase mirror consistent if a prior prune failed.
    try {
      const currentJobIds = jobs.map((j) => String(j.id)).filter(Boolean);
      currentJobIds.push(stateJobId);
      const inList = `(${currentJobIds.map((id) => JSON.stringify(String(id))).join(',')})`;
      const { error: delErr } = await sb
        .from('cron_mirror')
        .delete()
        .eq('project_id', PROJECT_ID)
        .not('job_id', 'in', inList);
      if (delErr) console.error('[cron-mirror] stale row cleanup failed', delErr);
    } catch (e) {
      console.error('[cron-mirror] stale row cleanup threw', e);
    }

    return { changed: false, count: jobs.length };
  }

  const rows = jobs.map((j) => {
    const { schedule_kind, schedule_expr, tz } = scheduleToMirror(j);
    const nextRunAt = j?.state?.nextRunAtMs ? new Date(Number(j.state.nextRunAtMs)).toISOString() : null;
    const lastRunAt = j?.state?.lastRunAtMs ? new Date(Number(j.state.lastRunAtMs)).toISOString() : null;
    const instructions = j?.payload?.message ? String(j.payload.message).slice(0, 2000) : null;

    return {
      project_id: PROJECT_ID,
      job_id: String(j.id),
      name: String(j.name || j.id),
      schedule_kind,
      schedule_expr: schedule_expr || null,
      tz,
      enabled: Boolean(j.enabled),
      next_run_at: nextRunAt,
      last_run_at: lastRunAt,
      last_status: j?.state?.lastStatus ? String(j.state.lastStatus) : null,
      last_duration_ms: typeof j?.state?.lastDurationMs === 'number' ? j.state.lastDurationMs : null,
      instructions,
    };
  });

  const { error: upErr } = await sb.from('cron_mirror').upsert(rows, { onConflict: 'project_id,job_id' });
  if (upErr) throw upErr;

  const { error: fpErr } = await sb.from('cron_mirror').upsert(
    {
      project_id: PROJECT_ID,
      job_id: stateJobId,
      name: 'mirror state (do not delete)',
      schedule_kind: 'state',
      schedule_expr: fingerprint,
      tz: null,
      enabled: false,
      next_run_at: null,
      last_run_at: null,
      last_status: null,
      last_duration_ms: null,
      instructions: null,
    },
    { onConflict: 'project_id,job_id' }
  );
  if (fpErr) throw fpErr;

  // Clean up stale mirror rows for jobs that no longer exist on executor.
  // IMPORTANT: PostgREST `in` filters require values to be quoted. Use JSON.stringify for safe quoting.
  const currentJobIds = jobs.map((j) => String(j.id)).filter(Boolean);
  currentJobIds.push(stateJobId); // keep the state row

  const inList = `(${currentJobIds.map((id) => JSON.stringify(String(id))).join(',')})`;

  const { error: delErr } = await sb
    .from('cron_mirror')
    .delete()
    .eq('project_id', PROJECT_ID)
    .not('job_id', 'in', inList);

  if (delErr) console.error('[cron-mirror] stale row cleanup failed', delErr);
  else console.log('[cron-mirror] cleanup done, keeping', currentJobIds.length, 'rows');

  return { changed: true, count: jobs.length };
}

async function processRunRequests() {
  const { data, error } = await sb
    .from('cron_run_requests')
    .select('id,job_id,status,requested_at')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(5);
  if (error) throw error;

  const queued = Array.isArray(data) ? data : [];
  let processed = 0;

  for (const req of queued) {
    processed++;
    const reqId = String(req.id);
    const jobId = String(req.job_id);

    const { error: updErr } = await sb.from('cron_run_requests').update({ status: 'running' }).eq('id', reqId);
    if (updErr) throw updErr;

    const startedAt = Date.now();
    const { code, stdout, stderr } = await runCmd(EXECUTOR_BIN, ['cron', 'run', jobId, '--force'], 10 * 60_000);
    const durationMs = Date.now() - startedAt;

    const result = {
      jobId,
      exitCode: code,
      durationMs,
      stdoutTail: stdout.slice(-4000),
      stderrTail: stderr.slice(-4000),
    };

    const nextStatus = code === 0 ? 'done' : 'error';
    const { error: finErr } = await sb.from('cron_run_requests').update({ status: nextStatus, result }).eq('id', reqId);
    if (finErr) throw finErr;
  }

  return processed;
}

async function processDeleteRequests() {
  const { data, error } = await sb
    .from('cron_delete_requests')
    .select('id,job_id,status,requested_at')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(5);
  if (error) throw error;

  const queued = Array.isArray(data) ? data : [];
  let processed = 0;

  for (const req of queued) {
    processed++;
    const reqId = String(req.id);
    const jobId = String(req.job_id);

    const { error: updErr } = await sb.from('cron_delete_requests').update({ status: 'running' }).eq('id', reqId);
    if (updErr) throw updErr;

    const startedAt = Date.now();
    const { code, stdout, stderr } = await runCmd(EXECUTOR_BIN, ['cron', 'rm', jobId], 60_000);
    const durationMs = Date.now() - startedAt;

    const result = {
      jobId,
      exitCode: code,
      durationMs,
      stdoutTail: stdout.slice(-4000),
      stderrTail: stderr.slice(-4000),
    };

    const nextStatus = code === 0 ? 'done' : 'error';
    const { error: finErr } = await sb.from('cron_delete_requests').update({ status: nextStatus, result }).eq('id', reqId);
    if (finErr) throw finErr;
  }

  return processed;
}

async function processPatchRequests() {
  const { data, error } = await sb
    .from('cron_job_patch_requests')
    .select('id,job_id,patch_json,status,requested_at')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(5);
  if (error) throw error;

  const queued = Array.isArray(data) ? data : [];
  let processed = 0;

  for (const req of queued) {
    processed++;
    const reqId = String(req.id);
    const jobId = String(req.job_id);

    const { error: updErr } = await sb.from('cron_job_patch_requests').update({ status: 'running' }).eq('id', reqId);
    if (updErr) throw updErr;

    // Build CLI args from patch_json
    const patch = typeof req.patch_json === 'string' ? JSON.parse(req.patch_json) : req.patch_json || {};
    const args = ['cron', 'edit', jobId];

    if (typeof patch.name === 'string' && patch.name.trim()) {
      args.push('--name', patch.name.trim());
    }
    if (typeof patch.instructions === 'string') {
      args.push('--system-event', patch.instructions);
    }
    if (typeof patch.scheduleExpr === 'string' && patch.scheduleExpr.trim()) {
      const scheduleKind = patch.scheduleKind || 'cron';
      if (scheduleKind === 'every') {
        args.push('--every', patch.scheduleExpr.trim());
      } else {
        args.push('--cron', patch.scheduleExpr.trim());
      }
    }
    if (patch.enabled === true) args.push('--enable');
    if (patch.enabled === false) args.push('--disable');

    const startedAt = Date.now();
    const { code, stdout, stderr } = await runCmd(EXECUTOR_BIN, args, 60_000);
    const durationMs = Date.now() - startedAt;

    const result = {
      jobId,
      exitCode: code,
      durationMs,
      stdoutTail: stdout.slice(-4000),
      stderrTail: stderr.slice(-4000),
    };

    const nextStatus = code === 0 ? 'done' : 'error';
    const { error: finErr } = await sb.from('cron_job_patch_requests').update({ status: nextStatus, result }).eq('id', reqId);
    if (finErr) throw finErr;
  }

  return processed;
}

async function processProvisionRequests() {
  const { data, error } = await sb
    .from('agent_provision_requests')
    .select('id,agent_key,agent_id_short,display_name,emoji,role_short,status,requested_at')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(3);
  if (error) throw error;

  const queued = Array.isArray(data) ? data : [];
  let processed = 0;

  for (const req of queued) {
    processed++;
    const reqId = String(req.id);
    const agentIdShort = String(req.agent_id_short);
    const agentKey = String(req.agent_key);
    const displayName = String(req.display_name);
    const emoji = req.emoji ? String(req.emoji) : null;
    const roleShort = req.role_short ? String(req.role_short) : null;

    const { error: updErr } = await sb.from('agent_provision_requests').update({ status: 'running', picked_up_at: new Date().toISOString() }).eq('id', reqId);
    if (updErr) throw updErr;

    const homedir = process.env.HOME || '/Users/trunks';
    const workspaceDir = `${homedir}/.openclaw/workspace-${agentIdShort}`;

    try {
      // 1. Add agent
      try {
        await runCmd(EXECUTOR_BIN, ['agents', 'add', agentIdShort, '--workspace', workspaceDir], 60_000);
      } catch (e) {
        const msg = String(e?.message || e);
        if (!msg.includes('already exists') && !msg.includes('already added')) throw e;
      }

      // 2. Set identity
      const identityArgs = ['agents', 'set-identity', '--agent', agentIdShort, '--name', displayName];
      if (emoji) identityArgs.push('--emoji', emoji);
      try {
        await runCmd(EXECUTOR_BIN, identityArgs, 60_000);
      } catch (e) {
        console.error('[provision] set-identity failed (non-fatal):', e?.message || e);
      }

      // 3. Seed workspace files
      const { exec: _execCb } = await import('node:child_process');
      const { promisify: _p } = await import('node:util');
      const _exec = _p(_execCb);
      await _exec(`mkdir -p "${workspaceDir}/memory"`);

      const { writeFileSync: _wfs, existsSync: _es } = await import('node:fs');
      const soulContent = `# SOUL.md - ${displayName}\n\n> ${roleShort || 'Agent'}\n\n## Core Behavior\n\n### Context Awareness\nBefore acting on any task, you receive a **Context Pack**.\nRead and apply this context. Do not assume information not provided.\n`;
      const userContent = `# USER.md\n\n## Profile\n- Agent: ${displayName}\n- Role: ${roleShort || 'General assistant'}\n`;
      const memoryContent = `# MEMORY.md\n\n`;

      if (!_es(`${workspaceDir}/SOUL.md`)) _wfs(`${workspaceDir}/SOUL.md`, soulContent, 'utf8');
      if (!_es(`${workspaceDir}/USER.md`)) _wfs(`${workspaceDir}/USER.md`, userContent, 'utf8');
      if (!_es(`${workspaceDir}/MEMORY.md`)) _wfs(`${workspaceDir}/MEMORY.md`, memoryContent, 'utf8');

      // 4. Update Supabase
      await sb.from('agents').update({
        provisioned: true,
        agent_id_short: agentIdShort,
        workspace_path: workspaceDir,
      }).eq('project_id', PROJECT_ID).eq('agent_key', agentKey);

      // Write brain_docs
      const docRows = [
        { project_id: PROJECT_ID, agent_key: agentKey, doc_type: 'soul', content: soulContent, updated_by: 'provisioner' },
        { project_id: PROJECT_ID, agent_key: agentKey, doc_type: 'user', content: userContent, updated_by: 'provisioner' },
        { project_id: PROJECT_ID, agent_key: agentKey, doc_type: 'memory_long', content: memoryContent, updated_by: 'provisioner' },
      ];
      await sb.from('brain_docs').upsert(docRows, { onConflict: 'project_id,agent_key,doc_type' });

      const result = { agentIdShort, workspaceDir, exitCode: 0 };
      await sb.from('agent_provision_requests').update({ status: 'done', result, completed_at: new Date().toISOString() }).eq('id', reqId);

      // Activity log
      try {
        await sb.from('activities').insert({
          project_id: PROJECT_ID,
          type: 'agent_provisioned',
          message: `Provisioned agent ${displayName} (${agentIdShort}) on executor`,
          actor_agent_key: 'agent:cron-mirror',
        });
      } catch { /* ignore */ }

    } catch (e) {
      const result = { agentIdShort, error: String(e?.message || e) };
      await sb.from('agent_provision_requests').update({ status: 'error', result, completed_at: new Date().toISOString() }).eq('id', reqId);
    }
  }

  return processed;
}

async function failStuckRequests({ table, maxAgeMs }) {
  // If a request sits in `queued` too long (e.g. transient Supabase/Cloudflare issues),
  // mark it as `error` so the UI doesn't show "pending" forever.
  const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await sb
    .from(table)
    .select('id,job_id,status,requested_at')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'queued')
    .lt('requested_at', cutoffIso)
    .order('requested_at', { ascending: true })
    .limit(25);
  if (error) throw error;

  const stuck = Array.isArray(data) ? data : [];
  if (stuck.length === 0) return 0;

  let n = 0;
  for (const req of stuck) {
    n++;
    const reqId = String(req.id);
    const jobId = String(req.job_id);

    const result = {
      jobId,
      error: `Request stuck in queued > ${Math.round(maxAgeMs / 1000)}s; marking as error so UI can recover.`,
      requestedAt: req.requested_at,
      detectedAt: new Date().toISOString(),
      executorBin: EXECUTOR_BIN,
    };

    const { error: updErr } = await sb.from(table).update({ status: 'error', result }).eq('id', reqId);
    if (updErr) throw updErr;

    // Best-effort: emit an activity row for visibility in the dashboard.
    try {
      await sb.from('activities').insert({
        project_id: PROJECT_ID,
        type: 'watchdog',
        message: `[cron-mirror] Marked stuck ${table} request as error (job ${jobId}, req ${reqId}).`,
        actor_agent_key: 'agent:cron-mirror',
      });
    } catch {
      // ignore
    }
  }

  return n;
}

async function main() { 
  console.log('[cron-mirror] starting', { PROJECT_ID, EXECUTOR_BIN });

  let lastMirrorOkAt = 0;

  try {
    const res = await mirrorCronList();
    console.log('[cron-mirror] initial mirror', res);
    lastMirrorOkAt = Date.now();
  } catch (e) {
    console.error('[cron-mirror] initial mirror failed', e);
  }

  let mirrorBackoffMs = 60_000;
  setInterval(async () => {
    try {
      const res = await mirrorCronList();
      if (res.changed) console.log('[cron-mirror] mirrored', res);
      lastMirrorOkAt = Date.now();
      mirrorBackoffMs = 60_000;
    } catch (e) {
      console.error('[cron-mirror] mirror failed', e);
      mirrorBackoffMs = Math.min(10 * 60_000, mirrorBackoffMs * 2);
    }
  }, 60_000);

  setInterval(async () => {
    try {
      const n = await processRunRequests();
      if (n > 0) console.log(`[cron-mirror] processed ${n} run request(s)`);
    } catch (e) {
      console.error('[cron-mirror] run request processing failed', e);
    }
  }, 10_000);

  setInterval(async () => {
    try {
      const n = await processDeleteRequests();
      if (n > 0) console.log(`[cron-mirror] processed ${n} delete request(s)`);
    } catch (e) {
      console.error('[cron-mirror] delete request processing failed', e);
    }
  }, 10_000);

  setInterval(async () => {
    try {
      const n = await processPatchRequests();
      if (n > 0) console.log(`[cron-mirror] processed ${n} patch request(s)`);
    } catch (e) {
      console.error('[cron-mirror] patch request processing failed', e);
    }
  }, 10_000);

  setInterval(async () => {
    try {
      const n = await processProvisionRequests();
      if (n > 0) console.log(`[cron-mirror] processed ${n} provision request(s)`);
    } catch (e) {
      console.error('[cron-mirror] provision request processing failed', e);
    }
  }, 10_000);

  // Fail stuck queued requests so the UI doesn't hang on "pending".
  setInterval(async () => {
    try {
      const maxAgeMs = 2 * 60_000;
      const n1 = await failStuckRequests({ table: 'cron_delete_requests', maxAgeMs });
      const n2 = await failStuckRequests({ table: 'cron_run_requests', maxAgeMs });
      const n3 = await failStuckRequests({ table: 'cron_job_patch_requests', maxAgeMs });
      const n4 = await failStuckRequests({ table: 'agent_provision_requests', maxAgeMs });
      const n = n1 + n2 + n3 + n4;
      if (n > 0) console.log(`[cron-mirror] failed ${n} stuck request(s)`);
    } catch (e) {
      console.error('[cron-mirror] stuck request watchdog failed', e);
    }
  }, 30_000);

  setInterval(() => {
    const age = lastMirrorOkAt ? Math.round((Date.now() - lastMirrorOkAt) / 1000) : null;
    console.log('[cron-mirror] alive', { lastMirrorOkSecondsAgo: age });
  }, 5 * 60_000);
}

main().catch((e) => {
  console.error('[cron-mirror] fatal', e);
  process.exit(1);
});
