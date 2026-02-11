import http from 'node:http';
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

function resolveBrainRepo(workspace) {
  return process.env.CLAWD_BRAIN_REPO || workspace;
}

const ALLOW_ORIGIN = process.env.CLAWDOS_ALLOW_ORIGIN || '*';

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
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

      // Best-effort: keep agent presence fresh for the selected project.
      // `/api/status` is polled frequently by the UI, so throttle Supabase writes.
      await syncAgentPresenceFromSessions({ projectId, throttleMs: 30_000 });

      // Always upsert main agent in case Supabase is empty or the sync is throttled.
      // Use per-agent session count when available.
      const mainActiveCount = typeof mainSessions === 'number' ? mainSessions : activeSessions;
      await upsertSupabaseAgentStatus({
        projectId,
        agentKey: 'agent:main:main',
        state: typeof mainActiveCount === 'number' && mainActiveCount > 0 ? 'working' : 'idle',
        note: typeof mainActiveCount === 'number' && mainActiveCount > 0 ? `${mainActiveCount} active session(s)` : null,
      });

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

        // Best effort: register in Supabase
        const sb = getSupabaseServerClient();
        if (sb) {
          await sb
            .from('projects')
            .upsert({ id, name, workspace_path: newWorkspace, tag: tag || null }, { onConflict: 'id' });
        }

        return sendJson(res, 200, { ok: true, project: { id, name, workspace: newWorkspace, tag } });
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

    if (req.method === 'GET' && url.pathname === '/api/tasks') {
      try {
        const fp = path.join(workspace, 'memory', 'tasks.json');
        const st = await safeStat(fp);
        if (!st) return sendJson(res, 200, []);
        const raw = await readFile(fp, 'utf8');
        const data = JSON.parse(raw || '[]');
        return sendJson(res, 200, Array.isArray(data) ? data : []);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

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

    if (req.method === 'GET' && url.pathname === '/api/cron') {
      try {
        // Cron list can take longer than the default gateway timeout.
        const { stdout } = await execExecutor('cron list --json --timeout 60000', { timeout: 65000 });
        const data = JSON.parse(stdout || '{"jobs": []}');
        const jobs = (data.jobs || []).map((j) => ({
          id: j.id || j.jobId || j.name,
          name: j.name || j.id,
          schedule: j.cron || j.schedule || '',
          enabled: j.enabled !== false,
          nextRun: j.nextRun || '',
          nextRunAtMs: typeof j.nextRunAtMs === 'number' ? j.nextRunAtMs : (typeof j.nextRunAt === 'number' ? j.nextRunAt : null),
          lastRunStatus: null,
          instructions: j.text || j.instructions || '',
        }));
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

        // Extract reply text from JSON if possible.
        let replyText = stdout.trim();
        try {
          const parsed = JSON.parse(stdout);
          replyText =
            parsed?.reply ||
            parsed?.message ||
            parsed?.text ||
            parsed?.result?.reply ||
            parsed?.result?.text ||
            parsed?.output?.text ||
            parsed?.output?.message ||
            replyText;
        } catch {
          // keep raw stdout
        }

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

        const soulContent = `# SOUL.md - ${displayName}\n\n> ${roleShort || 'Agent'}\n\n## Core Behavior\n\n### Context Awareness\nBefore acting on any task, you receive a **Context Pack** containing:\n- Project overview and goals\n- Relevant documents assigned to you\n- Recent changes in the project\n\nRead and apply this context. Do not assume information not provided.\n\n### Communication\n- Be direct and clear\n- Match the project's communication style\n- Ask clarifying questions when context is insufficient\n`;
        const userContent = `# USER.md\n\n## Profile\n- Agent: ${displayName}\n- Role: ${roleShort || 'General assistant'}\n`;
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

    return notFound(res);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`ClawdOS Control API listening on http://127.0.0.1:${PORT}`);
  console.log(`Default workspace: ${DEFAULT_WORKSPACE}`);
});
