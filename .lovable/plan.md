

# Scheduled Jobs: Agent Assignment + Context Pack Injection

## Executive Summary

This plan extends the Schedule/Cron system to explicitly assign jobs to agents and ensure every run receives the correct Context Pack. This integrates with the recently-built Context Flow Architecture and aligns with OpenClaw's native cron system which already supports `agentId` binding.

**Key outcomes:**
1. Every scheduled job has a clear **target agent** (visible in UI, stored in DB)
2. Jobs have semantic **intent labels** for filtering (daily_brief, monitoring, etc.)
3. Context Pack is **automatically injected** when jobs run
4. Mirror + Queue pattern preserved - dashboard works without executor

---

## Current State Analysis

### What exists today:

| Component | Status | Notes |
|-----------|--------|-------|
| `cron_mirror` table | Basic | Has schedule, name, instructions - no agent_key or intent fields |
| `cron_create_requests` | Basic | No explicit agent targeting |
| `cron_job_patch_requests` | Basic | No agent targeting in patch_json |
| Target Agent in UI | Partial | Create dialog has dropdown, encodes as `@target:` prefix in instructions |
| Display in list | Missing | No agent badge shown on job rows |
| Context Pack | Built | `get-context-pack` edge function ready |

### OpenClaw cron system (reference):

- `agentId` field for agent binding
- `sessionTarget`: main vs isolated
- `payload.kind`: systemEvent vs agentTurn
- Jobs stored in `~/.openclaw/cron/jobs.json`
- CLI: `openclaw cron add --agent <id>`

---

## Architecture Alignment

The existing `@target:agent_key` encoding in instructions is a workaround. OpenClaw's native `agentId` field is the proper mechanism. Our plan:

1. Add explicit fields to `cron_mirror` for visibility (read-only from UI)
2. Use `agentId` in the actual cron payload on the executor
3. Mirror worker extracts and populates the mirror fields
4. UI reads from mirror, writes to request queues

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CRON ASSIGNMENT FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Dashboard (Supabase)              Executor (Mac mini)         │
│   ───────────────────               ──────────────────          │
│   1. User creates job               4. Polls cron_create_reqs   │
│   2. Writes to cron_create_requests 5. Creates job with agentId │
│   3. UI shows "pending"             6. Updates cron_mirror      │
│                                     7. On run: fetch context    │
│                                        pack, inject into run    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Extensions

### 1.1 Extend `cron_mirror` table

