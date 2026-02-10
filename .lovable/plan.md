

# Fix: Agents Stuck on "Provisioning..."

## Root Cause

Both agents were created before the provisioning code was deployed. No `agent_provision_requests` rows exist, and nothing will ever set `provisioned = true`.

- **Trunks** (`agent:main:main`): The primary agent already running on the Mac mini. It should always be considered provisioned.
- **Ricky** (`agent:ricky:main`): Created before provisioning was wired up. Needs a queued provision request or manual fix.

## Changes

### 1. Migration: backfill Trunks as provisioned

A small SQL migration to mark the primary agent as provisioned, since it already exists on the Mac mini:

```sql
UPDATE agents
SET provisioned = true,
    agent_id_short = 'main',
    workspace_path = '/Users/trunks/clawd'
WHERE project_id = 'front-office'
  AND agent_key = 'agent:main:main';
```

### 2. Migration: queue a provision request for Ricky

Insert a row into `agent_provision_requests` so the cron-mirror worker picks it up:

```sql
INSERT INTO agent_provision_requests (project_id, agent_key, agent_id_short, display_name, emoji, role_short, status)
VALUES ('front-office', 'agent:ricky:main', 'ricky', 'Ricky', '🔬', 'Research Agent', 'queued');
```

Once the cron-mirror worker on your Mac mini picks this up, it will provision Ricky and set `provisioned = true`.

### 3. AgentsPage.tsx: skip provisioning badge for the primary agent

Update the UI so the primary agent (agent_key ending with `main:main` or where `agent_id_short = 'main'`) never shows "Provisioning..." even if the flag hasn't been set yet. This is a safety net so the default agent always looks correct.

### 4. AgentsPage.tsx: add a "Retry Provisioning" button

For agents stuck in provisioning (e.g., if the worker never ran or errored), add a small button that inserts a new `agent_provision_requests` row with `status = 'queued'`. This gives the user a way to unstick agents without needing to dig into SQL.

## Files to modify

| File | Change |
|------|--------|
| `supabase/migrations/xxx_backfill_agents.sql` | Backfill Trunks + queue Ricky |
| `src/components/pages/AgentsPage.tsx` | Skip badge for primary agent; add retry button |

## What this does NOT change

- No changes to the provisioning logic itself (it's correct, just never triggered for these agents)
- No changes to server/index.mjs or cron-mirror.mjs
- No changes to createAgent() (future agents will work correctly)

