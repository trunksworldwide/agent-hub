# Cron Agent Assignment + Durable Persistence

## Status: ✅ COMPLETED

## Summary

Fixed the "Unassigned" display issue for cron jobs and improved UI layout. Agent assignments are now durably persisted in **both** the DB columns and as headers in the job instructions.

## Key Changes

### 1. Dual-Path Persistence (Belt + Suspenders)

Agent/intent info is stored in:
- **Explicit DB columns**: `target_agent_key`, `job_intent` for quick UI access
- **Encoded headers in instructions**: For executor durability and mirror sync

Header format in instructions:
```text
@agent:agent:main:main
@intent:daily_brief
---
[actual instructions]
```

### 2. New Functions in `schedule-utils.ts`

- `encodeJobHeaders(agentKey, intent, instructions)` - Encode metadata into instructions
- `decodeJobHeaders(instructions)` - Extract `{ targetAgent, intent, body }` from instructions

Both support legacy `@target:` format for backwards compatibility.

### 3. CronPage Updates

- **Job creation**: Encodes agent + intent into instructions via `encodeJobHeaders()`
- **Agent reassignment**: Decodes existing instructions, re-encodes with new agent
- **Display**: Uses `getEffectiveTargetAgent()` and `getEffectiveIntent()` that check both DB fields and parsed instructions
- **Layout**: Agent badge + intent badge now inline on same line

### 4. AgentAssignmentDropdown Polish

- Shows "Needs assignment" with amber warning text when no agent selected
- Cleaner compact mode styling with smaller chevron icon
- Higher z-index on popover for proper layering

## How It Works

### Creating New Jobs

1. User fills in form with target agent and intent
2. `handleCreate()` calls `encodeJobHeaders()` to embed metadata in instructions
3. Both explicit fields AND encoded instructions are sent to `queueCronCreateRequest`
4. Executor creates job with durable payload

### Reassigning Existing Jobs

1. User clicks agent dropdown on job row
2. `handleAgentChange()` calls `decodeJobHeaders()` to get current body
3. Re-encodes with new agent + existing intent via `encodeJobHeaders()`
4. Queues patch with both `targetAgentKey` field AND updated instructions
5. When executor applies, job payload has durable assignment

### Displaying Agent Info

1. `getEffectiveTargetAgent()` checks `job.targetAgentKey` first
2. Falls back to parsing `@agent:` or `@target:` from instructions
3. Same for `getEffectiveIntent()` with `@intent:` header

## Migration for Existing Jobs

Users can manually reassign legacy jobs:
1. Click the agent dropdown on a job row
2. Select an agent (e.g., Trunks)
3. Patch is queued with updated instructions
4. After executor applies, assignment is durable

## Files Changed

| File | Description |
|------|-------------|
| `src/lib/schedule-utils.ts` | Added `encodeJobHeaders()` and `decodeJobHeaders()` |
| `src/components/pages/CronPage.tsx` | Updated create/reassign to encode headers, improved layout |
| `src/components/schedule/AgentAssignmentDropdown.tsx` | "Needs assignment" amber badge, polished styling |
