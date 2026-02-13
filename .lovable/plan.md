
# Eliminate "Unassigned" Scheduled Jobs

## Summary

Remove the concept of unassigned scheduled jobs. All jobs default to the main agent (Trunks) when no owner is specified. This affects the agent filter dropdown, the create/edit dialogs, the inline assignment dropdown, the cron mirror script, and the Control API response normalization.

## Changes

### 1. CronPage UI (`src/components/pages/CronPage.tsx`)

**Agent Filter dropdown (lines 1236-1253):**
- Remove `<SelectItem value="unassigned">Unassigned</SelectItem>` from the filter dropdown
- Remove the `agentFilter === 'unassigned'` branch in the filter logic (lines 584-585)

**Edit Dialog (lines 1619-1639):**
- Remove the "No agent assigned" / `value="none"` option from the agent selector
- Default `editTargetAgent` to `'agent:main:main'` when the job has no agent (instead of empty string)
- In `openEdit()`, if the decoded target agent is null/empty, set `editTargetAgent` to `'agent:main:main'`

**Create Dialog (lines 1790-1808):**
- Remove `<SelectItem value="">No specific agent</SelectItem>` from the agent selector
- Change `createTargetAgent` initial state from `''` to find the main agent or default to `'agent:main:main'`
- After resetting on create, reset `createTargetAgent` to the main agent key instead of `''`

**`handleAgentChange` toast (line 866):**
- Remove the `'Unassigned'` fallback text; always show agent name since null assignments are no longer possible

**`getEffectiveTargetAgent` helper (lines 531-538 and 180-187):**
- If the function returns null, default to `'agent:main:main'` (the main agent key)

### 2. AgentAssignmentDropdown (`src/components/schedule/AgentAssignmentDropdown.tsx`)

**Compact mode (lines 67-72):**
- Replace "Needs assignment" amber warning with the main agent display when value is null/empty

**Compact popover (lines 83-87):**
- Remove the "Unassigned" command item (`value=""`)

**Full mode (lines 134-138):**
- Remove the "No specific agent" command item (`value=""`)

**`onChange` handler:**
- When the component would call `onChange(null)`, instead call `onChange('agent:main:main')` or simply prevent the unassign action

### 3. Cron Mirror Script (`scripts/cron-mirror.mjs`)

**`mirrorCronList()` rows mapping (lines 184-204):**
- Extract agent key from `j.payload.message` (parse the `@agent:` header) or from `j.sessionTarget` or equivalent executor field
- If no agent is found, set `target_agent_key: 'agent:main:main'`
- Add `target_agent_key` to the upsert row data

This ensures every mirrored row always has a non-null `target_agent_key`.

### 4. Control API (`server/index.mjs`)

In the `/api/cron` response (wherever cron jobs are returned to the UI):
- Normalize `target_agent_key`: if null/empty, set to `'agent:main:main'`

In cron create/edit endpoints:
- If no `targetAgentKey` is provided, default to `'agent:main:main'`

### 5. One-time Cleanup (optional, in `scripts/cron-mirror.mjs`)

After the mirror upsert, run a best-effort cleanup:
```sql
UPDATE cron_mirror 
SET target_agent_key = 'agent:main:main' 
WHERE project_id = ? AND (target_agent_key IS NULL OR target_agent_key = '')
```

This catches any existing rows that were mirrored before the fix.

### 6. Changelog (`changes.md`)

Log all changes with verification steps.

## Technical Details

### Main Agent Key Convention
The main agent (Trunks) uses `agent:main:main` as its canonical agent key. This matches the existing identity system documented in the memories.

### Files Changed

| File | Change |
|------|--------|
| `src/components/pages/CronPage.tsx` | Remove "Unassigned" filter option, default create/edit agent to main, normalize `getEffectiveTargetAgent` to never return null |
| `src/components/schedule/AgentAssignmentDropdown.tsx` | Remove "Unassigned"/"No specific agent" options, default to main agent display |
| `scripts/cron-mirror.mjs` | Add `target_agent_key` to mirror rows (default to `agent:main:main`), add one-time cleanup UPDATE |
| `server/index.mjs` | Normalize `target_agent_key` in cron responses, default to main in create/edit |
| `changes.md` | Log changes and verification checklist |

### Verification Checklist
1. Open Schedule page -- no "Unassigned" filter option in the Agent dropdown
2. Existing jobs that had no agent now show "Trunks (main)" or the main agent badge
3. Create a new job -- agent selector defaults to main, no "No specific agent" option
4. Edit a job -- agent selector has no "No agent assigned" option, defaults to main
5. Run cron-mirror -- all `cron_mirror` rows have non-null `target_agent_key`
6. Inline agent dropdown on job rows -- no "Unassigned" or "Needs assignment" display
