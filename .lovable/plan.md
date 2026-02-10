

# Updated Plan: Agent Provisioning (with fixes applied)

## What's already done (no work needed)

- `brain_docs` unique constraint is already `(project_id, agent_key, doc_type)` -- the migration exists and upserts already use the correct conflict target. No schema fix needed here.
- `createAgent()` already creates Supabase rows (agents, agent_status, brain_docs SOUL) and uses agent_key-scoped upserts.
- Agent file read/write endpoints exist at `/api/agents/:agentKey/files/:type` -- but hardcoded to reject anything except `trunks`.

## Changes

### 1. Migration: add columns to `agents` table

Add two new columns:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `agent_id_short` | text | NULL | The OpenClaw agentId (e.g. `ricky`) -- used everywhere |
| `workspace_path` | text | NULL | Absolute path to agent workspace on Mac mini |
| `provisioned` | boolean | false | Whether the agent is live on the executor |

### 2. New table: `agent_provision_requests`

Same queue pattern as `cron_run_requests` / `cron_delete_requests`.

Columns: id, project_id, agent_key, agent_id_short, display_name, emoji, role_short, status (queued/running/done/error), result (jsonb), requested_at, picked_up_at, completed_at.

RLS: open anon read/insert/update (same as other request tables).

### 3. Control API: agent provisioning endpoint (server/index.mjs)

**POST `/api/agents/provision`**

1. Derive `agentIdShort` from agent_key (split on `:`, take index 1)
2. Set workspace path: `~/.openclaw/workspace-<agentIdShort>`
3. Run `openclaw agents add <agentIdShort> --workspace <path>`
4. Run `openclaw agents set-identity --agent <agentIdShort> --name "<name>" --emoji "<emoji>"`
5. Seed SOUL.md, USER.md, MEMORY.md into the workspace directory on disk
6. Best-effort: update Supabase `agents` row with `provisioned=true`, `agent_id_short`, `workspace_path`
7. Best-effort: write agent-scoped brain_docs rows to Supabase
8. Return `{ ok: true, agentId, workspaceDir }`

**GET `/api/agents/runtime`** -- runs `openclaw agents list --json` and returns the result.

### 4. Fix agent file endpoints to support any agent (server/index.mjs)

Current code at the `/api/agents/:agentKey/files/:type` handler:

```text
if (agentId !== 'trunks') return sendJson(res, 404, { ok: false, error: 'unknown_agent' });
const fp = filePathFor(workspace, type);
```

Change to:
1. If agentKey is `trunks`, use the project workspace (existing behavior)
2. Otherwise, look up `workspace_path` from Supabase `agents` table for that agent_key
3. If no workspace_path found, return 404 with helpful error
4. Use that workspace_path with `filePathFor()` for reads and writes
5. On POST (write), also best-effort mirror to Supabase `brain_docs` with correct `agent_key`

This is the key change that makes dashboard doc editing work for any agent immediately, without needing brain-doc-sync changes.

### 5. brain-doc-sync: no changes (approach B)

brain-doc-sync remains global-only (syncs the primary workspace). Agent-specific doc sync is handled by:
- Control API direct writes (dashboard saves go to disk + Supabase)
- Provisioning seeds initial files

Multi-agent brain-doc-sync can be added later as a separate enhancement.

### 6. Dashboard: createAgent() enhanced (src/lib/api.ts)

After creating Supabase rows (existing), add:

1. Derive `agentIdShort` and store it on the agents row
2. Try `POST /api/agents/provision` via Control API
3. If Control API unreachable, insert row into `agent_provision_requests` (queue fallback)
4. Either way, agent appears immediately in dashboard

### 7. Dashboard: AgentsPage.tsx -- provisioning badge

- Read `provisioned` from agent data
- Show a small "Provisioning..." badge on cards where `provisioned === false`
- Badge disappears via realtime update when provisioning completes

### 8. Offline provisioning worker (scripts/cron-mirror.mjs)

Add `processProvisionRequests()` to the existing worker loop:
1. Poll `agent_provision_requests` for `status = 'queued'`, limit 3
2. Mark `running`, execute same provisioning steps as the Control API endpoint
3. Mark `done` or `error`
4. Update `agents.provisioned = true` on success
5. Add to `failStuckRequests` watchdog

Interval: every 10 seconds.

### 9. Remove job intent from edit dialog

Already handled in the previous change -- job intent field was removed from the cron edit UI.

## Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/xxx_agent_provisioning.sql` | New table `agent_provision_requests`, add columns to `agents` |
| `server/index.mjs` | Add `/api/agents/provision`, `/api/agents/runtime`, fix file endpoints for multi-agent |
| `scripts/cron-mirror.mjs` | Add `processProvisionRequests()` |
| `src/lib/api.ts` | Enhance `createAgent()` with provisioning + queue fallback, add fields to Agent type |
| `src/components/pages/AgentsPage.tsx` | Show provisioning badge |
| `src/integrations/supabase/types.ts` | Add new table type |
| `changes.md` | Document all changes |

## What this intentionally skips

- No per-agent tool restrictions (global tools for all)
- No AI-generated docs (template-based seeding only; AI generation is a follow-up)
- No brain-doc-sync multi-agent support (approach B: Control API handles it)
- No automatic cron scheduling for new agents

