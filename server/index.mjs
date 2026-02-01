import http from 'node:http';
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(_exec);

const PORT = Number(process.env.PORT || 3737);
const WORKSPACE = process.env.CLAWD_WORKSPACE || '/Users/trunks/clawd';
// Repo to commit edits to (defaults to the Clawdbot workspace repo).
const BRAIN_REPO = process.env.CLAWD_BRAIN_REPO || WORKSPACE;
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

function filePathFor(type) {
  if (type === 'soul') return path.join(WORKSPACE, 'SOUL.md');
  if (type === 'user') return path.join(WORKSPACE, 'USER.md');
  if (type === 'memory_long') return path.join(WORKSPACE, 'MEMORY.md');
  if (type === 'memory_today') {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(WORKSPACE, 'memory', `${today}.md`);
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

async function gitCommitFile(filePath, message) {
  // Commit edits into the brain repo for audit/rollback.
  // If there is nothing to commit, return null.
  const rel = path.relative(BRAIN_REPO, filePath);

  // Ensure file is inside the repo.
  if (rel.startsWith('..')) return null;

  try {
    await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git add ${JSON.stringify(rel)}`);
    const status = await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git status --porcelain ${JSON.stringify(rel)}`);
    if (!status.stdout.trim()) return null;

    await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git commit -m ${JSON.stringify(message)} -- ${JSON.stringify(rel)}`);
    const head = await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git rev-parse HEAD`);
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

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, {
        online: true,
        activeSessions: null,
        lastUpdated: new Date().toISOString(),
        port: PORT,
        environment: 'local',
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      // Minimal v1: only the primary agent profile.
      return sendJson(res, 200, [
        {
          id: 'trunks',
          name: 'Trunks',
          role: 'Primary Agent',
          status: 'online',
          lastActive: 'now',
          skillCount: null,
          avatar: '⚡',
        },
      ]);
    }

    const agentFileMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/files\/(soul|user|memory_long|memory_today)$/);
    if (agentFileMatch && req.method === 'GET') {
      const [, agentId, type] = agentFileMatch;
      if (agentId !== 'trunks') return sendJson(res, 404, { ok: false, error: 'unknown_agent' });
      const fp = filePathFor(type);
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
      const fp = filePathFor(type);
      if (!fp) return sendJson(res, 400, { ok: false, error: 'bad_type' });

      const body = await readBodyJson(req);
      const content = String(body.content ?? '');

      await writeFile(fp, content, 'utf8');

      const commit = await gitCommitFile(fp, `ClawdOS: update ${type}`);

      return sendJson(res, 200, { ok: true, commit });
    }

    if (req.method === 'GET' && url.pathname === '/api/skills') {
      // Minimal v1: show installed skills in the Clawdbot global install (best effort).
      // For now, return empty and let UI render.
      return sendJson(res, 200, []);
    }

    if (req.method === 'GET' && url.pathname === '/api/cron') {
      return sendJson(res, 200, []);
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
