import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, writeFile, stat, readdir, mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { execExecutor, resolveExecutorBin } from './executor.mjs';

const exec = promisify(_exec);

const PORT = Number(process.env.PORT || 3737);
const DEFAULT_WORKSPACE = process.env.CLAWD_WORKSPACE || '/Users/trunks/clawd';
const PROJECTS_FILE = process.env.CLAWD_PROJECTS_FILE || path.join(process.cwd(), 'projects.json');

let _supabase = null;
function getSupabase() {
  // Best-effort Supabase client for lightweight server-side logging.
  // Prefer a service role key (bypasses RLS) when available; fall back to anon.
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  if (_supabase) return _supabase;
  _supabase = createClient(url, key);
  return _supabase;
}

async function bumpSupabaseAgentLastActivity({ projectId, agentKey, whenIso }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    // Best-effort: try update first so we don't accidentally clobber state/note.
    const { data: updated, error: updErr } = await supabase
      .from('agent_status')
      .update({ last_activity_at: whenIso })
      .eq('project_id', projectId)
      .eq('agent_key', agentKey)
      .select('agent_key');

    if (updErr) {
      console.error('Supabase agent_status update (last_activity_at) failed:', updErr);
      return;
    }

    if ((updated || []).length > 0) return;

    // If the row doesn't exist yet, insert a minimal presence row.
    // NOTE: `state` is included for safety in case the DB has a NOT NULL constraint.
    const { error: upsertErr } = await supabase.from('agent_status').upsert(
      {
        project_id: projectId,
        agent_key: agentKey,
        state: 'idle',
        last_heartbeat_at: whenIso,
        last_activity_at: whenIso,
      },
      { onConflict: 'project_id,agent_key' }
    );

    if (upsertErr) {
      console.error('Supabase agent_status upsert (seed last_activity_at) failed:', upsertErr);
    }
  } catch (e) {
    console.error('Supabase agent_status bump threw:', e);
  }
}

async function logSupabaseActivity({ projectId, type, message, actor }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('activities').insert({
      project_id: projectId,
      type,
      message,
      actor_agent_key: actor || null,
    });

    if (error) {
      console.error('Supabase activity insert failed:', error);
      return;
    }

    // Keep presence fresh in Supabase-first builds when agents emit activity events.
    const agentKey = normalizeAgentKey(actor);
    if (agentKey) {
      await bumpSupabaseAgentLastActivity({
        projectId,
        agentKey,
        whenIso: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('Supabase activity insert threw:', e);
  }
}

async function upsertSupabaseAgentStatus({
  projectId,
  agentKey,
  state,
  note,
  lastHeartbeatAt,
  lastActivityAt,
  currentTaskId,
}) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const nowIso = new Date().toISOString();
    const heartbeatIso = lastHeartbeatAt || nowIso;
    const activityIso = lastActivityAt || nowIso;

    const { error } = await supabase.from('agent_status').upsert(
      {
        project_id: projectId,
        agent_key: agentKey,
        state: state || 'idle',
        note: note || null,
        current_task_id: currentTaskId || null,
        last_heartbeat_at: heartbeatIso,
        last_activity_at: activityIso,
      },
      { onConflict: 'project_id,agent_key' }
    );

    if (error) {
      console.error('Supabase agent_status upsert failed:', error);
    }
  } catch (e) {
    console.error('Supabase agent_status upsert threw:', e);
  }
}

let lastPresenceSyncMs = 0;
let lastSkillsSyncMs = 0;
let lastChannelsSyncMs = 0;

async function syncSkillsMirror(projectId, skills, throttleMs = 60_000) {
  const now = Date.now();
  if (now - lastSkillsSyncMs < throttleMs) return;
  lastSkillsSyncMs = now;
  try {
    const supabase = getSupabase();
    if (!supabase || skills.length === 0) return;
    const rows = skills.map(s => ({
      project_id: projectId,
      skill_id: s.id || s.name,
      name: s.name,
      description: s.description || '',
      version: s.version || '',
      installed: s.installed !== false,
      last_updated: s.lastUpdated || new Date().toISOString(),
      synced_at: new Date().toISOString(),
      extra_json: {
        emoji: s.emoji || null,
        eligible: s.eligible ?? true,
        disabled: s.disabled || false,
        blockedByAllowlist: s.blockedByAllowlist || false,
        missing: s.missing || null,
        source: s.source || null,
        homepage: s.homepage || null,
      },
    }));
    await supabase.from('skills_mirror').upsert(rows, { onConflict: 'project_id,skill_id' });
  } catch (e) {
    console.error('syncSkillsMirror failed (non-blocking):', e);
  }
}

async function syncChannelsMirror(projectId, channels, throttleMs = 60_000) {
  const now = Date.now();
  if (now - lastChannelsSyncMs < throttleMs) return;
  lastChannelsSyncMs = now;
  try {
    const supabase = getSupabase();
    if (!supabase || channels.length === 0) return;
    const rows = channels.map(ch => ({
      project_id: projectId,
      channel_id: ch.id,
      name: ch.name || ch.id,
      type: ch.type || 'messaging',
      status: ch.status || (ch.enabled !== false ? 'connected' : 'disconnected'),
      last_activity: ch.lastActivity || '',
      synced_at: new Date().toISOString(),
    }));
    await supabase.from('channels_mirror').upsert(rows, { onConflict: 'project_id,channel_id' });
  } catch (e) {
    console.error('syncChannelsMirror failed (non-blocking):', e);
  }
}

function normalizeAgentKey(raw) {
  const key = String(raw || '').trim();
  const parts = key.split(':');
  if (parts[0] === 'agent' && parts.length >= 3) {
    // Treat these as belonging to the base agent identity (agent:<name>:<kind>).
    return parts.slice(0, 3).join(':');
  }
  return '';
}

async function syncAgentPresenceFromSessions({ projectId, throttleMs = 30_000 }) {
  const now = Date.now();
  if (now - lastPresenceSyncMs < throttleMs) return;
  lastPresenceSyncMs = now;

  try {
        const { stdout } = await execExecutor('sessions --json --active 10080');
    const data = JSON.parse(stdout || '{"sessions": []}');

    const sessions = (data.sessions || []).map((s) => {
      const updatedAtIso = new Date(s.updatedAt || Date.now()).toISOString();
      return {
        key: s.key,
        agentKey: normalizeAgentKey(s.key),
        updatedAt: updatedAtIso,
      };
    });

    const byAgent = new Map();
    for (const s of sessions) {
      if (!s.agentKey) continue;
      const cur = byAgent.get(s.agentKey) || { count: 0, maxUpdatedAt: null };
      cur.count += 1;
      const t = Date.parse(s.updatedAt);
      if (!Number.isNaN(t)) {
        cur.maxUpdatedAt = cur.maxUpdatedAt === null ? t : Math.max(cur.maxUpdatedAt, t);
      }
      byAgent.set(s.agentKey, cur);
    }

    const heartbeatIso = new Date().toISOString();

    for (const [agentKey, info] of byAgent.entries()) {
      await upsertSupabaseAgentStatus({
        projectId,
        agentKey,
        state: info.count > 0 ? 'working' : 'idle',
        note: info.count > 0 ? `${info.count} active session(s)` : null,
        lastHeartbeatAt: heartbeatIso,
        lastActivityAt: info.maxUpdatedAt ? new Date(info.maxUpdatedAt).toISOString() : null,
      });
    }

    // Ensure main agent has a presence row even when idle.
    if (!byAgent.has('agent:main:main')) {
      await upsertSupabaseAgentStatus({
        projectId,
        agentKey: 'agent:main:main',
        state: 'idle',
        note: null,
        lastHeartbeatAt: heartbeatIso,
        lastActivityAt: null,
      });
    }
  } catch (e) {
    // Fail soft; status endpoint should still return.
    console.error('Agent presence sync (from /api/status) failed:', e);
  }
}

function loadProjectsSync() {
  try {
    const raw = readFileSync(PROJECTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.projects) ? data.projects : [];
  } catch {
    return [];
  }
}

function saveProjectsSync(projects) {
  const data = { projects };
  writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getSupabaseServerClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getProjectIdFromReq(req) {
  return (req.headers['x-clawdos-project'] || '').toString() || 'front-office';
}

function resolveWorkspace(projectId) {
  const projects = loadProjectsSync();
  const p = projects.find((x) => x.id === projectId);
  return p?.workspace || DEFAULT_WORKSPACE;
}

// ---- Mention extraction ----
// Matches @word and @agent:key:main forms, normalizes to short agent key, validates against known keys.
let _agentKeysCache = null;
let _agentKeysCacheMs = 0;
async function getKnownAgentKeys(projectId) {
  const now = Date.now();
  if (_agentKeysCache && now - _agentKeysCacheMs < 60_000) return _agentKeysCache;
  try {
    const sb = getSupabaseServerClient();
    if (!sb) return new Set();
    const { data } = await sb.from('agents').select('agent_key').eq('project_id', projectId);
    const keys = new Set();
    for (const row of data || []) {
      const parts = (row.agent_key || '').split(':');
      // Store short key (e.g. "ricky" from "agent:ricky:main")
      if (parts[0] === 'agent' && parts.length >= 2) keys.add(parts[1]);
      else if (row.agent_key) keys.add(row.agent_key);
    }
    _agentKeysCache = keys;
    _agentKeysCacheMs = now;
    return keys;
  } catch { return new Set(); }
}

function extractMentionKeys(text, knownAgentKeys) {
  if (!text || !knownAgentKeys || knownAgentKeys.size === 0) return [];
  const raw = [];
  const regex = /@([a-zA-Z0-9_:-]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) raw.push(match[1]);
  const normalized = raw.map(r => {
    const parts = r.split(':');
    return parts[0] === 'agent' && parts.length >= 2 ? parts[1] : r;
  });
  return [...new Set(normalized)].filter(k => knownAgentKeys.has(k));
}

async function insertMentions({ sb, projectId, mentionKeys, sourceType, sourceId, taskId, threadId, author, excerpt }) {
  if (!sb || !mentionKeys || mentionKeys.length === 0) return;
  try {
    const rows = mentionKeys.map(key => ({
      project_id: projectId,
      agent_key: key,
      source_type: sourceType,
      source_id: sourceId,
      task_id: taskId || null,
      thread_id: threadId || null,
      author: author || 'unknown',
      excerpt: excerpt ? String(excerpt).slice(0, 200) : null,
    }));
    await sb.from('mentions').upsert(rows, { onConflict: 'project_id,agent_key,source_type,source_id', ignoreDuplicates: true });
  } catch (e) {
    console.error('[mentions] insert failed (non-blocking):', e?.message || e);
  }
}

function buildHeartbeatInstructions({ agentKey, displayName, role }) {
  // Derive short key for mention API
  const parts = agentKey.split(':');
  const agentIdShort = parts.length >= 2 ? parts[1] : agentKey;

  return `@agent:${agentKey}

HEARTBEAT — You are ${displayName} (${role}).

Your goal: make the project better every hour with minimal noise.

BEFORE ACTING: Read the Context Pack injected above. Use project overview, shared priorities, and recent activity as your guide. Do NOT use long personal memory.

STEP 0 — CHECK @MENTIONS (do this first)
- GET /api/mentions?agent_key=${agentIdShort}&since=<your last cursor>
  (If you don't know your cursor, use a recent timestamp like 1 hour ago.)
- For each new mention:
  - If source_type = "task_event": respond via POST /api/tasks/:taskId/events
    with { event_type: "comment", content: "<your response>", author: "${agentKey}" }
  - If source_type = "chat_message": respond via POST /api/chat/post
    with { message: "<your response>", thread_id: <same thread_id or null>, author: "${agentKey}" }
  - Keep responses brief, helpful, and on-topic.
- After responding to all: POST /api/mentions/ack
  with { agent_key: "${agentIdShort}", last_seen_at: "<max created_at from mentions you processed>" }

STEP 1 — PROPOSE TASKS (Inbox)
- Check how many proposed tasks from you are still pending. If 3+ exist, propose 0-1 instead.
- Propose 1-3 small, concrete tasks with clear outputs.
- Each proposal must include "why now" and expected deliverable.
- POST /api/tasks/propose with { author: "${agentKey}", title, description, assignee_agent_key: "${agentKey}" }

STEP 2 — ASSIST AN ACTIVE TASK
- GET /api/tasks?status=assigned,in_progress,blocked,review&limit=30
- Pick 1 task matching your role (${role}) that you can meaningfully help with.
- POST /api/tasks/:taskId/events with { event_type: "comment", content: "<your contribution>", author: "${agentKey}" }
- Contributions: clarifying question, next step, risk/edge case, or "I can take this".
- If claiming ownership and role permits: POST /api/tasks/:taskId/assign with { assignee_agent_key: "${agentKey}" }

STEP 3 — WAR ROOM
- GET /api/chat/recent?limit=100 (bounded read, never request more).
- Contribute 0-2 messages MAX. Only if genuinely additive.
- Good: unblock someone, summarize progress, flag a risk, propose a micro-task.
- Bad: "checking in!", echoing what was just said, empty encouragement.
- POST /api/chat/post with { author: "${agentKey}", message: "<contribution>" }
- If nothing meaningful to say, say nothing.
- When proposing a task derived from war room discussion, include a
  "Context (war room)" section in the description with relevant message
  excerpts (max 5 messages, include timestamps).

STEP 4 — COMPLETE YOUR OWN WORK
- GET /api/tasks?status=in_progress,assigned&limit=30
- Filter for tasks where assignee_agent_key = "${agentKey}".
- For each task you own that has moved past "assigned": review progress, post an update, and if done, update status.
- POST /api/tasks/:taskId/status with { status: "done", author: "${agentKey}" } when complete.
- POST /api/tasks/:taskId/events with { event_type: "comment", content: "Completed: <summary>", author: "${agentKey}" }

ROLE-BASED GUIDANCE:
- Builder: propose implementable tasks, offer code patches, focus on shipping.
- QA: propose tests, edge cases, reproduction steps.
- PM/Operator: propose sequencing, acceptance criteria, progress summaries.
- Default to your role as defined in SOUL.md.

ANTI-SPAM RULES:
- Max 3 proposed tasks per heartbeat (fewer if many pending).
- Max 2 war room messages per heartbeat.
- If nothing is valuable, do nothing and exit quietly.`;
}

function resolveBrainRepo(workspace) {
  return process.env.CLAWD_BRAIN_REPO || workspace;
}

const ALLOW_ORIGIN = process.env.CLAWDOS_ALLOW_ORIGIN || '*';

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    // Needed so the browser can send the selected project id.
    'access-control-allow-headers': 'content-type,x-clawdos-project',
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { ok: false, error: 'not_found' });
}

