

# Delete Agent with Safe Cascade Cleanup

## Summary

Replace the current frontend-driven delete (direct Supabase deletes + non-existent `/api/agents/delete` call) with a single authoritative Control API endpoint that performs full cascade cleanup on both the Mac mini and Supabase, while preserving all audit history.

## What Gets DELETED

| Target | Details |
|--------|---------|
| OpenClaw agent runtime | `openclaw agents remove <agentIdShort>` |
| Agent workspace directory | `~/.openclaw/workspace-<agentIdShort>/` (recursive, path-validated) |
| Cron jobs targeting agent | All cron jobs found via `openclaw cron list` where agent matches, deleted via `openclaw cron delete` |
| `agents` row | The agent definition row |
| `agent_status` row | Operational status |
| `agent_mention_cursor` row | Mention tracking cursor |
| `agent_provision_requests` rows | Any queued/pending provision requests |
| `brain_docs` rows (agent-scoped) | SOUL/USER/MEMORY docs where `agent_key = agentKey` |
| `cron_mirror` rows | Mirror rows targeting this agent |
| `chat_delivery_queue` rows | Queued/claimed deliveries targeting this agent |
| `mentions` rows | Mentions addressed to this agent |

## What Gets KEPT (audit history)

| Table | Rationale |
|-------|-----------|
| `tasks` | Task records stay even if assigned to deleted agent |
| `task_events` | Comments, status changes authored by agent stay |
| `task_outputs` | Deliverables stay |
| `project_chat_messages` | Chat history stays |
| `activities` | Activity log stays (plus a new "agent_deleted" entry is added) |

## Changes

### 1. Control API Endpoint (`server/index.mjs`)

Add `DELETE /api/agents/:agentKey` (placed near the existing provisioning section):

- **Validate** agentKey: must match `/^[a-zA-Z0-9_:-]+$/`, reject `agent:main:main`
- **Derive** `agentIdShort` from the key (e.g. `agent:ricky:main` -> `ricky`)
- **Step A**: List cron jobs via `openclaw cron list --json`, find jobs targeting this agent, delete each via `openclaw cron delete <jobId>` (best-effort, log failures)
- **Step B**: Remove OpenClaw agent via `openclaw agents remove <agentIdShort>` (best-effort, agent may not exist)
- **Step C**: Remove workspace directory `~/.openclaw/workspace-<agentIdShort>/` using `rm -rf` with strict path validation (must be under `~/.openclaw/workspace-`)
- **Step D**: Supabase cleanup (service role, all best-effort, each step independent):
  - Delete from `agent_status` where `agent_key = agentKey`
  - Delete from `agent_mention_cursor` where `agent_key = agentKey`
  - Delete from `agent_provision_requests` where `agent_key = agentKey`
  - Delete from `brain_docs` where `agent_key = agentKey`
  - Delete from `cron_mirror` where `target_agent_key = agentKey`
  - Delete from `chat_delivery_queue` where `target_agent_key = agentKey` and `status` in `('queued', 'claimed')`
  - Delete from `mentions` where `agent_key` equals the short key
  - Delete from `agents` where `agent_key = agentKey`
  - Insert `activities` row: type `agent_deleted`
- **Return** `{ ok: true, cleanup_report: { ... } }` with details of what was removed/skipped
- **Idempotent**: every sub-step checks before acting, never errors on "already gone"

### 2. Dashboard API (`src/lib/api.ts`)

Rewrite `deleteAgent()` to:
- Call `DELETE /api/agents/:agentKey` on the Control API as the primary path
- If Control API is unavailable, fall back to the existing direct Supabase cleanup (current behavior, preserved as fallback)
- Add `chat_delivery_queue` and `mentions` cleanup to the Supabase fallback path (currently missing)

### 3. UI Dialog (`src/components/agent-tabs/AgentOverview.tsx`)

Update the delete confirmation dialog copy:
- Current: "This will remove the agent from Supabase and notify the executor to clean up its workspace."
- New: "This will delete the agent runtime and workspace, disable its scheduled jobs, and remove operational data. Historical messages, task events, and outputs will remain."

No other UI changes needed -- the existing delete button and confirmation dialog structure stays.

### 4. Changelog (`changes.md`)

Log all changes with the verification checklist from the prompt.

## Technical Details

### Path Safety

The workspace deletion uses strict validation:
```javascript
const expectedPrefix = path.join(homedir, '.openclaw', 'workspace-');
if (!workspaceDir.startsWith(expectedPrefix)) {
  // Skip deletion, log warning
}
```

### Cron Job Identification

Jobs targeting the agent are identified by checking:
- `j.sessionTarget` matching agentIdShort
- `j.payload?.message` containing `@agent:<agentIdShort>` header
- `j.name` containing the agentIdShort (e.g. `heartbeat-ricky`)

### Agent Key Normalization

Uses the same pattern as provisioning:
```javascript
const parts = agentKey.split(':');
const agentIdShort = parts.length >= 2 ? parts[1] : agentKey;
```

### Mention Cleanup

The `mentions` table stores the short key (e.g. `ricky`), so cleanup queries use `agentIdShort` for that table while using the full `agentKey` for other tables.

### Files Changed

| File | Change |
|------|--------|
| `server/index.mjs` | Add `DELETE /api/agents/:agentKey` endpoint with full cascade cleanup |
| `src/lib/api.ts` | Rewrite `deleteAgent()` to call Control API first, enhanced Supabase fallback |
| `src/components/agent-tabs/AgentOverview.tsx` | Update confirmation dialog copy |
| `changes.md` | Log changes with verification checklist |

### Verification Checklist
1. Delete agent via dashboard -- OpenClaw no longer lists it (`openclaw agents list`)
2. Workspace directory `~/.openclaw/workspace-ricky` is removed
3. No cron jobs targeting ricky remain (`openclaw cron list`)
4. Supabase: no `agent_status`, `agent_mention_cursor`, `brain_docs`, `cron_mirror` rows for ricky
5. Supabase: queued `chat_delivery_queue` rows for ricky are removed
6. Supabase: `agents` row for ricky is gone
7. Supabase: `task_events` and `project_chat_messages` authored by ricky still exist
8. Supabase: `tasks` previously assigned to ricky still exist
9. Deleting again returns `{ ok: true }` (idempotent)
10. Cannot delete `agent:main:main` (blocked)