Add visibility fields (populated by executor's mirror sync):

```sql
ALTER TABLE cron_mirror ADD COLUMN target_agent_key TEXT DEFAULT NULL;
ALTER TABLE cron_mirror ADD COLUMN job_intent TEXT DEFAULT NULL;
ALTER TABLE cron_mirror ADD COLUMN context_policy TEXT DEFAULT 'default';
ALTER TABLE cron_mirror ADD COLUMN ui_label TEXT DEFAULT NULL;

CREATE INDEX idx_cron_mirror_agent ON cron_mirror(project_id, target_agent_key);
CREATE INDEX idx_cron_mirror_intent ON cron_mirror(project_id, job_intent);
```

**Field definitions:**
- `target_agent_key`: Which agent owns/runs this job (e.g., `agent:trunks:main`)
- `job_intent`: Semantic category (daily_brief, task_suggestions, monitoring, housekeeping, sync, custom)
- `context_policy`: How much context to include (minimal, default, expanded)
- `ui_label`: Optional human-friendly override for job name display

### 1.2 Extend `cron_create_requests` table

Add fields so the executor knows what to create:

```sql
ALTER TABLE cron_create_requests ADD COLUMN target_agent_key TEXT DEFAULT NULL;
ALTER TABLE cron_create_requests ADD COLUMN job_intent TEXT DEFAULT NULL;
ALTER TABLE cron_create_requests ADD COLUMN context_policy TEXT DEFAULT 'default';
```

### 1.3 Extend `cron_job_patch_requests` 

The `patch_json` JSONB field already supports arbitrary patches. We'll document the expected shape:

```typescript
interface CronPatchPayload {
  scheduleKind?: string;
  scheduleExpr?: string;
  tz?: string;
  enabled?: boolean;
  instructions?: string;
  // New fields:
  targetAgentKey?: string | null;  // null = unassign
  jobIntent?: string;
  contextPolicy?: string;
}
```

---

## Phase 2: Job Intent Categories

Define a fixed set of intents for clarity and filtering:

| Intent | Description | Typical Schedule |
|--------|-------------|------------------|
| `daily_brief` | Morning/evening summaries | Daily at specific time |
| `task_suggestions` | Propose new tasks or priorities | Daily/weekly |
| `monitoring` | Health checks, alerts, status | Every 5-30 mins |
| `housekeeping` | Cleanup, archival, maintenance | Weekly/nightly |
| `sync` | Data synchronization, updates | Frequent intervals |
| `custom` | User-defined purpose | Any |

These are soft labels - not enforced, but help with filtering and understanding.

---

## Phase 3: UI Updates

### 3.1 Job List: Show Agent Assignment

Add to each `CronJobRow`:

```text
┌─────────────────────────────────────────────────────────────────┐
│ ○ ClawdOS Morning Standup                            ▢ ▶ 🗑    │
│   🤖 Trunks • daily_brief                                      │
│   Daily at 8:00 AM ET                                          │
└─────────────────────────────────────────────────────────────────┘
```

Visual elements:
- Agent badge with emoji + name (or "Unassigned" if null)
- Intent badge (pill-style, subtle color)

### 3.2 Job List: Agent Assignment Control

Add inline dropdown to reassign agents:
- Dropdown listing project agents
- "Unassigned" option
- On change: queue a patch request
- Show "Pending" badge while waiting for executor

### 3.3 Job List: Filtering

Add filter bar:
- **By Agent**: All | Agent dropdown | Unassigned
- **By Intent**: All | daily_brief | monitoring | ...
- **By Status**: All | Enabled | Disabled

### 3.4 Create Dialog Updates

Current: Target Agent dropdown exists but stores as `@target:` prefix.

Changes:
- Make Target Agent more prominent (move up, add explanation)
- Add Job Intent dropdown (optional, defaults to "custom")
- Add Context Policy dropdown (optional, defaults to "default")
- Remove `@target:` encoding - pass as explicit field in request

### 3.5 Edit Dialog Updates

Add fields to patch an existing job:
- Target Agent reassignment
- Job Intent change
- Context Policy change

---

## Phase 4: API Updates

### 4.1 Extend `queueCronCreateRequest`

```typescript
export async function queueCronCreateRequest(input: {
  name: string;
  scheduleKind?: string;
  scheduleExpr: string;
  tz?: string;
  instructions?: string;
  // New fields:
  targetAgentKey?: string;
  jobIntent?: string;
  contextPolicy?: string;
}): Promise<{ ok: boolean; requestId?: string; error?: string }>
```

### 4.2 Extend `CronMirrorJob` interface

```typescript
export interface CronMirrorJob {
  // ... existing fields ...
  targetAgentKey?: string | null;
  jobIntent?: string | null;
  contextPolicy?: string | null;
  uiLabel?: string | null;
}
```

### 4.3 Update `getCronMirrorJobs` 

Include new fields in SELECT query.

### 4.4 New helper: `updateCronJobAgent`

Convenience function for reassigning:

```typescript
export async function updateCronJobAgent(
  jobId: string, 
  targetAgentKey: string | null
): Promise<{ ok: boolean; error?: string }>
```

---

## Phase 5: Executor Contract (Context Pack Injection)

The Mac mini executor must inject Context Pack on every cron run. This is the **critical enforcement point**.

### 5.1 Execution Flow

When a cron job fires:

```text
1. Resolve target_agent_key from job payload (or mirror)
2. If target_agent_key is set:
   a. Call get-context-pack(project_id, target_agent_key, task_id?)
   b. Prepend context markdown to the agent's system prompt
   c. Log context_pack_version in run metadata
3. If target_agent_key is null:
   a. Run without agent-specific context (global context only)
   b. Log warning: "Running job without agent assignment"
4. Execute the job
5. Update cron_mirror with run results
6. Log activity to activities table
```

### 5.2 Context Pack Fetch

The executor should call the edge function:

```bash
curl -X POST $SUPABASE_URL/functions/v1/get-context-pack \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -d '{
    "projectId": "front-office",
    "agentKey": "agent:trunks:main"
  }'
```

Response includes `markdown` field ready to inject.

### 5.3 Failure Handling

If context pack fetch fails:
- Log warning (don't fail the job)
- Run with degraded context (include warning in prompt)
- Record `context_pack_status: "failed"` in run metadata

### 5.4 Mirror Sync Updates

When syncing to `cron_mirror`, the executor should:
1. Parse `agentId` from the OpenClaw job config
2. Map to `target_agent_key` format: `agent:<name>:main`
3. Parse job intent from name/description or explicit field
4. Populate mirror row with all metadata

---

## Phase 6: Integration with Existing Encoding

### Migration Path

The current `@target:agent_key` prefix in instructions must be handled:

1. **On create**: Use explicit field, don't encode in instructions
2. **On display**: Check both `target_agent_key` field AND parse from instructions (fallback)
3. **On executor sync**: If job has `@target:` prefix, extract and populate mirror field
4. **Future**: Clean up legacy encoding during edits

```typescript
// Enhanced decodeTargetAgent for backwards compat
function getEffectiveTargetAgent(job: CronMirrorJob): string | null {
  // Prefer explicit field
  if (job.targetAgentKey) return job.targetAgentKey;
  
  // Fallback: parse from instructions
  if (job.instructions) {
    const { targetAgent } = decodeTargetAgent(job.instructions);
    return targetAgent;
  }
  
  return null;
}
```

---

## Phase 7: Types & Constants

### 7.1 Job Intent Constants

```typescript
// src/lib/schedule-utils.ts

export const JOB_INTENTS = [
  { id: 'daily_brief', label: 'Daily Brief', description: 'Morning/evening summaries' },
  { id: 'task_suggestions', label: 'Task Suggestions', description: 'Propose tasks or priorities' },
  { id: 'monitoring', label: 'Monitoring', description: 'Health checks and alerts' },
  { id: 'housekeeping', label: 'Housekeeping', description: 'Cleanup and maintenance' },
  { id: 'sync', label: 'Sync', description: 'Data synchronization' },
  { id: 'custom', label: 'Custom', description: 'User-defined' },
] as const;

export type JobIntent = typeof JOB_INTENTS[number]['id'];

export const CONTEXT_POLICIES = [
  { id: 'minimal', label: 'Minimal', description: 'Overview + recent changes only' },
  { id: 'default', label: 'Default', description: 'Full context pack' },
  { id: 'expanded', label: 'Expanded', description: 'Include unpinned relevant docs' },
] as const;

export type ContextPolicy = typeof CONTEXT_POLICIES[number]['id'];
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/...` | Create | Add columns to cron tables |
| `src/lib/api.ts` | Edit | Extend types and API functions |
| `src/lib/schedule-utils.ts` | Edit | Add intent/policy constants |
| `src/integrations/supabase/types.ts` | Edit | Regenerate with new columns |
| `src/components/pages/CronPage.tsx` | Edit | Show agent/intent, add filters |
| `src/components/schedule/JobIntentBadge.tsx` | Create | Intent display component |
| `src/components/schedule/AgentAssignmentDropdown.tsx` | Create | Inline agent selector |
| `docs/CONTEXT-FLOW.md` | Edit | Document cron integration |
| `changes.md` | Edit | Document feature |

---

## Implementation Order

### Batch 1: Schema + Types
1. Database migration (add columns)
2. Update TypeScript types
3. Add constants to schedule-utils.ts

### Batch 2: API Layer
4. Update `CronMirrorJob` interface
5. Update `getCronMirrorJobs` to fetch new fields
6. Update `queueCronCreateRequest` to accept new fields
7. Add `updateCronJobAgent` helper

### Batch 3: UI - Display
8. Create `JobIntentBadge` component
9. Update `CronJobRow` to show agent + intent
10. Add filter bar to CronPage

### Batch 4: UI - Editing
11. Create `AgentAssignmentDropdown` component
12. Update Create dialog with explicit fields
13. Update Edit dialog with reassignment

### Batch 5: Documentation
14. Update CONTEXT-FLOW.md with cron section
15. Update changes.md

---

## Success Criteria

1. Every job in the Schedule list shows which agent owns it
2. Jobs can be filtered by agent and intent
3. New jobs are created with explicit agent assignment (no prefix encoding)
4. Existing jobs with `@target:` prefix still work (backwards compat)
5. Executor contract is documented for Context Pack injection
6. Dashboard works fully when executor is offline (queue model preserved)

---

## Out of Scope (Future Work)

- Executor-side implementation of Context Pack injection (documented contract only)
- OpenClaw `sessionTarget` (main vs isolated) - keep current behavior
- Job delivery configuration (channel targeting)
- Task creation policy (jobs that auto-create tasks)
- Context Pack analytics (which docs are used)

---

## Failure Modes & Edge Cases

| Scenario | Handling |
|----------|----------|
| Job assigned to deleted agent | Show "Agent not found" badge, allow reassignment |
| Context pack fetch fails | Run with warning, log degraded state |
| Unassigned job | Run without agent context, show "Unassigned" in UI |
| Legacy `@target:` job | Parse and display, convert on next edit |
| Multiple pending patches | Last wins (queue is FIFO) |

---

## Documentation Updates

Add section to `docs/CONTEXT-FLOW.md`:

```markdown
## Scheduled Job Context

When a scheduled job runs, the executor:

1. Resolves the target agent from job configuration
2. Calls `get-context-pack` with project + agent + optional task
3. Prepends the context markdown to the job's instructions
4. Runs the agent turn with full context

This ensures consistent context delivery regardless of:
- Whether the job is main-session or isolated
- The job's schedule frequency
- Manual vs automated execution
```