async function safeStat(p) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

function filePathFor(workspace, type) {
  if (type === 'soul') return path.join(workspace, 'SOUL.md');
  if (type === 'user') return path.join(workspace, 'USER.md');
  if (type === 'memory_long') return path.join(workspace, 'MEMORY.md');
  if (type === 'memory_today') {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(workspace, 'memory', `${today}.md`);
  }
  return null;
}

async function readBodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function ensureParentDir(fp) {
  try {
    await mkdir(path.dirname(fp), { recursive: true });
  } catch {
    // ignore
  }
}

async function gitCommitFile(brainRepo, filePath, message) {
  // Commit edits into the brain repo for audit/rollback.
  // If there is nothing to commit, return null.
  const rel = path.relative(brainRepo, filePath);

  // Ensure file is inside the repo.
  if (rel.startsWith('..')) return null;

  try {
    await exec(`cd ${JSON.stringify(brainRepo)} && git add ${JSON.stringify(rel)}`);
    const status = await exec(`cd ${JSON.stringify(brainRepo)} && git status --porcelain ${JSON.stringify(rel)}`);
    if (!status.stdout.trim()) return null;

    await exec(`cd ${JSON.stringify(brainRepo)} && git commit -m ${JSON.stringify(message)} -- ${JSON.stringify(rel)}`);
    const head = await exec(`cd ${JSON.stringify(brainRepo)} && git rev-parse HEAD`);
    return head.stdout.trim();
  } catch (e) {
    // Don’t fail the whole request if commit fails; return error context.
    return { error: String(e?.message || e) };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': ALLOW_ORIGIN,
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        // Needed so the browser can send the selected project id.
        'access-control-allow-headers': 'content-type,x-clawdos-project',
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    const projectId = getProjectIdFromReq(req);
    const workspace = resolveWorkspace(projectId);
    const brainRepo = resolveBrainRepo(workspace);

    if (req.method === 'GET' && url.pathname === '/api/status') {
      let activeSessions = null;
      let mainSessions = null;

      try {
        const { stdout } = await execExecutor('sessions --json --active 10080');
        const data = JSON.parse(stdout || '{"count":0,"sessions":[]}');

        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        activeSessions = typeof data.count === 'number' ? data.count : sessions.length;

        // Tighten up "main" presence: previous versions marked main as working when *any* agent had
        // active sessions. Instead, compute the count attributable to agent:main:main.
        const mainKey = 'agent:main:main';
        mainSessions = sessions.filter((s) => normalizeAgentKey(s?.key) === mainKey).length;
      } catch {
        // ignore
      }

      // IMPORTANT: /api/status must never hang.
      // Supabase writes are best-effort and MUST be bounded by a short timeout.
      const withTimeout = async (p, ms) => {
        try {
          return await Promise.race([
            p,
            new Promise((resolve) => setTimeout(() => resolve(null), ms)),
          ]);
        } catch {
          return null;
        }
      };

      // Best-effort: keep agent presence fresh for the selected project.
      // `/api/status` is polled frequently by the UI, so throttle Supabase writes.
      void withTimeout(syncAgentPresenceFromSessions({ projectId, throttleMs: 30_000 }), 1500);

      // Always upsert main agent in case Supabase is empty or the sync is throttled.
      // Use per-agent session count when available.
      const mainActiveCount = typeof mainSessions === 'number' ? mainSessions : activeSessions;
      void withTimeout(
        upsertSupabaseAgentStatus({
          projectId,
          agentKey: 'agent:main:main',
          state: typeof mainActiveCount === 'number' && mainActiveCount > 0 ? 'working' : 'idle',
          note: typeof mainActiveCount === 'number' && mainActiveCount > 0 ? `${mainActiveCount} active session(s)` : null,
        }),
        1500
      );

      return sendJson(res, 200, {
        online: true,
        activeSessions,
        mainSessions,
        lastUpdated: new Date().toISOString(),
        port: PORT,
        environment: 'local',
        projectId,
        workspace,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const projects = loadProjectsSync();
      return sendJson(res, 200, projects);
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      // Create a new project workspace on disk + register in projects.json + Supabase (best effort).
      try {
        const body = await readBodyJson(req);
        const input = body.input || {};
        const id = String(input.id || '').trim();
        const name = String(input.name || id).trim();
        const tag = input.tag ? String(input.tag) : undefined;

        if (!id) return sendJson(res, 400, { ok: false, error: 'missing_project_id' });

        const root = process.env.CLAWD_PROJECTS_ROOT || '/Users/trunks/clawd-projects';
        const newWorkspace = path.join(root, id);

        // Create folder structure
        await exec(`mkdir -p ${JSON.stringify(path.join(newWorkspace, 'memory'))}`);

        // Seed files (minimal)
        const seedFiles = [
          { fp: path.join(newWorkspace, 'SOUL.md'), content: `# SOUL.md\n\nProject: ${name}\n` },
          { fp: path.join(newWorkspace, 'AGENTS.md'), content: `# AGENTS.md\n\nProject: ${name}\n` },
          { fp: path.join(newWorkspace, 'USER.md'), content: `# USER.md\n\nUser: Zack\n` },
          { fp: path.join(newWorkspace, 'MEMORY.md'), content: `# MEMORY.md\n\n` },
        ];

        for (const f of seedFiles) {
          if (!existsSync(f.fp)) writeFileSync(f.fp, f.content, 'utf8');
        }

        // Update local projects.json
        const projects = loadProjectsSync();
        if (!projects.find((p) => p.id === id)) {
          projects.push({ id, name, workspace: newWorkspace, tag });
          saveProjectsSync(projects);
        }

        // Register in Supabase (if configured). If this fails, fail the request so callers don't end up with broken FK refs.
        const sb = getSupabaseServerClient();
        if (sb) {
          // Some deployments may not have the optional `tag` column yet.
          {
            const { error: upsertErr } = await sb
              .from('projects')
              .upsert({ id, name, workspace_path: newWorkspace, tag: tag || null }, { onConflict: 'id' });
            if (upsertErr) {
              const msg = String(upsertErr?.message || upsertErr);
              if (msg.toLowerCase().includes("could not find the 'tag' column")) {
                const { error: retryErr } = await sb
                  .from('projects')
                  .upsert({ id, name, workspace_path: newWorkspace }, { onConflict: 'id' });
                if (retryErr) throw retryErr;
              } else {
                throw upsertErr;
              }
            }
          }
        }

        return sendJson(res, 200, { ok: true, project: { id, name, workspace: newWorkspace, tag } });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // DELETE /api/projects/:projectId — remove a project workspace + unregister (intended for test artifacts)
    const projectDeleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectDeleteMatch && req.method === 'DELETE') {
      try {
        const projectIdToDelete = decodeURIComponent(projectDeleteMatch[1]);
        if (!projectIdToDelete) return sendJson(res, 400, { ok: false, error: 'missing_project_id' });

        // Load from local projects.json and remove entry.
        const projects = loadProjectsSync();
        const idx = projects.findIndex((p) => p.id === projectIdToDelete);
        const proj = idx >= 0 ? projects[idx] : null;

        if (idx >= 0) {
          projects.splice(idx, 1);
          saveProjectsSync(projects);
        }

        // Delete workspace folder (best effort). Only delete if it lives under CLAWD_PROJECTS_ROOT.
        const root = process.env.CLAWD_PROJECTS_ROOT || '/Users/trunks/clawd-projects';
        const ws = proj?.workspace || path.join(root, projectIdToDelete);
        if (!path.resolve(ws).startsWith(path.resolve(root) + path.sep)) {
          return sendJson(res, 400, { ok: false, error: 'refusing_to_delete_outside_projects_root' });
        }

        try {
          await exec(`rm -rf ${JSON.stringify(ws)}`);
        } catch {
          // ignore
        }

        // Best-effort: delete from Supabase
        try {
          const sb = getSupabaseServerClient();
          if (sb) {
            await sb.from('projects').delete().eq('id', projectIdToDelete);
            await sb.from('project_settings').delete().eq('project_id', projectIdToDelete);
            await sb.from('tasks').delete().eq('project_id', projectIdToDelete);
            await sb.from('task_events').delete().eq('project_id', projectIdToDelete);
            await sb.from('project_chat_messages').delete().eq('project_id', projectIdToDelete);
            await sb.from('agents').delete().eq('project_id', projectIdToDelete);
          }
        } catch {
          // ignore
        }

        return sendJson(res, 200, { ok: true, id: projectIdToDelete });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      // Minimal v1: only the primary agent profile.
      let skillCount = null;
      try {
        const skillsDir = process.env.EXECUTOR_SKILLS_DIR || null;
        if (skillsDir) {
          const entries = await readdir(skillsDir, { withFileTypes: true });
          skillCount = entries.filter((e) => e.isDirectory()).length;
        }
      } catch {
        // ignore
      }

      return sendJson(res, 200, [
        {
          id: 'trunks',
          name: 'Trunks',
          role: 'Primary Agent',
          status: 'online',
          lastActive: 'now',
          skillCount,
          avatar: '⚡',
        },
      ]);
    }

    const agentFileMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/files\/(soul|user|memory_long|memory_today)$/);
    if (agentFileMatch && req.method === 'GET') {
      const [, agentId, type] = agentFileMatch;

      // Resolve workspace: trunks uses project workspace, others look up from Supabase
      let agentWorkspace = workspace;
      if (agentId !== 'trunks') {
        const sb = getSupabaseServerClient();
        if (sb) {
          const { data: agentRow } = await sb.from('agents')
            .select('workspace_path,agent_key')
            .eq('project_id', projectId)
            .or(`agent_key.eq.agent:${agentId}:main,agent_id_short.eq.${agentId}`)
            .maybeSingle();
          if (!agentRow?.workspace_path) {
            return sendJson(res, 404, { ok: false, error: 'agent_not_provisioned', hint: `Agent "${agentId}" has no workspace_path. Provision it first.` });
          }
          agentWorkspace = agentRow.workspace_path;
        } else {
          return sendJson(res, 404, { ok: false, error: 'cannot_resolve_agent_workspace' });
        }
      }

      const fp = filePathFor(agentWorkspace, type);
      if (!fp) return sendJson(res, 400, { ok: false, error: 'bad_type' });

      const st = await safeStat(fp);
      const content = st ? await readFile(fp, 'utf8') : '';
      return sendJson(res, 200, {
        type,
        content,
        lastModified: st ? st.mtime.toISOString() : new Date().toISOString(),
      });
    }

    if (agentFileMatch && req.method === 'POST') {
      const [, agentId, type] = agentFileMatch;

      // Resolve workspace: trunks uses project workspace, others look up from Supabase
      let agentWorkspace = workspace;
      let resolvedAgentKey = null;
      if (agentId !== 'trunks') {
        const sb = getSupabaseServerClient();
        if (sb) {
          const { data: agentRow } = await sb.from('agents')
            .select('workspace_path,agent_key')
            .eq('project_id', projectId)
            .or(`agent_key.eq.agent:${agentId}:main,agent_id_short.eq.${agentId}`)
            .maybeSingle();
          if (!agentRow?.workspace_path) {
            return sendJson(res, 404, { ok: false, error: 'agent_not_provisioned', hint: `Agent "${agentId}" has no workspace_path. Provision it first.` });
          }
          agentWorkspace = agentRow.workspace_path;
          resolvedAgentKey = agentRow.agent_key;
        } else {
          return sendJson(res, 404, { ok: false, error: 'cannot_resolve_agent_workspace' });
        }
      }

      const fp = filePathFor(agentWorkspace, type);
      if (!fp) return sendJson(res, 400, { ok: false, error: 'bad_type' });

      const body = await readBodyJson(req);
      const content = String(body.content ?? '');

      await ensureParentDir(fp);
      await writeFile(fp, content, 'utf8');

      const commit = await gitCommitFile(brainRepo, fp, `ClawdOS: update ${type}`);

      // Best-effort: mirror to Supabase brain_docs with correct agent_key
      const mirrorAgentKey = resolvedAgentKey || (agentId === 'trunks' ? null : `agent:${agentId}:main`);
      const mirrorSb = getSupabaseServerClient();
      if (mirrorSb) {
        try {
          await mirrorSb.from('brain_docs').upsert({
            project_id: projectId,
            agent_key: mirrorAgentKey,
            doc_type: type,
            content,
            updated_by: 'dashboard',
          }, { onConflict: 'project_id,agent_key,doc_type' });
        } catch (e) {
          console.error('[agent-file-write] brain_docs mirror failed:', e?.message || e);
        }
      }

      await logSupabaseActivity({
        projectId,
        type: 'brain_doc_updated',
        message: `Updated ${type}${commit && typeof commit === 'string' ? ` (${commit.slice(0, 7)})` : ''}`,
        actor: 'agent:ui:clawdos',
      });

      return sendJson(res, 200, { ok: true, commit });
    }

    // NOTE: GET /api/tasks is now handled in the Heartbeat v2 bridge section (reads from Supabase).
    // The old file-based GET /api/tasks has been replaced.

    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      try {
        const body = await readBodyJson(req);
        const input = body.input || {};
        const now = new Date().toISOString();
        const task = {
          id: `t_${Math.random().toString(36).slice(2, 10)}`,
          title: String(input.title || 'Untitled'),
          description: input.description ? String(input.description) : '',
          status: input.status || 'inbox',
          assigneeAgentKey: input.assigneeAgentKey || null,
          createdAt: now,
          updatedAt: now,
        };

        const fp = path.join(workspace, 'memory', 'tasks.json');
        await ensureParentDir(fp);
        const st = await safeStat(fp);
        const current = st ? JSON.parse(await readFile(fp, 'utf8')) : [];
        const next = Array.isArray(current) ? [task, ...current] : [task];
        await writeFile(fp, JSON.stringify(next, null, 2) + '\n', 'utf8');

        const commit = await gitCommitFile(brainRepo, fp, `ClawdOS: create task ${task.id}`);
        return sendJson(res, 200, { ok: true, task, commit });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const taskUpdateMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskUpdateMatch && req.method === 'POST') {
      const [, taskId] = taskUpdateMatch;
      // Reserved routes handled elsewhere
      if (taskId === 'propose') {
        // fall through so /api/tasks/propose can be handled by the dashboard bridge
      } else {

      try {
        const body = await readBodyJson(req);
        const patch = body.patch || {};
        const fp = path.join(workspace, 'memory', 'tasks.json');
        await ensureParentDir(fp);
        const st = await safeStat(fp);
        const current = st ? JSON.parse(await readFile(fp, 'utf8')) : [];
        const arr = Array.isArray(current) ? current : [];
        const now = new Date().toISOString();
        const next = arr.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            ...patch,
            updatedAt: now,
          };
        });
        await writeFile(fp, JSON.stringify(next, null, 2) + '\n', 'utf8');
        const commit = await gitCommitFile(brainRepo, fp, `ClawdOS: update task ${taskId}`);
        return sendJson(res, 200, { ok: true, commit });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/skills') {
      try {
        let skills = [];

        // Strategy 1: OpenClaw CLI (preferred — works out of the box)
        try {
          const { stdout } = await execExecutor('skills list --json');
          const parsed = JSON.parse(stdout || '{}');
          const list = parsed.skills || (Array.isArray(parsed) ? parsed : []);
          if (list.length > 0) {
            skills = list.map(s => ({
              id: s.name || s.id,
              name: s.name || s.id,
              slug: s.slug || s.name || s.id,
              description: s.description || '',
              version: s.version || 'installed',
              installed: true,
              lastUpdated: s.lastUpdated || new Date().toISOString(),
              // Rich metadata from OpenClaw CLI
              emoji: s.emoji || undefined,
              eligible: s.eligible !== undefined ? s.eligible : true,
              disabled: s.disabled || false,
              blockedByAllowlist: s.blockedByAllowlist || false,
              missing: s.missing || undefined,
              source: s.source || 'bundled',
              homepage: s.homepage || undefined,
            }));
          }
        } catch { /* CLI doesn't support skills list, fall through */ }

        // Strategy 2: Directory scan (fallback)
        if (skills.length === 0) {
          const dirs = [
            process.env.EXECUTOR_SKILLS_DIR,
            '/opt/homebrew/lib/node_modules/openclaw/skills',
            '/opt/homebrew/lib/node_modules/clawdbot/skills',
          ].filter(Boolean);

          for (const skillsDir of dirs) {
            try {
              const entries = await readdir(skillsDir, { withFileTypes: true });
              for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                const skillName = ent.name;
                const fp = path.join(skillsDir, skillName, 'SKILL.md');
                const st = await safeStat(fp);
                if (!st) continue;
                const content = await readFile(fp, 'utf8');
                const firstLines = content.split('\n').slice(0, 40).join('\n');
                const descMatch = firstLines.match(/description:\s*(.*)/);
                const desc = descMatch ? descMatch[1].trim() : '';
                const emojiMatch = firstLines.match(/emoji:\s*(.*)/);
                const emoji = emojiMatch ? emojiMatch[1].trim() : undefined;
                skills.push({
                  id: skillName,
                  name: skillName,
                  slug: skillName,
                  description: desc,
                  version: 'local',
                  installed: true,
                  lastUpdated: st.mtime.toISOString(),
                  emoji,
                  eligible: true,
                  source: 'local',
                });
              }
              if (skills.length > 0) break;
            } catch { /* directory not found, try next */ }
          }
        }

        // Best-effort: sync to Supabase mirror (with extra_json)
        syncSkillsMirror(projectId, skills);

        return sendJson(res, 200, skills);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/skills/install') {
      try {
        const body = await readBodyJson(req);
        const identifier = String(body.identifier || '').trim();
        if (!identifier) return sendJson(res, 400, { ok: false, error: 'missing_identifier' });

        // Sanitize: only allow alphanumeric, hyphens, underscores, slashes, dots, colons, @
        if (!/^[@a-zA-Z0-9._\-/:]+$/.test(identifier)) {
          return sendJson(res, 400, { ok: false, error: 'invalid_identifier' });
        }

        const { stdout, stderr } = await execExecutor(`skill install ${identifier}`, { timeout: 120_000 });
        return sendJson(res, 200, { ok: true, output: stdout || stderr });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/channels') {
      try {
        let channels = [];
        const configPath = path.join(
          process.env.HOME || '/root',
          '.openclaw',
          'openclaw.json'
        );
        const st = await safeStat(configPath);
        if (st) {
          const raw = await readFile(configPath, 'utf8');
          const config = JSON.parse(raw);
          const channelsMap = config.channels || {};
          channels = Object.entries(channelsMap).map(([id, cfg]) => ({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            type: 'messaging',
            enabled: cfg.enabled !== false,
            status: cfg.enabled !== false ? 'connected' : 'disconnected',
            lastActivity: '',
            includeAttachments: cfg.includeAttachments || false,
            mediaMaxMb: cfg.mediaMaxMb || null,
            dmPolicy: cfg.dmPolicy || null,
            groupPolicy: cfg.groupPolicy || null,
          }));
        }

        // Best-effort: sync to Supabase mirror
        syncChannelsMirror(projectId, channels);

        return sendJson(res, 200, channels);
      } catch (err) {
        return sendJson(res, 200, []); // Graceful empty on error
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      try {
        const { stdout } = await execExecutor('sessions --json --active 10080');
        const data = JSON.parse(stdout || '{"sessions": []}');

        const normalizeAgentKey = (raw) => {
          const key = String(raw || '').trim();
          const parts = key.split(':');
          if (parts[0] === 'agent' && parts.length >= 3) {
            // Treat these as belonging to the base agent identity (agent:<name>:<kind>).
            return parts.slice(0, 3).join(':');
          }
          return '';
        };

        const sessions = (data.sessions || []).map((s) => {
          const updatedAtIso = new Date(s.updatedAt || Date.now()).toISOString();
          return {
            id: s.sessionId || s.key,
            key: s.key,
            agentKey: normalizeAgentKey(s.key),
            kind: s.kind,
            status: s.abortedLastRun ? 'error' : 'active',
            startedAt: new Date(Date.now() - (s.ageMs || 0)).toISOString(),
            updatedAt: updatedAtIso,
            model: s.model,
            totalTokens: s.totalTokens,
          };
        });

        // Best-effort: keep agent_status in sync with real session activity.
        // This powers the Dashboard presence UI (ONLINE/WORKING, last seen).
        try {
          const byAgent = new Map();
          for (const s of sessions) {
            if (!s.agentKey) continue;
            const cur = byAgent.get(s.agentKey) || { count: 0, maxUpdatedAt: null };
            cur.count += 1;
            const t = Date.parse(s.updatedAt);
            if (!Number.isNaN(t)) {
              cur.maxUpdatedAt = cur.maxUpdatedAt === null ? t : Math.max(cur.maxUpdatedAt, t);
            }
            byAgent.set(s.agentKey, cur);
          }

          const heartbeatIso = new Date().toISOString();

          // Upsert presence for any agent keys we can infer from session keys.
          // Keeps the dashboard accurate when multiple agents are running.
          for (const [agentKey, info] of byAgent.entries()) {
            await upsertSupabaseAgentStatus({
              projectId,
              agentKey,
              state: info.count > 0 ? 'working' : 'idle',
              note: info.count > 0 ? `${info.count} active session(s)` : null,
              lastHeartbeatAt: heartbeatIso,
              lastActivityAt: info.maxUpdatedAt ? new Date(info.maxUpdatedAt).toISOString() : null,
            });
          }

          // Also ensure the main agent has a presence row even if it currently has no active sessions.
          if (!byAgent.has('agent:main:main')) {
            await upsertSupabaseAgentStatus({
              projectId,
              agentKey: 'agent:main:main',
              state: 'idle',
              note: null,
              lastHeartbeatAt: heartbeatIso,
              lastActivityAt: null,
            });
          }
        } catch (e) {
          console.error('Agent presence sync (from /api/sessions) failed:', e);
        }

        return sendJson(res, 200, sessions);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/cron/consistency') {
      try {
        const projectId = getProjectIdFromReq(req);
        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        // Control API (gateway) view
        let control = { ok: false, jobs: 0, error: null };
        try {
          const { stdout } = await execExecutor('cron list --json --timeout 15000', { timeout: 20000 });
          const parsed = JSON.parse(stdout || '{}');
          const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : (Array.isArray(parsed) ? parsed : []);
          control = { ok: true, jobs: jobs.length, error: null };
        } catch (e) {
          control = { ok: false, jobs: 0, error: String(e?.message || e) };
        }

        // Mirror view
        let mirror = { ok: true, jobs: 0, lastSuccessAt: null };
        try {
          const { count, error } = await sb
            .from('cron_mirror')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .neq('id', '__mirror_state__');
          if (error) throw error;
          mirror.jobs = Number(count || 0);
        } catch (e) {
          mirror.ok = false;
        }

        try {
          const { data } = await sb
            .from('cron_mirror')
            .select('id,updated_at,metadata')
            .eq('project_id', projectId)
            .eq('id', '__mirror_state__')
            .maybeSingle();
          if (data?.metadata?.lastSuccessAt) mirror.lastSuccessAt = data.metadata.lastSuccessAt;
          if (!mirror.lastSuccessAt && data?.updated_at) mirror.lastSuccessAt = data.updated_at;
        } catch {
          // ignore
        }

        const maxAgeMin = Number(url.searchParams.get('max_age_min') || process.env.CLAWDOS_CRON_MIRROR_MAX_AGE_MIN || '10');
        const lastSuccessMs = mirror.lastSuccessAt ? Date.parse(String(mirror.lastSuccessAt)) : null;
        const stale = lastSuccessMs ? (Date.now() - lastSuccessMs) > maxAgeMin * 60_000 : true;

        const mismatch = control.ok && mirror.ok ? (control.jobs !== mirror.jobs) : null;
        return sendJson(res, 200, { ok: true, control, mirror, stale, mismatch, maxAgeMin });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/cron') {
      try {
        // Cron list can take longer than the default gateway timeout.
        const { stdout } = await execExecutor('cron list --json --timeout 60000', { timeout: 65000 });
        const data = JSON.parse(stdout || '{"jobs": []}');
        const jobs = (data.jobs || []).map((j) => {
          const nextRunAtMs =
            (typeof j?.state?.nextRunAtMs === 'number' ? j.state.nextRunAtMs : null) ??
            (typeof j.nextRunAtMs === 'number' ? j.nextRunAtMs : null) ??
            (typeof j.nextRunAt === 'number' ? j.nextRunAt : null);

          // Normalize schedule into simple fields the UI can reliably display.
          const sch = j?.schedule;
          let scheduleKind = null;
          let scheduleExpr = null;
          let tz = null;
          if (sch && typeof sch === 'object') {
            scheduleKind = sch.kind || null;
            if (sch.kind === 'cron') {
              scheduleExpr = sch.expr || '';
              tz = sch.tz || null;
            } else if (sch.kind === 'every') {
              scheduleExpr = typeof sch.everyMs === 'number' ? String(sch.everyMs) : (sch.everyMs ? String(sch.everyMs) : '');
            }
          }

          const payload = j?.payload || {};
          const instructions =
            (typeof payload.message === 'string' && payload.message) ||
            (typeof payload.text === 'string' && payload.text) ||
            (typeof j.text === 'string' && j.text) ||
            (typeof j.instructions === 'string' && j.instructions) ||
            '';

          // Normalize target agent: extract from instructions or default to main
          let targetAgentKey = null;
          if (instructions) {
            const agentMatch = instructions.match(/@agent:([a-zA-Z0-9_:-]+)/);
            if (agentMatch) {
              targetAgentKey = agentMatch[0].startsWith('@') ? agentMatch[0].slice(1) : agentMatch[0];
              // Normalize: ensure it starts with "agent:"
              if (!targetAgentKey.startsWith('agent:')) targetAgentKey = `agent:${targetAgentKey}`;
            }
          }
          if (!targetAgentKey) targetAgentKey = 'agent:main:main';

          return {
            id: j.id || j.jobId || j.name,
            name: j.name || j.id,
            enabled: j.enabled !== false,
            scheduleKind,
            scheduleExpr,
            tz,
            nextRun: j.nextRun || (nextRunAtMs ? new Date(Number(nextRunAtMs)).toISOString() : ''),
            nextRunAtMs,
            lastRunStatus: j?.state?.lastStatus || null,
            instructions,
            targetAgentKey,
          };
        });
        return sendJson(res, 200, jobs);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const cronToggleMatch = url.pathname.match(/^\/api\/cron\/([^/]+)\/(toggle|enable|disable)$/);
    if (cronToggleMatch && req.method === 'POST') {
      const [, jobId, action] = cronToggleMatch;
      try {
        if (action === 'enable') {
          await execExecutor(`cron enable ${JSON.stringify(jobId)} --timeout 60000`);
          return sendJson(res, 200, { ok: true, enabled: true });
        }
        if (action === 'disable') {
          await execExecutor(`cron disable ${JSON.stringify(jobId)} --timeout 60000`);
          return sendJson(res, 200, { ok: true, enabled: false });
        }

        // toggle: expects JSON body { enabled: boolean }
        const body = await readBodyJson(req);
        const enabled = Boolean(body.enabled);
        await execExecutor(`cron ${enabled ? 'enable' : 'disable'} ${JSON.stringify(jobId)} --timeout 60000`);
        return sendJson(res, 200, { ok: true, enabled });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const cronRunsMatch = url.pathname.match(/^\/api\/cron\/([^/]+)\/runs$/);
    if (cronRunsMatch && req.method === 'GET') {
      const [, jobId] = cronRunsMatch;
      try {
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '25')));
        const { stdout } = await execExecutor(
          `cron runs --id ${JSON.stringify(jobId)} --limit ${JSON.stringify(String(limit))} --timeout 60000`
        );
        const data = JSON.parse(stdout || '{"entries": []}');
        return sendJson(res, 200, data);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const cronRunMatch = url.pathname.match(/^\/api\/cron\/([^/]+)\/run$/);
    if (cronRunMatch && req.method === 'POST') {
      const [, jobId] = cronRunMatch;
      try {
        const projectId = getProjectIdFromReq(req);
        await logSupabaseActivity({
          projectId,
          type: 'cron_run_requested',
          message: `Requested cron run: ${jobId}`,
          actor: 'agent:main:main',
        });

        await execExecutor(`cron run ${JSON.stringify(jobId)} --timeout 60000`);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const cronEditMatch = url.pathname.match(/^\/api\/cron\/([^/]+)\/edit$/);
    if (cronEditMatch && req.method === 'POST') {
      const [, jobId] = cronEditMatch;
      try {
        // Body supports: { name?, schedule?, scheduleKind?, instructions?, enabled? }
        const body = await readBodyJson(req);
        const args = [];

        if (typeof body.name === 'string' && body.name.trim()) {
          args.push('--name', body.name.trim());
        }

        if (typeof body.schedule === 'string' && body.schedule.trim()) {
          // Determine whether this is a cron expression or an interval (every) value
          const scheduleKind = body.scheduleKind || ((/^\d+$/.test(body.schedule.trim())) ? 'every' : 'cron');
          if (scheduleKind === 'every') {
            args.push('--every', body.schedule.trim());
          } else {
            args.push('--cron', body.schedule.trim());
          }
        }

        if (typeof body.instructions === 'string') {
          // We map UI "instructions" to the cron job's systemEvent payload.
          // This preserves the v1 mental model: "instructions" are what the job does.
          args.push('--system-event', body.instructions);
        }

        if (typeof body.enabled === 'boolean') {
          args.push(body.enabled ? '--enable' : '--disable');
        }

        const cmdArgs =
          `cron edit ${JSON.stringify(jobId)} ` +
          args.map((a) => (a.startsWith('--') ? a : JSON.stringify(a))).join(' ') +
          ' --timeout 60000';

        await execExecutor(cmdArgs);

        // Best-effort: immediately upsert changed fields into cron_mirror
        // so the UI updates via realtime instead of waiting for the next mirror cycle.
        try {
          const supabase = getSupabase();
          if (supabase) {
            const projectId = getProjectIdFromReq(req);
            const partial = {};
            if (typeof body.name === 'string' && body.name.trim()) partial.name = body.name.trim();
            if (typeof body.instructions === 'string') partial.instructions = body.instructions;
            if (typeof body.enabled === 'boolean') partial.enabled = body.enabled;
            // Normalize target agent key — never leave null
            if (body.targetAgentKey) {
              partial.target_agent_key = body.targetAgentKey;
            }
            if (Object.keys(partial).length > 0) {
              await supabase
                .from('cron_mirror')
                .update(partial)
                .eq('project_id', projectId)
                .eq('job_id', jobId);
            }
          }
        } catch (mirrorErr) {
          console.error('[cron edit] best-effort mirror upsert failed:', mirrorErr);
        }

        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/activity') {
      // Lightweight endpoint for writing a Supabase activity row.
      // Useful for build updates, brain-doc sync, etc.
      try {
        const body = await readBodyJson(req);
        const type = typeof body?.type === 'string' ? body.type.trim() : '';
        const message = typeof body?.message === 'string' ? body.message.trim() : '';
        const actor = typeof body?.actor === 'string' ? body.actor.trim() : null;

        if (!type || !message) {
          return sendJson(res, 400, { ok: false, error: 'Missing required fields: type, message' });
        }

        const projectId = getProjectIdFromReq(req);
        await logSupabaseActivity({ projectId, type, message, actor });
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/activity/global') {
      // Global activity bell: cross-project activities (Supabase only).
      // Requires service role key because RLS typically prevents anon cross-project reads.
      try {
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') || '10')));
        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 200, []);

        const [{ data: acts, error: actErr }, { data: projs, error: projErr }] = await Promise.all([
          sb
            .from('activities')
            .select('id,project_id,type,message,actor_agent_key,task_id,created_at')
            .order('created_at', { ascending: false })
            .limit(limit),
          sb
            .from('projects')
            .select('id,name')
            .order('created_at', { ascending: true }),
        ]);

        if (actErr) {
          console.error('Supabase global activities fetch failed:', actErr);
          return sendJson(res, 200, []);
        }

        if (projErr) {
          console.error('Supabase projects fetch failed:', projErr);
        }

        const nameById = new Map((projs || []).map((p) => [p.id, p.name]));

        const items = (acts || []).map((row) => ({
          id: row.id,
          projectId: row.project_id,
          projectName: nameById.get(row.project_id) || row.project_id,
          type: row.type,
          message: row.message,
          actor: row.actor_agent_key || '',
          taskId: row.task_id,
          createdAt: row.created_at,
        }));

        return sendJson(res, 200, items);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/activity') {
      // Activity feed:
      // - Prefer Supabase `activities` (when configured) so cron runs, build updates, and doc edits show up.
      // - Always merge in recent git commits as a fallback + extra signal.
      try {
        const items = [];

        // 1) Supabase activities (best effort)
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data, error } = await supabase
              .from('activities')
              .select('id,type,message,actor_agent_key,task_id,created_at')
              .eq('project_id', projectId)
              .order('created_at', { ascending: false })
              .limit(50);

            if (error) {
              console.error('Supabase activities fetch failed:', error);
            } else {
              for (const row of data || []) {
                items.push({
                  hash: `sb:${row.id}`,
                  author: row.actor_agent_key || '',
                  authorLabel: row.actor_agent_key || '',
                  date: row.created_at,
                  message: row.message,
                  type: row.type,
                  taskId: row.task_id,
                });
              }
            }
          }
        } catch (e) {
          console.error('Supabase activities fetch threw:', e);
        }

        // 2) Git commits (fallback + extra activity signal)
        try {
          const { stdout } = await exec(
            `cd ${JSON.stringify(brainRepo)} && git log -n 25 --pretty=format:%H%x09%an%x09%ad%x09%s --date=iso-strict`
          );
          const commits = (stdout || '')
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              const [hash, author, date, ...msgParts] = line.split('\t');
              return {
                hash,
                author,
                authorLabel: author,
                date,
                message: msgParts.join('\t'),
                type: 'commit',
              };
            });
          items.push(...commits);
        } catch {
          // ignore
        }

        // Sort newest-first and cap.
        items.sort((a, b) => (a.date < b.date ? 1 : -1));
        return sendJson(res, 200, items.slice(0, 50));
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/restart') {
      // Restart the gateway (best effort). If this fails, report the error.
      try {
        await execExecutor('gateway restart');
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // GET /api/executor-check — non-destructive smoke test
    if (req.method === 'GET' && url.pathname === '/api/executor-check') {
      const result = { binary: null, version: null, checks: {} };
      try {
        const bin = await resolveExecutorBin();
        result.binary = bin;
      } catch (e) {
        result.checks.resolve = { ok: false, error: e.message };
        return sendJson(res, 200, result);
      }

      // --version
      try {
        const { stdout } = await execExecutor('--version', { timeout: 10000 });
        result.version = stdout.trim();
        result.checks.version = { ok: true, output: stdout.trim() };
      } catch (e) {
        result.checks.version = { ok: false, error: String(e?.message || e) };
      }

      // sessions (minimal, read-only)
      try {
        await execExecutor('sessions --json --active 1', { timeout: 10000 });
        result.checks.sessions = { ok: true };
      } catch (e) {
        result.checks.sessions = { ok: false, error: String(e?.message || e) };
      }

      // cron list (read-only)
      try {
        await execExecutor('cron list --json --timeout 10000', { timeout: 15000 });
        result.checks.cron = { ok: true };
      } catch (e) {
        result.checks.cron = { ok: false, error: String(e?.message || e) };
      }

      return sendJson(res, 200, result);
    }

    // ============= Chat Delivery (Operator Chat) =============

    // POST /api/chat/deliver — deliver a chat message to an OpenClaw agent and write the reply back to Supabase
    // NOTE: This is the "direct mode" path. When Control API is unreachable, the UI falls back to chat_delivery_queue.
    if (req.method === 'POST' && url.pathname === '/api/chat/deliver') {
      try {
        const projectId = getProjectIdFromReq(req);
        const body = await readBodyJson(req);
        const messageId = String(body.message_id || body.messageId || '').trim();
        const targetAgentKey = String(body.target_agent_key || body.targetAgentKey || '').trim();
        const message = String(body.message || '').trim();

        if (!messageId) return sendJson(res, 400, { ok: false, error: 'missing_message_id' });
        if (!targetAgentKey) return sendJson(res, 400, { ok: false, error: 'missing_target_agent_key' });
        if (!message) return sendJson(res, 400, { ok: false, error: 'missing_message' });

        // Derive OpenClaw agent id from agent_key (e.g. "agent:ricky:main" -> "ricky")
        const parts = targetAgentKey.split(':');
        const agentIdShort = parts.length >= 2 ? parts[1] : targetAgentKey;

        const sb = getSupabaseServerClient();
        if (!sb) {
          return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });
        }

        // Fetch the original chat message so we can reply into the same thread.
        const { data: originalMsg, error: fetchErr } = await sb
          .from('project_chat_messages')
          .select('id,thread_id')
          .eq('project_id', projectId)
          .eq('id', messageId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        const threadId = originalMsg?.thread_id || null;

        // Deterministic session id so DMs stay coherent.
        const sessionId = `clawdos:${projectId}:${threadId || targetAgentKey}`;

        // If this workspace still has BOOTSTRAP.md, disable it so the agent doesn't keep asking onboarding questions.
        try {
          const homedir = process.env.HOME || '/Users/trunks';
          const bootstrapPath = path.join(homedir, '.openclaw', `workspace-${agentIdShort}`, 'BOOTSTRAP.md');
          if (existsSync(bootstrapPath)) {
            const disabled = path.join(homedir, '.openclaw', `workspace-${agentIdShort}`, 'BOOTSTRAP.disabled.md');
            try {
              // Rename preserves the file for debugging but keeps it out of injection list.
              // (OpenClaw injects BOOTSTRAP.md specifically.)
              await exec(`mv ${JSON.stringify(bootstrapPath)} ${JSON.stringify(disabled)}`);
            } catch {
              // If mv fails for any reason, try delete.
              try { writeFileSync(bootstrapPath, '', 'utf8'); } catch {}
            }
          }
        } catch {
          // non-fatal
        }

        // Run an agent turn via the Gateway. Hard timeout so this endpoint can't hang forever.
        let stdout = '';
        try {
          const r = await execExecutor(
            `agent --agent ${JSON.stringify(agentIdShort)} --session-id ${JSON.stringify(sessionId)} --channel last --message ${JSON.stringify(message)} --json --timeout 120`,
            { timeout: 140000 }
          );
          stdout = r.stdout || '';
        } catch (e) {
          // Fail soft, but return a useful error.
          const msg = String(e?.message || e);
          await sb.from('activities').insert({
            project_id: projectId,
            type: 'chat_delivery_failed',
            message: `Direct chat delivery failed for ${targetAgentKey}: ${msg}`,
            actor_agent_key: 'agent:control-api:system',
          });
          return sendJson(res, 500, { ok: false, error: msg });
        }

        // Extract reply text from JSON (only return the actual message payloads, not the full run report).
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
          // Not JSON; keep raw stdout.
          replyText = '';
        }
        if (!replyText) replyText = String(stdout || '').trim();

        // Write the agent response back into chat messages.
        const { error: insErr } = await sb.from('project_chat_messages').insert({
          project_id: projectId,
          thread_id: threadId,
          author: targetAgentKey,
          target_agent_key: null,
          message: replyText || '(no reply)',
        });
        if (insErr) throw insErr;

        // Best-effort presence bump
        await bumpSupabaseAgentLastActivity({ projectId, agentKey: targetAgentKey, whenIso: new Date().toISOString() });

        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // ============= Agent → Dashboard Bridge (Control API) =============

    // ---- READ ENDPOINTS (Heartbeat v2) ----

    // GET /api/tasks — list tasks from Supabase (scoped to project)
    // Query params: status (comma-separated), limit (default 50), updated_since (ISO)
    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      try {
        const projectId = getProjectIdFromReq(req);
        const sb = getSupabaseServerClient();

        if (sb) {
          const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));
          let query = sb
            .from('tasks')
            .select('id,title,status,assignee_agent_key,is_proposed,description,updated_at,created_at')
            .eq('project_id', projectId)
            .order('updated_at', { ascending: false })
            .limit(limit);

          const statusParam = url.searchParams.get('status');
          if (statusParam) {
            const statuses = statusParam.split(',').map(s => s.trim()).filter(Boolean);
            if (statuses.length === 1) {
              query = query.eq('status', statuses[0]);
            } else if (statuses.length > 1) {
              query = query.in('status', statuses);
            }
          }

          const updatedSince = url.searchParams.get('updated_since');
          if (updatedSince) {
            query = query.gte('updated_at', updatedSince);
          }

          const { data, error } = await query;
          if (error) throw error;
          return sendJson(res, 200, { tasks: data || [] });
        }

        // Fallback: file-based tasks.json
        const fp = path.join(workspace, 'memory', 'tasks.json');
        const st = await safeStat(fp);
        if (!st) return sendJson(res, 200, { tasks: [] });
        const raw = await readFile(fp, 'utf8');
        const data = JSON.parse(raw || '[]');
        return sendJson(res, 200, { tasks: Array.isArray(data) ? data : [] });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // GET /api/tasks/:taskId/events — read recent task_events for a task
    const taskEventsGetMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/events$/);
    if (taskEventsGetMatch && req.method === 'GET') {
      try {
        const projectId = getProjectIdFromReq(req);
        const taskId = decodeURIComponent(taskEventsGetMatch[1]);
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const { data, error } = await sb
          .from('task_events')
          .select('id,event_type,author,content,metadata,created_at')
          .eq('project_id', projectId)
          .eq('task_id', taskId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return sendJson(res, 200, { events: data || [] });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // GET /api/chat/recent — read recent war-room / thread messages
    if (req.method === 'GET' && url.pathname === '/api/chat/recent') {
      try {
        const projectId = getProjectIdFromReq(req);
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));
        const threadIdParam = url.searchParams.get('thread_id') || '';

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        let query = sb
          .from('project_chat_messages')
          .select('id,author,message,thread_id,created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (threadIdParam) {
          query = query.eq('thread_id', threadIdParam);
        } else {
          // War room = null thread_id (general channel)
          query = query.is('thread_id', null);
        }

        const { data, error } = await query;
        if (error) throw error;
        return sendJson(res, 200, { messages: data || [] });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // ---- WRITE ENDPOINTS (Heartbeat v2) ----

    // POST /api/tasks/:taskId/assign — update task assignment
    const taskAssignMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/assign$/);
    if (taskAssignMatch && req.method === 'POST') {
      try {
        const projectId = getProjectIdFromReq(req);
        const taskId = decodeURIComponent(taskAssignMatch[1]);
        const body = await readBodyJson(req);
        const assigneeAgentKey = String(body.assignee_agent_key || '').trim();
        const author = String(body.author || assigneeAgentKey || 'dashboard').trim();

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        // Get current assignee for the event metadata
        const { data: currentTask } = await sb
          .from('tasks')
          .select('assignee_agent_key')
          .eq('id', taskId)
          .eq('project_id', projectId)
          .maybeSingle();

        const { error: updErr } = await sb
          .from('tasks')
          .update({ assignee_agent_key: assigneeAgentKey || null, updated_at: new Date().toISOString() })
          .eq('id', taskId)
          .eq('project_id', projectId);

        if (updErr) throw updErr;

        // Emit assignment_change event
        try {
          await sb.from('task_events').insert({
            project_id: projectId,
            task_id: taskId,
            event_type: 'assignment_change',
            author,
            content: `Assigned to ${assigneeAgentKey || '(unassigned)'}`,
            metadata: {
              old_assignee: currentTask?.assignee_agent_key || null,
              new_assignee: assigneeAgentKey || null,
            },
          });
        } catch { /* best effort */ }

        await bumpSupabaseAgentLastActivity({ projectId, agentKey: author, whenIso: new Date().toISOString() });

        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/tasks/:taskId/status — update task status
    const taskStatusMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
    if (taskStatusMatch && req.method === 'POST') {
      try {
        const projectId = getProjectIdFromReq(req);
        const taskId = decodeURIComponent(taskStatusMatch[1]);
        const body = await readBodyJson(req);
        const newStatus = String(body.status || '').trim();
        const author = String(body.author || 'dashboard').trim();

        if (!newStatus) return sendJson(res, 400, { ok: false, error: 'missing_status' });

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        // Get current status for event metadata
        const allowedStatuses = new Set(['inbox', 'assigned', 'in_progress', 'review', 'blocked', 'stopped', 'done']);
        if (!allowedStatuses.has(newStatus)) {
          return sendJson(res, 400, { ok: false, error: 'invalid_status', allowed: Array.from(allowedStatuses) });
        }

        const { data: currentTask } = await sb
          .from('tasks')
          .select('status')
          .eq('id', taskId)
          .eq('project_id', projectId)
          .maybeSingle();

        if (!currentTask) return sendJson(res, 404, { ok: false, error: 'task_not_found' });

        // Minimal invariant: don't resurrect completed tasks without a deliberate operator action.
        if (String(currentTask.status || '').trim() === 'done' && newStatus !== 'done') {
          return sendJson(res, 400, { ok: false, error: 'cannot_change_done_task' });
        }

        const { error: updErr } = await sb
          .from('tasks')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', taskId)
          .eq('project_id', projectId);

        if (updErr) throw updErr;

        // Emit status_change event
        try {
          await sb.from('task_events').insert({
            project_id: projectId,
            task_id: taskId,
            event_type: 'status_change',
            author,
            content: `Status changed: ${currentTask?.status || '?'} → ${newStatus}`,
            metadata: {
              old_status: currentTask?.status || null,
              new_status: newStatus,
            },
          });
        } catch { /* best effort */ }

        // Activity feed: when a task is completed, log a clickable activity entry.
        try {
          if (newStatus === 'done') {
            await sb.from('activities').insert({
              project_id: projectId,
              type: 'task_completed',
              message: `Task completed: ${taskId}`,
              actor_agent_key: author,
              task_id: taskId,
              metadata: { task_id: taskId, status: 'done' },
            });
          }
        } catch {
          // ignore
        }

        await bumpSupabaseAgentLastActivity({ projectId, agentKey: author, whenIso: new Date().toISOString() });

        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/tasks/:taskId/events — insert a task_events row via service role (agents can call Control API; no Supabase keys in workspaces)
    if (req.method === 'POST' && url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/events')) {
      try {
        const projectId = getProjectIdFromReq(req);
        const taskId = decodeURIComponent(url.pathname.slice('/api/tasks/'.length, -'/events'.length));
        if (!taskId) return sendJson(res, 400, { ok: false, error: 'missing_task_id' });

        const body = await readBodyJson(req);
        const author = String(body.author || body.author_agent_key || body.actor || 'dashboard').trim();
        const eventType = String(body.event_type || body.eventType || '').trim();
        const content = body.content === undefined ? null : String(body.content);
        const metadata = body.metadata ?? null;

        if (!eventType) return sendJson(res, 400, { ok: false, error: 'missing_event_type' });

        // Invariants: status/assignment changes have dedicated endpoints so the task row stays consistent.
        if (eventType === 'status_change') {
          return sendJson(res, 400, { ok: false, error: 'use_status_endpoint', hint: 'POST /api/tasks/:taskId/status' });
        }
        if (eventType === 'assignment_change') {
          return sendJson(res, 400, { ok: false, error: 'use_assign_endpoint', hint: 'POST /api/tasks/:taskId/assign' });
        }

        // Guardrails: keep event types sane (extend intentionally).
        const allowedEventTypes = new Set(['comment', 'approval_resolved', 'task_deleted']);
        if (!allowedEventTypes.has(eventType)) {
          return sendJson(res, 400, { ok: false, error: 'invalid_event_type', allowed: Array.from(allowedEventTypes) });
        }

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const { data, error } = await sb
          .from('task_events')
          .insert({
            project_id: projectId,
            task_id: taskId,
            event_type: eventType,
            author,
            content,
            metadata,
          })
          .select('id')
          .single();

        if (error) throw error;

        // Best-effort: extract and store mentions
        try {
          if (content) {
            const knownKeys = await getKnownAgentKeys(projectId);
            const mentionKeys = extractMentionKeys(content, knownKeys);
            if (mentionKeys.length > 0) {
              await insertMentions({ sb, projectId, mentionKeys, sourceType: 'task_event', sourceId: data.id, taskId, threadId: null, author, excerpt: content });
            }
          }
        } catch { /* non-blocking */ }

        await bumpSupabaseAgentLastActivity({ projectId, agentKey: author, whenIso: new Date().toISOString() });

        return sendJson(res, 200, { ok: true, id: data?.id || null });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/chat/post — insert a project_chat_messages row via service role
    if (req.method === 'POST' && url.pathname === '/api/chat/post') {
      try {
        const projectId = getProjectIdFromReq(req);
        const body = await readBodyJson(req);
        const threadId = body.thread_id === undefined ? null : (body.thread_id ? String(body.thread_id) : null);
        const author = String(body.author || body.author_agent_key || body.actor || 'dashboard').trim();
        const message = String(body.message || '').trim();
        const targetAgentKey = body.target_agent_key ? String(body.target_agent_key).trim() : null;
        const messageType = body.message_type ? String(body.message_type).trim() : null;
        const metadata = body.metadata ?? null;

        if (!message) return sendJson(res, 400, { ok: false, error: 'missing_message' });

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const insertRow = {
          project_id: projectId,
          thread_id: threadId,
          author,
          target_agent_key: targetAgentKey,
          message,
        };

        // Optional columns exist in newer schema; include if provided.
        if (messageType) insertRow.message_type = messageType;
        if (metadata) insertRow.metadata = metadata;

        // Insert. Some Supabase envs may not have optional columns (message_type/metadata) yet.
        // If we hit an "unknown column" error, retry without optional fields.
        let inserted;
        let error;
        {
          const r = await sb.from('project_chat_messages').insert(insertRow).select('id').single();
          inserted = r.data;
          error = r.error;
        }

        if (error) {
          const msg = String(error?.message || error);
          const isUnknownColumn = msg.includes("Could not find the 'message_type' column") || msg.includes("Could not find the 'metadata' column") || msg.includes('schema cache');
          if (isUnknownColumn) {
            const fallbackRow = {
              project_id: insertRow.project_id,
              thread_id: insertRow.thread_id,
              author: insertRow.author,
              target_agent_key: insertRow.target_agent_key,
              message: insertRow.message,
            };
            const r2 = await sb.from('project_chat_messages').insert(fallbackRow).select('id').single();
            inserted = r2.data;
            error = r2.error;
          }
        }

        if (error) throw error;
        const data = inserted;

        // Best-effort: extract and store mentions
        try {
          if (message) {
            const knownKeys = await getKnownAgentKeys(projectId);
            const mentionKeys = extractMentionKeys(message, knownKeys);
            if (mentionKeys.length > 0) {
              await insertMentions({ sb, projectId, mentionKeys, sourceType: 'chat_message', sourceId: data.id, taskId: null, threadId: threadId || null, author, excerpt: message });
            }
          }
        } catch { /* non-blocking */ }

        await bumpSupabaseAgentLastActivity({ projectId, agentKey: author, whenIso: new Date().toISOString() });

        return sendJson(res, 200, { ok: true, id: data?.id || null });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/projects/:projectId/drive/init — create Drive folder spine + spine doc (idempotent)
    const driveInitMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/drive\/init$/);
    if (driveInitMatch && req.method === 'POST') {
      const [, projectIdFromPath] = driveInitMatch;
      try {
        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const body = await readBodyJson(req).catch(() => ({}));
        const account = String(body.account || process.env.GOG_ACCOUNT_EMAIL || 'trunksworldwide@gmail.com');
        const client = String(body.client || process.env.GOG_CLIENT || 'trunksworldwide');
        const rootName = String(body.rootName || 'Mission Control');
        const projectFolderName = String(body.projectFolderName || projectIdFromPath);

        // gog keyring uses GOG_KEYRING_PASSWORD for non-interactive storage.
        if (!process.env.GOG_KEYRING_PASSWORD) {
          return sendJson(res, 500, { ok: false, error: 'missing_gog_keyring_password' });
        }

        const execGogJson = async (cmd) => {
          const full = `gog ${cmd} -j --results-only --account ${JSON.stringify(account)} --client ${JSON.stringify(client)}`;
          const { stdout } = await exec(full, {
            env: { ...process.env },
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
          });
          return JSON.parse(stdout || 'null');
        };

        const findOrCreateFolder = async ({ name, parentId }) => {
          // Try search first (best-effort). gog drive search is full-text; we filter client-side.
          // IMPORTANT: multiple folders can share the same name. Prefer exact matches under the expected parent.
          const results = await execGogJson(`drive search ${JSON.stringify(name)}`);
          const list = Array.isArray(results) ? results : (results?.files || results?.items || []);

          const isFolder = (f) => String(f?.mimeType || '').includes('folder');
          const parents = (f) => {
            const p = f?.parents;
            if (!p) return [];
            return Array.isArray(p) ? p : [p];
          };

          let exact = (list || []).find((f) => f?.name === name && isFolder(f) && (!parentId || parents(f).includes(parentId))) || null;
          if (!exact && parentId) {
            // If search results don't include parent info, fall back to name+folder only.
            exact = (list || []).find((f) => f?.name === name && isFolder(f)) || null;
          }
          if (exact?.id) return exact;

          const created = await execGogJson(`drive mkdir ${JSON.stringify(name)}${parentId ? ` --parent ${JSON.stringify(parentId)}` : ''}`);
          return created;
        };

        const rootFolder = await findOrCreateFolder({ name: rootName, parentId: null });
        const projectFolder = await findOrCreateFolder({ name: projectFolderName, parentId: rootFolder?.id });

        const subfolders = ['00_inbox', '01_specs', '02_ops', '03_assets', '04_exports'];
        const createdSub = {};
        for (const sf of subfolders) {
          const f = await findOrCreateFolder({ name: sf, parentId: projectFolder?.id });
          createdSub[sf] = f?.id || null;
        }

        // Spine doc content
        const spineText = `# ${projectFolderName} — Spine & Filing Rules\n\nThis project stores its shared artifacts in Google Drive.\n\nFolder map\n- 00_inbox — default dump zone when unsure\n- 01_specs — specs/PRDs/plans\n- 02_ops — runbooks/checklists/incidents\n- 03_assets — images/decks/brand\n- 04_exports — PDFs/reports/exports\n\nRules\n- If unsure, upload to 00_inbox and link it in the relevant task thread.\n- Prefer date+slug filenames: YYYY-MM-DD_short-slug.ext\n- Task progress goes in Mission Control task threads (not local memory).\n`;

        const tmpSpine = `/tmp/${projectFolderName}-README_SPINE.md`;
        writeFileSync(tmpSpine, spineText, 'utf8');

        // Upload spine doc into project folder; convert to Google Doc for readability.
        const spineDoc = await execGogJson(`drive upload ${JSON.stringify(tmpSpine)} --parent ${JSON.stringify(projectFolder?.id)} --name ${JSON.stringify('README_SPINE')} --convert-to doc`);
        try { unlinkSync(tmpSpine); } catch { /* ignore */ }

        // Capabilities doc (single canonical contract for agents)
        const capabilitiesText = `# ${projectFolderName} — Capabilities (Mission Control Contract)\n\nThis doc lists what agents can do in this project and the exact endpoints to call. Keep it up to date.\n\nRequired header\n- x-clawdos-project: ${projectIdFromPath}\n\nCore actions\n\n1) Propose tasks (lands in Inbox for approval)\nPOST /api/tasks/propose\nBody: { title, description?, assignee_agent_key?, author }\n\n2) Post task timeline events (canonical thread)\nPOST /api/tasks/:taskId/events\nBody: { event_type, content, metadata?, author }\n\n3) Post to war room / chat\nPOST /api/chat/post\nBody: { message, thread_id?, author, message_type?, metadata? }\n\n4) Upload artifacts to Drive (recommended)\nPOST /api/drive/upload\nBody: { category: inbox|specs|ops|assets|exports, name, content, author, convertTo? }\nReturns: { fileId, url, folderId }\n\nDrive spine\n- Project folder: (see dashboard Project settings)\n- Default dump zone: 00_inbox\n\nBehavior rules\n- If unsure, upload to inbox and link it in the relevant task thread.\n- Use agent-browser as the default web browsing tool.\n`;

        const tmpCaps = `/tmp/${projectFolderName}-CAPABILITIES.md`;
        writeFileSync(tmpCaps, capabilitiesText, 'utf8');

        // Upload capabilities doc into 02_ops for discoverability; convert to Google Doc.
        const opsFolderId = createdSub['02_ops'] || projectFolder?.id;
        const capabilitiesDoc = await execGogJson(`drive upload ${JSON.stringify(tmpCaps)} --parent ${JSON.stringify(opsFolderId)} --name ${JSON.stringify('CAPABILITIES')} --convert-to doc`);
        try { unlinkSync(tmpCaps); } catch { /* ignore */ }

        const rootUrl = (await execGogJson(`drive url ${JSON.stringify(rootFolder?.id)}`))?.[0]?.url || null;
        const projectUrl = (await execGogJson(`drive url ${JSON.stringify(projectFolder?.id)}`))?.[0]?.url || null;
        const spineUrl = (await execGogJson(`drive url ${JSON.stringify(spineDoc?.id)}`))?.[0]?.url || null;
        const capabilitiesUrl = (await execGogJson(`drive url ${JSON.stringify(capabilitiesDoc?.id)}`))?.[0]?.url || null;

        // Persist to project_settings so UI/agents can discover it.
        const settings = [
          { project_id: projectIdFromPath, key: 'drive_root_folder_id', value: rootFolder?.id || '' },
          { project_id: projectIdFromPath, key: 'drive_root_folder_url', value: rootUrl || '' },
          { project_id: projectIdFromPath, key: 'drive_project_folder_id', value: projectFolder?.id || '' },
          { project_id: projectIdFromPath, key: 'drive_project_folder_url', value: projectUrl || '' },
          { project_id: projectIdFromPath, key: 'drive_spine_doc_id', value: spineDoc?.id || '' },
          { project_id: projectIdFromPath, key: 'drive_spine_doc_url', value: spineUrl || '' },
          { project_id: projectIdFromPath, key: 'drive_capabilities_doc_id', value: capabilitiesDoc?.id || '' },
          { project_id: projectIdFromPath, key: 'drive_capabilities_doc_url', value: capabilitiesUrl || '' },
          { project_id: projectIdFromPath, key: 'drive_folder_inbox_id', value: createdSub['00_inbox'] || '' },
          { project_id: projectIdFromPath, key: 'drive_folder_specs_id', value: createdSub['01_specs'] || '' },
          { project_id: projectIdFromPath, key: 'drive_folder_ops_id', value: createdSub['02_ops'] || '' },
          { project_id: projectIdFromPath, key: 'drive_folder_assets_id', value: createdSub['03_assets'] || '' },
          { project_id: projectIdFromPath, key: 'drive_folder_exports_id', value: createdSub['04_exports'] || '' },
        ];

        await sb.from('project_settings').upsert(settings, { onConflict: 'project_id,key' });

        // Best-effort: also mirror capabilities content into brain_docs (project-scoped) for in-dashboard visibility.
        try {
          await sb.from('brain_docs').upsert(
            { project_id: projectIdFromPath, doc_type: 'capabilities', content: capabilitiesText, updated_by: 'drive_init' },
            { onConflict: 'project_id,doc_type' }
          );
        } catch {
          // ignore
        }

        return sendJson(res, 200, {
          ok: true,
          root: { id: rootFolder?.id || null, url: rootUrl },
          project: { id: projectFolder?.id || null, url: projectUrl },
          spineDoc: { id: spineDoc?.id || null, url: spineUrl },
          capabilitiesDoc: { id: capabilitiesDoc?.id || null, url: capabilitiesUrl },
          subfolders: createdSub,
        });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // GET /api/projects/:projectId/drive/verify — verify Drive spine settings exist and are reachable
    const driveVerifyMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/drive\/verify$/);
    if (driveVerifyMatch && req.method === 'GET') {
      const [, projectIdFromPath] = driveVerifyMatch;
      try {
        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const keys = [
          'drive_project_folder_id',
          'drive_folder_inbox_id',
          'drive_folder_specs_id',
          'drive_folder_ops_id',
          'drive_folder_assets_id',
          'drive_folder_exports_id',
        ];

        const { data, error } = await sb
          .from('project_settings')
          .select('key,value')
          .eq('project_id', projectIdFromPath)
          .in('key', keys);
        if (error) throw error;

        const settings = {};
        for (const row of data || []) settings[row.key] = row.value;

        const missing = keys.filter((k) => !settings[k]);
        if (missing.length > 0) {
          return sendJson(res, 200, { ok: false, reachable: false, missingKeys: missing });
        }

        // Best-effort reachability check: request URLs for the folder ids.
        const account = String(process.env.GOG_ACCOUNT_EMAIL || 'trunksworldwide@gmail.com');
        const client = String(process.env.GOG_CLIENT || 'trunksworldwide');
        const ids = keys.map((k) => settings[k]).filter(Boolean);

        const results = [];
        for (const id of ids) {
          try {
            const { stdout } = await exec(
              `gog drive url ${JSON.stringify(id)} -j --results-only --account ${JSON.stringify(account)} --client ${JSON.stringify(client)}`,
              { env: { ...process.env }, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
            );
            const url = (JSON.parse(stdout || 'null')?.[0]?.url) || null;
            results.push({ id, ok: !!url, url });
          } catch (e) {
            results.push({ id, ok: false, error: String(e?.message || e) });
          }
        }

        const reachable = results.every((r) => r.ok);
        return sendJson(res, 200, { ok: reachable, reachable, results });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // GET /api/projects/:projectId/drive/meta — return Drive spine + docs + folder IDs from project_settings
    const driveMetaMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/drive\/meta$/);
    if (driveMetaMatch && req.method === 'GET') {
      const [, projectIdFromPath] = driveMetaMatch;
      try {
        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const keys = [
          'drive_root_folder_id',
          'drive_root_folder_url',
          'drive_project_folder_id',
          'drive_project_folder_url',
          'drive_spine_doc_id',
          'drive_spine_doc_url',
          'drive_capabilities_doc_id',
          'drive_capabilities_doc_url',
          'drive_folder_inbox_id',
          'drive_folder_specs_id',
          'drive_folder_ops_id',
          'drive_folder_assets_id',
          'drive_folder_exports_id',
        ];

        const { data, error } = await sb
          .from('project_settings')
          .select('key,value')
          .eq('project_id', projectIdFromPath)
          .in('key', keys);
        if (error) throw error;

        const out = {};
        for (const row of data || []) out[row.key] = row.value;

        return sendJson(res, 200, { ok: true, projectId: projectIdFromPath, settings: out });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/drive/upload — upload a text artifact to the correct Drive folder for this project
    if (req.method === 'POST' && url.pathname === '/api/drive/upload') {
      try {
        const projectId = getProjectIdFromReq(req);
        const body = await readBodyJson(req);
        const category = String(body.category || 'inbox').trim();
        const name = String(body.name || '').trim();
        const content = String(body.content || '').toString();
        const author = String(body.author || body.author_agent_key || body.actor || 'dashboard').trim();
        const convertTo = body.convertTo ? String(body.convertTo).trim() : null; // doc|sheet|slides

        if (!name) return sendJson(res, 400, { ok: false, error: 'missing_name' });
        if (!content) return sendJson(res, 400, { ok: false, error: 'missing_content' });

        // Hard limits (keep endpoint predictable + safe)
        const allowedConvertTo = new Set(['doc', 'sheet', 'slides']);
        if (convertTo && !allowedConvertTo.has(convertTo)) {
          return sendJson(res, 400, { ok: false, error: 'invalid_convertTo' });
        }

        const maxBytes = Number(process.env.CLAWDOS_DRIVE_UPLOAD_MAX_BYTES || 500_000); // ~500KB default
        const contentBytes = Buffer.byteLength(content, 'utf8');
        if (Number.isFinite(maxBytes) && maxBytes > 0 && contentBytes > maxBytes) {
          return sendJson(res, 413, { ok: false, error: 'content_too_large', maxBytes });
        }

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const keyMap = {
          inbox: 'drive_folder_inbox_id',
          specs: 'drive_folder_specs_id',
          ops: 'drive_folder_ops_id',
          assets: 'drive_folder_assets_id',
          exports: 'drive_folder_exports_id',
        };
        const folderKey = keyMap[category] || keyMap.inbox;

        const { data } = await sb
          .from('project_settings')
          .select('key,value')
          .eq('project_id', projectId)
          .in('key', [folderKey]);

        const folderId = (data || []).find((r) => r.key === folderKey)?.value || '';
        if (!folderId) return sendJson(res, 400, { ok: false, error: 'drive_not_initialized' });

        if (!process.env.GOG_KEYRING_PASSWORD) {
          return sendJson(res, 500, { ok: false, error: 'missing_gog_keyring_password' });
        }

        const account = String(process.env.GOG_ACCOUNT_EMAIL || 'trunksworldwide@gmail.com');
        const client = String(process.env.GOG_CLIENT || 'trunksworldwide');

        // Write to temp file, then upload with gog.
        const safeBase = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'artifact.txt';
        const tmpPath = `/tmp/${projectId}-${Date.now()}-${safeBase}`;

        let uploaded = null;
        let urlOut = null;

        try {
          writeFileSync(tmpPath, content, 'utf8');

          const convertFlag = convertTo ? ` --convert-to ${JSON.stringify(convertTo)}` : '';
          const cmd = `gog drive upload ${JSON.stringify(tmpPath)} --parent ${JSON.stringify(folderId)} --name ${JSON.stringify(name)}${convertFlag} -j --results-only --account ${JSON.stringify(account)} --client ${JSON.stringify(client)}`;
          const { stdout } = await exec(cmd, { env: { ...process.env }, timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
          uploaded = JSON.parse(stdout || 'null');

          // Fetch URL (best-effort)
          try {
            const { stdout: uo } = await exec(
              `gog drive url ${JSON.stringify(uploaded?.id)} -j --results-only --account ${JSON.stringify(account)} --client ${JSON.stringify(client)}`,
              { env: { ...process.env }, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
            );
            urlOut = (JSON.parse(uo || 'null')?.[0]?.url) || null;
          } catch {
            // ignore
          }

          // Activity log (best-effort)
          try {
            await sb.from('activities').insert({
              project_id: projectId,
              type: 'drive_upload',
              message: `Uploaded ${name} to Drive (${category})${urlOut ? ` — ${urlOut}` : ''}`,
              actor_agent_key: author,
              task_id: null,
              metadata: { url: urlOut, fileId: uploaded?.id || null, folderId, category, name },
            });
          } catch {
            // ignore
          }

          // Structured log (best-effort)
          try {
            console.log(JSON.stringify({
              type: 'drive_upload',
              ok: true,
              projectId,
              category,
              name,
              bytes: contentBytes,
              convertTo,
              folderId,
              fileId: uploaded?.id || null,
              url: urlOut,
              at: new Date().toISOString(),
            }));
          } catch {
            // ignore
          }

          return sendJson(res, 200, { ok: true, fileId: uploaded?.id || null, url: urlOut, folderId });
        } finally {
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/tasks/propose — create a proposed task in Tasks inbox for approval
    if (req.method === 'POST' && url.pathname === '/api/tasks/propose') {
      try {
        const projectId = getProjectIdFromReq(req);
        const body = await readBodyJson(req);
        const author = String(body.author || body.author_agent_key || body.actor || 'dashboard').trim();
        const title = String(body.title || '').trim();
        const description = String(body.description || '').trim();
        // If no explicit assignee is provided, default to the proposing agent.
        const assigneeAgentKey = body.assignee_agent_key
          ? String(body.assignee_agent_key).trim()
          : (author && author !== 'dashboard' ? author : null);

        if (!title) return sendJson(res, 400, { ok: false, error: 'missing_title' });

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const nowIso = new Date().toISOString();

        const insertRow = {
          project_id: projectId,
          title,
          description: description || '',
          status: 'inbox',
          assignee_agent_key: assigneeAgentKey,
          is_proposed: true,
          created_at: nowIso,
          updated_at: nowIso,
        };

        const { data, error } = await sb.from('tasks').insert(insertRow).select('id').single();
        if (error) throw error;

        // Best-effort task thread comment (so the task is self-explaining in TaskTimeline)
        try {
          await sb.from('task_events').insert({
            project_id: projectId,
            task_id: data.id,
            event_type: 'comment',
            author,
            content: `Proposed by ${author}${assigneeAgentKey ? ` (assigned to ${assigneeAgentKey})` : ''}.`,
            metadata: {
              source: 'api/tasks/propose',
              is_proposed: true,
              assignee_agent_key: assigneeAgentKey,
            },
          });
        } catch {
          // ignore
        }

        // Best-effort activity log
        try {
          await sb.from('activities').insert({
            project_id: projectId,
            type: 'task_proposed',
            message: `Proposed task: ${title}`,
            actor_agent_key: author,
            task_id: data.id,
          });
        } catch {
          // ignore
        }

        await bumpSupabaseAgentLastActivity({ projectId, agentKey: author, whenIso: nowIso });

        return sendJson(res, 200, { ok: true, id: data.id });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // ============= Agent Provisioning Endpoints =============

    // GET /api/agents/runtime — list runnable OpenClaw agents from the Mac mini
    if (req.method === 'GET' && url.pathname === '/api/agents/runtime') {
      try {
        const { stdout } = await execExecutor('agents list --json');
        const parsed = JSON.parse(stdout || '{}');
        return sendJson(res, 200, { ok: true, agents: parsed.agents || parsed.list || (Array.isArray(parsed) ? parsed : []) });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/agents/provision — provision a new OpenClaw agent on the Mac mini
    if (req.method === 'POST' && url.pathname === '/api/agents/provision') {
      try {
        const body = await readBodyJson(req);
        const agentKey = String(body.agentKey || '').trim();
        const displayName = String(body.displayName || '').trim();
        const emoji = String(body.emoji || '').trim() || null;
        const roleShort = String(body.roleShort || '').trim() || null;

        if (!agentKey) return sendJson(res, 400, { ok: false, error: 'missing_agent_key' });
        if (!displayName) return sendJson(res, 400, { ok: false, error: 'missing_display_name' });

        // Derive agentIdShort from agent_key (e.g. "agent:ricky:main" -> "ricky")
        const parts = agentKey.split(':');
        const agentIdShort = parts.length >= 2 ? parts[1] : agentKey;

        const homedir = process.env.HOME || '/Users/trunks';
        const workspaceDir = path.join(homedir, '.openclaw', `workspace-${agentIdShort}`);

        // 1. Create the agent in OpenClaw
        try {
          await execExecutor(`agents add ${JSON.stringify(agentIdShort)} --workspace ${JSON.stringify(workspaceDir)}`);
        } catch (e) {
          // If agent already exists, continue
          const msg = String(e?.message || e);
          if (!msg.includes('already exists') && !msg.includes('already added')) {
            throw new Error(`Failed to add agent: ${msg}`);
          }
        }

        // 2. Set identity
        try {
          const identityArgs = [`agents set-identity`, `--agent ${JSON.stringify(agentIdShort)}`, `--name ${JSON.stringify(displayName)}`];
          if (emoji) identityArgs.push(`--emoji ${JSON.stringify(emoji)}`);
          await execExecutor(identityArgs.join(' '));
        } catch (e) {
          console.error('[provision] set-identity failed (non-fatal):', e?.message || e);
        }

        // 3. Seed workspace files
        await exec(`mkdir -p ${JSON.stringify(path.join(workspaceDir, 'memory'))}`);

        // Disable BOOTSTRAP.md if OpenClaw created one (prevents repeated onboarding questions).
        try {
          const bootstrapPath = path.join(workspaceDir, 'BOOTSTRAP.md');
          if (existsSync(bootstrapPath)) {
            const disabled = path.join(workspaceDir, 'BOOTSTRAP.disabled.md');
            await exec(`mv ${JSON.stringify(bootstrapPath)} ${JSON.stringify(disabled)}`);
          }
        } catch {
          // non-fatal
        }

        // Best-effort: fetch Google Drive spine links so the agent knows exactly where to file artifacts.
        let driveProjectFolderUrl = '';
        let driveSpineDocUrl = '';
        let driveCapabilitiesDocUrl = '';
        try {
          const sb0 = getSupabaseServerClient();
          if (sb0) {
            const { data } = await sb0
              .from('project_settings')
              .select('key,value')
              .eq('project_id', projectId)
              .in('key', ['drive_project_folder_url', 'drive_spine_doc_url', 'drive_capabilities_doc_url']);
            for (const row of data || []) {
              if (row.key === 'drive_project_folder_url') driveProjectFolderUrl = row.value || '';
              if (row.key === 'drive_spine_doc_url') driveSpineDocUrl = row.value || '';
              if (row.key === 'drive_capabilities_doc_url') driveCapabilitiesDocUrl = row.value || '';
            }
          }
        } catch {
          // ignore
        }

        const soulContent = `# SOUL.md - ${displayName}\n\n> ${roleShort || 'Agent'}\n\n## Core Behavior\n\n### Context Awareness\nBefore acting on any task, you receive a **Context Pack** containing:\n- Project overview and goals\n- Relevant documents assigned to you\n- Recent changes in the project\n\nRead and apply this context. Do not assume information not provided.\n\n### Dashboard updates (IMPORTANT)\nThis project uses a Mission Control dashboard (Supabase).\n- Do NOT write task progress into local memory files.\n- Always include the project header on Control API calls:\n  x-clawdos-project: <projectId>\n\n### Default web browsing (agent-browser)\nUse agent-browser as your default way to browse/automate the web.\nTypical loop:\n- agent-browser open <url>\n- agent-browser snapshot (prefer @refs)\n- agent-browser click @e2 / agent-browser fill @e3 "..."\n- agent-browser screenshot out.png (when useful)\n- agent-browser close\n\n### Google Drive workspace (project spine)\nYour project has a Google Drive folder spine (Mission Control).\n- Project folder: ${driveProjectFolderUrl || '(not initialized yet)'}\n- Spine doc (filing rules): ${driveSpineDocUrl || '(not initialized yet)'}\n- Capabilities doc (what you can do): ${driveCapabilitiesDocUrl || '(not initialized yet)'}\n\nIf these links are missing, ask the operator to run:\nPOST /api/projects/:projectId/drive/init\n\nUploads\n- Upload an artifact to the right folder:\n  POST /api/drive/upload\n  { category: inbox|specs|ops|assets|exports, name, content, author, convertTo? }\n  (If unsure, use category=inbox.)\n\n### System commands you can use (expand over time)\nUse these to operate Mission Control without any Supabase keys:\n\nTask + timeline\n- Propose a task (lands in Inbox for approval):\n  POST /api/tasks/propose\n  { title, description?, assignee_agent_key?, author }\n- Comment/update a task thread (canonical timeline):\n  POST /api/tasks/:taskId/events\n  { event_type, content, metadata?, author }.\n\nChat / war room\n- Post a message to the project chat (war room) or thread:\n  POST /api/chat/post\n  { message, thread_id?, author, message_type?, metadata? }.\n\n### Communication\n- Be direct and clear\n- Match the project's communication style\n- Ask clarifying questions when context is insufficient\n`;
        const userContent = `# USER.md\n\n## Profile\n- Agent: ${displayName}\n- Role: ${roleShort || 'General assistant'}\n\n## Working style\n- Prefer posting progress to the dashboard task thread via Control API (see SOUL.md).\n`;
        const memoryContent = `# MEMORY.md\n\n`;

        const seedFiles = [
          { fp: path.join(workspaceDir, 'SOUL.md'), content: soulContent },
          { fp: path.join(workspaceDir, 'USER.md'), content: userContent },
          { fp: path.join(workspaceDir, 'MEMORY.md'), content: memoryContent },
        ];

        for (const f of seedFiles) {
          if (!existsSync(f.fp)) writeFileSync(f.fp, f.content, 'utf8');
        }

        // 4. Best-effort: update Supabase
        const sb = getSupabaseServerClient();
        if (sb) {
          // Update agents row
          await sb.from('agents').update({
            provisioned: true,
            agent_id_short: agentIdShort,
            workspace_path: workspaceDir,
          }).eq('project_id', projectId).eq('agent_key', agentKey);

          // Write agent-scoped brain_docs
          const docRows = [
            { project_id: projectId, agent_key: agentKey, doc_type: 'soul', content: soulContent, updated_by: 'provisioner' },
            { project_id: projectId, agent_key: agentKey, doc_type: 'user', content: userContent, updated_by: 'provisioner' },
            { project_id: projectId, agent_key: agentKey, doc_type: 'memory_long', content: memoryContent, updated_by: 'provisioner' },
          ];
          await sb.from('brain_docs').upsert(docRows, { onConflict: 'project_id,agent_key,doc_type' });

          // Activity log
          await sb.from('activities').insert({
            project_id: projectId,
            type: 'agent_provisioned',
            message: `Provisioned agent ${displayName} (${agentIdShort}) on executor`,
            actor_agent_key: 'agent:provisioner:system',
          });
        }

        // 5. Auto-create heartbeat cron job (deterministic name to prevent duplicates)
        const heartbeatJobName = `heartbeat-${agentIdShort}`;
        try {
          // Check if heartbeat already exists
          const { stdout: cronListOut } = await execExecutor('cron list --json --timeout 10000', { timeout: 15000 });
          const cronData = JSON.parse(cronListOut || '{"jobs":[]}');
          const existingJobs = Array.isArray(cronData?.jobs) ? cronData.jobs : (Array.isArray(cronData) ? cronData : []);
          const heartbeatExists = existingJobs.some(j => j.name === heartbeatJobName || j.id === heartbeatJobName);

          if (!heartbeatExists) {
            const heartbeatInstructions = buildHeartbeatInstructions({ agentKey, displayName, role: roleShort || 'General' });
            await execExecutor(
              `cron create ${JSON.stringify(heartbeatJobName)} --every 3600000 --agent ${JSON.stringify(agentIdShort)} --system-event ${JSON.stringify(heartbeatInstructions)}`,
              { timeout: 30000 }
            );
            console.log(`[provision] Created heartbeat cron job: ${heartbeatJobName}`);
          } else {
            console.log(`[provision] Heartbeat already exists: ${heartbeatJobName}`);
          }
        } catch (e) {
          console.error(`[provision] Heartbeat creation failed (non-fatal): ${e?.message || e}`);
        }

        return sendJson(res, 200, { ok: true, agentId: agentIdShort, workspaceDir });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // ============= Agent File Endpoints (multi-agent support) =============
    // Override the existing agent file match to support any agent, not just trunks

    // GET /api/memory/status — memory backend detection (QMD awareness)
    if (req.method === 'GET' && url.pathname === '/api/memory/status') {
      const result = { backend: 'sqlite', qmdConfigured: false, qmdCliFound: false };

      // Check OpenClaw config for memory backend setting
      try {
        const homedir = process.env.HOME || '/Users/trunks';
        const configPath = path.join(homedir, '.openclaw', 'openclaw.json');
        const raw = await readFile(configPath, 'utf8');
        const config = JSON.parse(raw);
        if (config?.memory?.backend === 'qmd') {
          result.backend = 'qmd';
          result.qmdConfigured = true;
        }
      } catch {
        // Config doesn't exist or no memory section — default sqlite
      }

      // Check if qmd CLI is available
      try {
        await exec('command -v qmd');
        result.qmdCliFound = true;
      } catch {
        // qmd not on PATH
      }

      return sendJson(res, 200, result);
    }

    // ============= Task Stop & Delete =============

    // POST /api/tasks/:taskId/stop — stop a task (non-destructive, auditable)
    const taskStopMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/stop$/);
    if (taskStopMatch && req.method === 'POST') {
      try {
        const projectId = getProjectIdFromReq(req);
        const taskId = decodeURIComponent(taskStopMatch[1]);
        const body = await readBodyJson(req);
        const author = String(body.author || 'dashboard').trim();
        const reason = body.reason ? String(body.reason).trim() : null;

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const { data: currentTask } = await sb.from('tasks').select('status').eq('id', taskId).eq('project_id', projectId).maybeSingle();
        const oldStatus = currentTask?.status || null;

        const { error: updErr } = await sb.from('tasks')
          .update({ status: 'stopped', updated_at: new Date().toISOString() })
          .eq('id', taskId).eq('project_id', projectId);
        if (updErr) throw updErr;

        try {
          await sb.from('task_events').insert({
            project_id: projectId, task_id: taskId, event_type: 'status_change', author,
            content: `Task stopped${reason ? ': ' + reason : ''}`,
            metadata: { old_status: oldStatus, new_status: 'stopped', reason },
          });
        } catch { /* best effort */ }

        await bumpSupabaseAgentLastActivity({ projectId, agentKey: author, whenIso: new Date().toISOString() });
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/tasks/:taskId/delete — soft-delete a task (set deleted_at, auditable)
    const taskDeleteMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/delete$/);
    if (taskDeleteMatch && req.method === 'POST') {
      try {
        const projectId = getProjectIdFromReq(req);
        const taskId = decodeURIComponent(taskDeleteMatch[1]);
        const body = await readBodyJson(req);
        const author = String(body.author || 'dashboard').trim();

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const nowIso = new Date().toISOString();
        const { error: updErr } = await sb.from('tasks')
          .update({ deleted_at: nowIso, deleted_by: author, updated_at: nowIso })
          .eq('id', taskId).eq('project_id', projectId);
        if (updErr) throw updErr;

        try {
          await sb.from('task_events').insert({
            project_id: projectId, task_id: taskId, event_type: 'task_deleted', author,
            content: `Task soft-deleted by ${author}`,
          });
        } catch { /* best effort */ }

        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // ============= Mentions =============

    // GET /api/mentions?agent_key=<key>&since=<ISO>&limit=50
    if (req.method === 'GET' && url.pathname === '/api/mentions') {
      try {
        const projectId = getProjectIdFromReq(req);
        const agentKey = url.searchParams.get('agent_key') || '';
        const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z';
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || '50')));

        if (!agentKey) return sendJson(res, 400, { ok: false, error: 'missing_agent_key' });

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        const { data, error } = await sb.from('mentions')
          .select('id,source_type,source_id,task_id,thread_id,author,excerpt,created_at')
          .eq('project_id', projectId).eq('agent_key', agentKey)
          .gt('created_at', since)
          .order('created_at', { ascending: true })
          .limit(limit);

        if (error) throw error;
        return sendJson(res, 200, { mentions: data || [] });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // POST /api/mentions/ack — update agent mention cursor (GREATEST semantics)
    if (req.method === 'POST' && url.pathname === '/api/mentions/ack') {
      try {
        const projectId = getProjectIdFromReq(req);
        const body = await readBodyJson(req);
        const agentKey = String(body.agent_key || '').trim();
        const lastSeenAt = String(body.last_seen_at || '').trim();

        if (!agentKey) return sendJson(res, 400, { ok: false, error: 'missing_agent_key' });
        if (!lastSeenAt) return sendJson(res, 400, { ok: false, error: 'missing_last_seen_at' });

        const sb = getSupabaseServerClient();
        if (!sb) return sendJson(res, 500, { ok: false, error: 'supabase_service_role_not_configured' });

        // Manual GREATEST: fetch existing, compare, upsert
        const { data: existing } = await sb.from('agent_mention_cursor')
          .select('last_seen_at').eq('project_id', projectId).eq('agent_key', agentKey).maybeSingle();

        const effectiveLastSeen = existing?.last_seen_at && new Date(existing.last_seen_at) > new Date(lastSeenAt)
          ? existing.last_seen_at : lastSeenAt;

        const { error: upsertErr } = await sb.from('agent_mention_cursor').upsert({
          project_id: projectId, agent_key: agentKey, last_seen_at: effectiveLastSeen, updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id,agent_key' });

        if (upsertErr) throw upsertErr;
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    // ============= Agent Deletion (Safe Cascade Cleanup) =============

    const agentDeleteMatch = url.pathname.match(/^\/api\/agents\/([a-zA-Z0-9_:%-]+)$/);
    if (agentDeleteMatch && req.method === 'DELETE') {
      const agentKey = decodeURIComponent(agentDeleteMatch[1]);

      if (!/^[a-zA-Z0-9_:-]+$/.test(agentKey)) {
        return sendJson(res, 400, { ok: false, error: 'invalid_agent_key' });
      }
      if (agentKey === 'agent:main:main') {
        return sendJson(res, 403, { ok: false, error: 'cannot_delete_primary_agent' });
      }

      const projectId = getProjectIdFromReq(req);
      const parts = agentKey.split(':');
      const agentIdShort = parts.length >= 2 ? parts[1] : agentKey;
      const homedir = process.env.HOME || '/Users/trunks';
      const report = {};

      console.log(`[delete-agent] Starting cascade delete for ${agentKey} (short: ${agentIdShort})`);

      // Step A: Delete cron jobs targeting this agent
      try {
        const { stdout } = await execExecutor('cron list --json --timeout 10000', { timeout: 15000 });
        const cronData = JSON.parse(stdout || '{"jobs":[]}');
        const allJobs = Array.isArray(cronData?.jobs) ? cronData.jobs : (Array.isArray(cronData) ? cronData : []);
        const targetJobs = allJobs.filter(j => {
          if (j.sessionTarget === agentIdShort) return true;
          const msg = j.payload?.message || '';
          if (msg.includes(`@agent:${agentKey}`) || msg.includes(`@agent:${agentIdShort}`)) return true;
          if ((j.name || '').includes(agentIdShort)) return true;
          return false;
        });
        report.cronJobsFound = targetJobs.length;
        report.cronJobsDeleted = 0;
        for (const j of targetJobs) {
          try {
            await execExecutor(`cron delete ${JSON.stringify(j.id || j.name)}`, { timeout: 15000 });
            report.cronJobsDeleted++;
          } catch (e) {
            console.warn(`[delete-agent] Failed to delete cron job ${j.id || j.name}:`, e?.message || e);
          }
        }
      } catch (e) {
        report.cronJobsError = String(e?.message || e);
        console.warn('[delete-agent] Cron list/delete failed:', e?.message || e);
      }

      // Step B: Remove OpenClaw agent
      try {
        await execExecutor(`agents delete ${JSON.stringify(agentIdShort)} --force`, { timeout: 60000 });
        report.agentRemoved = true;
      } catch (e) {
        const msg = String(e?.message || e);
        report.agentRemoved = msg.includes('not found') || msg.includes('does not exist') ? 'already_gone' : false;
        if (report.agentRemoved !== 'already_gone') {
          console.warn('[delete-agent] agents delete failed:', msg);
        }
      }

      // Step C: Remove workspace directory (strict path validation)
      try {
        const workspaceDir = path.join(homedir, '.openclaw', `workspace-${agentIdShort}`);
        const expectedPrefix = path.join(homedir, '.openclaw', 'workspace-');
        if (workspaceDir.startsWith(expectedPrefix) && agentIdShort && !agentIdShort.includes('/') && !agentIdShort.includes('..')) {
          const wsStat = await safeStat(workspaceDir);
          if (wsStat) {
            await exec(`rm -rf ${JSON.stringify(workspaceDir)}`);
            report.workspaceRemoved = true;
          } else {
            report.workspaceRemoved = 'already_gone';
          }
        } else {
          report.workspaceRemoved = 'skipped_path_safety';
          console.warn(`[delete-agent] Skipped workspace deletion — path safety check failed: ${workspaceDir}`);
        }
      } catch (e) {
        report.workspaceRemoved = false;
        console.warn('[delete-agent] Workspace removal failed:', e?.message || e);
      }

      // Step D: Supabase cleanup (all best-effort, each independent)
      const sb = getSupabaseServerClient();
      if (sb) {
        const cleanup = async (label, fn) => {
          try {
            const result = await fn();
            const count = result?.data?.length ?? result?.count ?? null;
            report[label] = count !== null ? count : true;
          } catch (e) {
            report[label] = `error: ${e?.message || e}`;
            console.warn(`[delete-agent] ${label} cleanup failed:`, e?.message || e);
          }
        };

        await Promise.all([
          cleanup('agent_status', () => sb.from('agent_status').delete().eq('project_id', projectId).eq('agent_key', agentKey)),
          cleanup('agent_mention_cursor', () => sb.from('agent_mention_cursor').delete().eq('project_id', projectId).eq('agent_key', agentKey)),
          cleanup('agent_provision_requests', () => sb.from('agent_provision_requests').delete().eq('project_id', projectId).eq('agent_key', agentKey)),
          cleanup('brain_docs', () => sb.from('brain_docs').delete().eq('project_id', projectId).eq('agent_key', agentKey)),
          cleanup('cron_mirror', () => sb.from('cron_mirror').delete().eq('project_id', projectId).eq('target_agent_key', agentKey)),
          cleanup('chat_delivery_queue', () => sb.from('chat_delivery_queue').delete().eq('project_id', projectId).eq('target_agent_key', agentKey).in('status', ['queued', 'claimed'])),
          cleanup('mentions', () => sb.from('mentions').delete().eq('project_id', projectId).eq('agent_key', agentIdShort)),
        ]);

        // Delete agent row last
        await cleanup('agents_row', () => sb.from('agents').delete().eq('project_id', projectId).eq('agent_key', agentKey));

        // Log activity
        try {
          await sb.from('activities').insert({
            project_id: projectId,
            type: 'agent_deleted',
            message: `Deleted agent ${agentKey} (${agentIdShort}) — full cascade cleanup`,
            actor_agent_key: 'dashboard',
          });
        } catch (e) {
          console.warn('[delete-agent] Activity log failed:', e?.message || e);
        }
      } else {
        report.supabase = 'service_role_not_configured';
      }

      console.log(`[delete-agent] Cleanup complete for ${agentKey}:`, JSON.stringify(report));
      return sendJson(res, 200, { ok: true, cleanup_report: report });
    }

    // ── Knowledge: Ingest ────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/knowledge/ingest') {
      const body = await readBodyJson(req);
      const { title, source_url, source_type, text } = body;

      const sb = getSupabaseServerClient();
      if (!sb) return sendJson(res, 500, { ok: false, error: 'service_role_not_configured' });

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

      // Detect source type
      let detectedType = source_type || 'note';
      let rawText = text || '';
      let sourceUrl = source_url || null;
      let indexError = null;
      let shouldIndex = true;

      if (sourceUrl) {
        const urlLower = sourceUrl.toLowerCase();
        const isYoutube = urlLower.includes('youtube.com/watch') || urlLower.includes('youtu.be/');

        if (isYoutube) {
          detectedType = 'youtube';
          // Try YouTube transcript via public oEmbed (best-effort, no yt-dlp)
          try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`;
            const oRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
            if (oRes.ok) {
              const oData = await oRes.json();
              rawText = `YouTube: ${oData.title || 'Unknown'}\n\nSource: ${sourceUrl}`;
              // Transcript not available via oEmbed; mark accordingly
              indexError = 'transcript_unavailable';
              shouldIndex = false;
            } else {
              indexError = 'transcript_unavailable';
              shouldIndex = false;
            }
          } catch {
            indexError = 'transcript_unavailable';
            shouldIndex = false;
          }
        } else {
          detectedType = 'url';
          // Fetch and extract text with junk-page heuristics
          try {
            const pageRes = await fetch(sourceUrl, {
              signal: AbortSignal.timeout(10000),
              headers: { 'User-Agent': 'ClawdOS-Knowledge/1.0' },
            });
            if (!pageRes.ok) {
              return sendJson(res, 400, { ok: false, error: `fetch_failed_${pageRes.status}` });
            }
            let html = await pageRes.text();

            // Strip scripts, styles, nav, footer, header tags
            html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
            html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
            html = html.replace(/<nav[\s\S]*?<\/nav>/gi, '');
            html = html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
            html = html.replace(/<header[\s\S]*?<\/header>/gi, '');
            html = html.replace(/<aside[\s\S]*?<\/aside>/gi, '');

            // Count <p> tags before stripping
            const pCount = (html.match(/<p[\s>]/gi) || []).length;

            // Strip remaining HTML tags
            rawText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

            // Junk-page heuristics
            if (rawText.length < 500) {
              return sendJson(res, 400, { ok: false, error: 'extraction_too_short' });
            }
            if (pCount < 3 && rawText.length < 1000) {
              return sendJson(res, 400, { ok: false, error: 'page_blocked' });
            }

            // Captcha detection
            const captchaPatterns = ['captcha', 'cf-browser-verification', 'challenge-platform'];
            const lowerText = rawText.toLowerCase();
            if (captchaPatterns.some(p => lowerText.includes(p)) && rawText.length < 2000) {
              return sendJson(res, 400, { ok: false, error: 'page_blocked' });
            }
          } catch (e) {
            return sendJson(res, 400, { ok: false, error: `fetch_error: ${e?.message || e}` });
          }
        }
      } else if (!rawText && detectedType === 'file') {
        // Unsupported file type (PDF, doc, etc.) — create placeholder
        indexError = 'unsupported_file_type';
        shouldIndex = false;
      }

      // Normalize URL for dedupe
      let normalizedUrl = null;
      if (sourceUrl) {
        try {
          const u = new URL(sourceUrl);
          // Strip tracking params
          for (const key of [...u.searchParams.keys()]) {
            if (/^(utm_|fbclid|gclid|ref$)/.test(key)) u.searchParams.delete(key);
          }
          u.searchParams.sort();
          // Strip trailing slash
          normalizedUrl = u.toString().replace(/\/+$/, '');
        } catch {
          normalizedUrl = sourceUrl;
        }
      }

      // Content hash for dedupe
      const contentHash = crypto.createHash('sha256').update(rawText || sourceUrl || '').digest('hex');

      // Check for duplicate
      const { data: existing } = await sb
        .from('knowledge_sources')
        .select('id')
        .eq('project_id', projectId)
        .eq('content_hash', contentHash)
        .maybeSingle();

      if (existing) {
        return sendJson(res, 200, { ok: true, sourceId: existing.id, wasDuplicate: true });
      }

      // Insert source
      const { data: inserted, error: insertErr } = await sb
        .from('knowledge_sources')
        .insert({
          project_id: projectId,
          title: title || sourceUrl || 'Untitled',
          source_type: detectedType,
          source_url: sourceUrl,
          normalized_url: normalizedUrl,
          raw_text: rawText,
          content_hash: contentHash,
          char_count: rawText.length,
          indexed: false,
          index_error: indexError,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[knowledge/ingest] Insert failed:', insertErr);
        return sendJson(res, 500, { ok: false, error: insertErr.message });
      }

      const sourceId = inserted.id;

      // Async embed (fire-and-forget) — only if we have text to index
      if (shouldIndex && rawText.trim() && supabaseUrl && serviceKey) {
        fetch(`${supabaseUrl}/functions/v1/knowledge-worker`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'embed', projectId, sourceId }),
        }).catch(e => {
          console.warn('[knowledge/ingest] Async embed fire-and-forget failed:', e?.message || e);
        });
      }

      const status = shouldIndex ? 'indexing' : 'not_indexed';
      return sendJson(res, 200, { ok: true, sourceId, status, reason: indexError || undefined });
    }

    // ── Knowledge: Search ─────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/knowledge/search') {
      const body = await readBodyJson(req);
      const { query, limit } = body;

      if (!query) return sendJson(res, 400, { ok: false, error: 'query is required' });

      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return sendJson(res, 500, { ok: false, error: 'service_role_not_configured' });
      }

      try {
        const workerRes = await fetch(`${supabaseUrl}/functions/v1/knowledge-worker`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'search', projectId, query, limit: limit || 5 }),
        });

        const workerData = await workerRes.json();
        return sendJson(res, workerRes.ok ? 200 : workerRes.status, workerData);
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: `knowledge-worker call failed: ${e?.message || e}` });
      }
    }

    // ── Health: Report ────────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/health/report') {
      const sb = getSupabaseServerClient();
      if (!sb) return sendJson(res, 500, { ok: false, error: 'service_role_not_configured' });

      const lines = [];

      // 1. Executor self-check
      try {
        const { stdout } = await execExecutor('--version');
        lines.push(`✅ Executor alive: ${stdout.trim()}`);
      } catch (e) {
        lines.push(`❌ Executor unreachable: ${e?.message || 'unknown'}`);
      }

      // 2. Cron mirror staleness
      try {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: staleJobs } = await sb
          .from('cron_mirror')
          .select('name, updated_at')
          .eq('project_id', projectId)
          .lt('updated_at', tenMinAgo);

        if (staleJobs && staleJobs.length > 0) {
          lines.push(`⚠️ ${staleJobs.length} cron mirror(s) stale (>10min): ${staleJobs.map(j => j.name).slice(0, 5).join(', ')}`);
        } else {
          lines.push('✅ Cron mirrors fresh');
        }
      } catch {
        lines.push('⚠️ Could not check cron mirror staleness');
      }

      // 3. Chat delivery queue stuck items
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: stuckItems, count } = await sb
          .from('chat_delivery_queue')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('status', ['queued', 'claimed'])
          .lt('created_at', fiveMinAgo);

        const stuckCount = count || 0;
        if (stuckCount > 0) {
          lines.push(`⚠️ ${stuckCount} chat delivery item(s) stuck (>5min)`);
        } else {
          lines.push('✅ Chat delivery queue clear');
        }
      } catch {
        lines.push('⚠️ Could not check delivery queue');
      }

      // Cap at 5 lines
      const report = lines.slice(0, 5).join('\n');

      // Post to war room (thread_id = null)
      try {
        await sb.from('project_chat_messages').insert({
          project_id: projectId,
          author: 'system:health',
          message: `📋 **Health Report**\n${report}`,
          thread_id: null,
        });
      } catch (e) {
        console.warn('[health/report] Failed to post to war room:', e?.message || e);
      }

      return sendJson(res, 200, { ok: true, report });
    }

    return notFound(res);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`ClawdOS Control API listening on http://127.0.0.1:${PORT}`);
  console.log(`Default workspace: ${DEFAULT_WORKSPACE}`);
});
