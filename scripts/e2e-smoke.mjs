#!/usr/bin/env node
/*
E2E smoke test for the Mac-mini executor.

What it checks (end-to-end):
- Create a project via Control API
- Initialize Drive spine
- Provision an OpenClaw agent
- Create a task + post a timeline comment
- Read back task events
- Cleanup (delete agent + project)

Usage:
  node scripts/e2e-smoke.mjs

Env:
  CONTROL_API_BASE_URL (default http://127.0.0.1:3737)
*/

const baseUrl = process.env.CONTROL_API_BASE_URL || 'http://127.0.0.1:3737';

async function jfetch(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${path}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const ts = Date.now();
const projectId = `test-smoke-${ts}`;
const agentIdShort = `smoke${ts}`;
const agentKey = `agent:${agentIdShort}:main`;

let createdProject = false;
let provisionedAgent = false;

(async () => {
  console.log(`Smoke test against: ${baseUrl}`);
  console.log(`Project: ${projectId}`);
  console.log(`Agent: ${agentIdShort}`);

  try {
    // 1) Create project
    await jfetch('/api/projects', {
      method: 'POST',
      body: { input: { id: projectId, name: `Smoke Test ${new Date(ts).toISOString()}`, tag: 'smoke' } },
    });
    createdProject = true;

    // 2) Init Drive spine
    await jfetch(`/api/projects/${encodeURIComponent(projectId)}/drive/init`, {
      method: 'POST',
      headers: { 'x-clawdos-project': projectId },
      body: { author: 'smoke-test' },
    });

    // 3) Provision agent
    await jfetch('/api/agents/provision', {
      method: 'POST',
      headers: { 'x-clawdos-project': projectId },
      body: {
        agentKey,
        displayName: `Smoke Agent ${agentIdShort}`,
        emoji: '🧪',
        roleShort: 'Smoke test agent',
      },
    });
    provisionedAgent = true;

    // Give provisioning a beat (filesystem + Supabase best-effort)
    await sleep(750);

    // 4) Propose a task
    const task = await jfetch('/api/tasks/propose', {
      method: 'POST',
      headers: { 'x-clawdos-project': projectId },
      body: {
        author: agentKey,
        title: 'Smoke test task',
        description: 'This is a temporary task created by scripts/e2e-smoke.mjs',
        assignee_agent_key: agentKey,
      },
    });
    const taskId = task?.id;
    if (!taskId) throw new Error(`Missing taskId in response: ${JSON.stringify(task)}`);

    // 5) Post an event
    await jfetch(`/api/tasks/${encodeURIComponent(taskId)}/events`, {
      method: 'POST',
      headers: { 'x-clawdos-project': projectId },
      body: {
        author: agentKey,
        event_type: 'comment',
        content: 'Smoke test comment: hello from the executor',
        metadata: { source: 'scripts/e2e-smoke.mjs' },
      },
    });

    // 6) Read back events
    const events = await jfetch(`/api/tasks/${encodeURIComponent(taskId)}/events?limit=20`, {
      headers: { 'x-clawdos-project': projectId },
    });

    const rows = events?.events || events?.data || events || [];
    const hasComment = Array.isArray(rows) && rows.some((e) => String(e?.content || '').includes('Smoke test comment'));
    if (!hasComment) throw new Error(`Did not find posted comment in events: ${JSON.stringify(rows).slice(0, 800)}`);

    console.log('OK: end-to-end flow works (project → drive → agent → task → event → readback).');
  } catch (err) {
    console.error('SMOKE TEST FAILED:', err?.message || err);
    process.exitCode = 1;
  } finally {
    // Cleanup (best effort)
    try {
      if (provisionedAgent) {
        await jfetch(`/api/agents/${encodeURIComponent(agentIdShort)}`, {
          method: 'DELETE',
          headers: { 'x-clawdos-project': projectId },
        });
        console.log('Cleanup: agent deleted');
      }
    } catch (e) {
      console.error('Cleanup: agent delete failed:', e?.message || e);
    }

    try {
      if (createdProject) {
        await jfetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
        console.log('Cleanup: project deleted');
      }
    } catch (e) {
      console.error('Cleanup: project delete failed:', e?.message || e);
    }
  }
})();
