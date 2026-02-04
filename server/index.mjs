import http from 'node:http';
import { readFile, writeFile, stat, readdir, mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

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
    const { stdout } = await exec('clawdbot sessions --json --active 10080');
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
        const { stdout } = await exec('clawdbot sessions --json --active 10080');
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
        const skillsDir = '/opt/homebrew/lib/node_modules/clawdbot/skills';
        const entries = await readdir(skillsDir, { withFileTypes: true });
        skillCount = entries.filter((e) => e.isDirectory()).length;
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
      if (agentId !== 'trunks') return sendJson(res, 404, { ok: false, error: 'unknown_agent' });
      const fp = filePathFor(workspace, type);
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
      if (agentId !== 'trunks') return sendJson(res, 404, { ok: false, error: 'unknown_agent' });
      const fp = filePathFor(workspace, type);
      if (!fp) return sendJson(res, 400, { ok: false, error: 'bad_type' });

      const body = await readBodyJson(req);
      const content = String(body.content ?? '');

      await ensureParentDir(fp);
      await writeFile(fp, content, 'utf8');

      const commit = await gitCommitFile(brainRepo, fp, `ClawdOS: update ${type}`);

      // Best-effort: mirror “brain doc” edits into the Supabase activity feed.
      // This makes doc changes visible in the ClawdOS Live Feed when Supabase is configured.
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
      // v1: list installed skills from the local node_modules skills folder.
      try {
        const skillsDir = '/opt/homebrew/lib/node_modules/clawdbot/skills';
        const entries = await readdir(skillsDir, { withFileTypes: true });
        const skills = [];
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
          skills.push({
            id: skillName,
            name: skillName,
            slug: skillName,
            description: desc,
            version: 'local',
            installed: true,
            lastUpdated: st.mtime.toISOString(),
          });
        }
        return sendJson(res, 200, skills);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      try {
        const { stdout } = await exec('clawdbot sessions --json --active 10080');
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
        const { stdout } = await exec('clawdbot cron list --json --timeout 60000');
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
          await exec(`clawdbot cron enable ${JSON.stringify(jobId)} --timeout 60000`);
          return sendJson(res, 200, { ok: true, enabled: true });
        }
        if (action === 'disable') {
          await exec(`clawdbot cron disable ${JSON.stringify(jobId)} --timeout 60000`);
          return sendJson(res, 200, { ok: true, enabled: false });
        }

        // toggle: expects JSON body { enabled: boolean }
        const body = await readBodyJson(req);
        const enabled = Boolean(body.enabled);
        await exec(`clawdbot cron ${enabled ? 'enable' : 'disable'} ${JSON.stringify(jobId)} --timeout 60000`);
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
        const { stdout } = await exec(
          `clawdbot cron runs --id ${JSON.stringify(jobId)} --limit ${JSON.stringify(String(limit))} --timeout 60000`
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

        await exec(`clawdbot cron run ${JSON.stringify(jobId)} --timeout 60000`);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const cronEditMatch = url.pathname.match(/^\/api\/cron\/([^/]+)\/edit$/);
    if (cronEditMatch && req.method === 'POST') {
      const [, jobId] = cronEditMatch;
      try {
        // Body supports: { name?, schedule?, instructions?, enabled? }
        const body = await readBodyJson(req);
        const args = [];

        if (typeof body.name === 'string' && body.name.trim()) {
          args.push('--name', body.name.trim());
        }

        if (typeof body.schedule === 'string' && body.schedule.trim()) {
          // Cron expression
          args.push('--cron', body.schedule.trim());
        }

        if (typeof body.instructions === 'string') {
          // We map UI "instructions" to the cron job's systemEvent payload.
          // This preserves the v1 mental model: "instructions" are what the job does.
          args.push('--system-event', body.instructions);
        }

        if (typeof body.enabled === 'boolean') {
          args.push(body.enabled ? '--enable' : '--disable');
        }

        const cmd =
          `clawdbot cron edit ${JSON.stringify(jobId)} ` +
          args.map((a) => (a.startsWith('--') ? a : JSON.stringify(a))).join(' ') +
          ' --timeout 60000';

        await exec(cmd);
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
        await exec('clawdbot gateway restart');
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
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
