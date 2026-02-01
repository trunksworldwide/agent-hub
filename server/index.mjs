import http from 'node:http';
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(_exec);

const PORT = Number(process.env.PORT || 3737);
const DEFAULT_WORKSPACE = process.env.CLAWD_WORKSPACE || '/Users/trunks/clawd';
const PROJECTS_FILE = process.env.CLAWD_PROJECTS_FILE || path.join(process.cwd(), 'projects.json');

function loadProjectsSync() {
  try {
    // Read projects.json from repo root.
    const raw = readFileSync(PROJECTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.projects) ? data.projects : [];
  } catch {
    return [];
  }
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
    'access-control-allow-headers': 'content-type',
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
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    const projectId = getProjectIdFromReq(req);
    const workspace = resolveWorkspace(projectId);
    const brainRepo = resolveBrainRepo(workspace);

    if (req.method === 'GET' && url.pathname === '/api/status') {
      let activeSessions = null;
      try {
        const { stdout } = await exec('clawdbot sessions --json --active 10080');
        const data = JSON.parse(stdout || '{"count":0}');
        activeSessions = data.count ?? null;
      } catch {
        // ignore
      }

      return sendJson(res, 200, {
        online: true,
        activeSessions,
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

      await writeFile(fp, content, 'utf8');

      const commit = await gitCommitFile(brainRepo, fp, `ClawdOS: update ${type}`);

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
        const sessions = (data.sessions || []).map((s) => ({
          id: s.sessionId || s.key,
          key: s.key,
          kind: s.kind,
          status: s.abortedLastRun ? 'error' : 'active',
          startedAt: new Date(Date.now() - (s.ageMs || 0)).toISOString(),
          updatedAt: new Date(s.updatedAt || Date.now()).toISOString(),
          model: s.model,
          totalTokens: s.totalTokens,
        }));
        return sendJson(res, 200, sessions);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/cron') {
      try {
        const { stdout } = await exec('clawdbot cron list --json');
        const data = JSON.parse(stdout || '{"jobs": []}');
        const jobs = (data.jobs || []).map((j) => ({
          id: j.id || j.jobId || j.name,
          name: j.name || j.id,
          schedule: j.cron || j.schedule || '',
          enabled: j.enabled !== false,
          nextRun: j.nextRun || '',
          lastRunStatus: null,
          instructions: j.text || j.instructions || '',
        }));
        return sendJson(res, 200, jobs);
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    const cronRunMatch = url.pathname.match(/^\/api\/cron\/([^/]+)\/run$/);
    if (cronRunMatch && req.method === 'POST') {
      const [, jobId] = cronRunMatch;
      try {
        await exec(`clawdbot cron run ${JSON.stringify(jobId)}`);
        return sendJson(res, 200, { ok: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/activity') {
      // Recent git commits from the brain repo as a basic activity feed.
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
              date,
              message: msgParts.join('\t'),
            };
          });
        return sendJson(res, 200, commits);
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
  console.log(`Workspace: ${WORKSPACE}`);
});
