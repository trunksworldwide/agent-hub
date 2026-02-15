
# Autonomous Agent Wake Routine: System Prompt Updates + Default Heartbeat at Creation

## Summary

Three changes to ensure every new agent automatically participates in the war room and tasks on wake:

1. Update SOUL.md generator prompt to include "War Room + Wake Routine" policy
2. Update USER.md generator prompt to include "Interrupt / Participation" guidance
3. Add default heartbeat cron job creation at agent creation time (Supabase-only path)

The Control API read endpoints (GET /api/tasks, GET /api/tasks/:taskId/events, GET /api/chat/recent) already exist -- no new endpoints needed.

## What Already Exists

- The server provisioning path (`POST /api/agents/provision`) already creates a heartbeat cron job automatically
- The `buildHeartbeatInstructions()` function in `server/index.mjs` already references all 5 steps (mentions, tasks, war room, own work)
- Bridge read endpoints already serve bounded slices of tasks, task events, and chat messages
- The `queueCronCreateRequest()` function in `src/lib/api.ts` can create cron jobs via Supabase

## What's Missing

1. **SOUL.md prompt**: No "War Room + Wake Routine" policy section -- agents don't know participation norms
2. **USER.md prompt**: No war room vs. direct ping guidance
3. **Supabase-only agent creation**: When the Control API is offline (or not configured), `createAgent()` in `src/lib/api.ts` queues a provision request but does NOT create a heartbeat. Only the server-side provisioning path creates one. This means agents created while the executor is down never get a heartbeat until manually provisioned.

## Changes

### 1. Edge Function: `supabase/functions/generate-agent-docs/index.ts`

**SOUL_SYSTEM_PROMPT** -- Add a required section after "Reporting":

```
- Must include a "War Room + Wake Routine (Policy)" section:
  - On each wake, check for ways to contribute (war room + active tasks)
  - Contribution rules: be additive, do not spam (default 0-2 posts per wake unless urgent)
  - If tagged/DM'd, respond first (before proposing new work)
  - Bounded context rule: never read endless history; prefer "last N messages" and "recent task events"
  - If you find actionable work, either:
    - comment on an active task thread, or
    - propose a small task for approval, or
    - post one concise war room message
  - Always make work visible: link outputs, write a task event, or post to war room
  - If capabilities_contract is provided, reference it for available endpoints
  - If capabilities_contract is empty, include: "Ask what the war room is and how to read it."
```

**USER_SYSTEM_PROMPT** -- Add after "Blockers / Missing Access":

```
- Include Interrupt / Participation:
  - When to speak in war room vs when to ping Zack directly
  - Default: don't interrupt Zack; post updates where the project prefers
  - Interrupt only on urgent/high-impact items (security, money, external actions)
```

### 2. Client-side: `src/lib/api.ts` -- `createAgent()`

After the provisioning block (line ~623), add a default heartbeat cron job creation via `queueCronCreateRequest()`. This ensures that even when the Control API is offline, a heartbeat job is queued for the agent.

The heartbeat instructions will use the same structure as `buildHeartbeatInstructions()` in `server/index.mjs` but as a simpler version suitable for the Supabase queue.

Guard against duplicates: only queue if `purposeText` (role) is provided (same guard as the AI doc generation).

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/generate-agent-docs/index.ts` | Add "War Room + Wake Routine" to SOUL prompt; add "Interrupt / Participation" to USER prompt |
| `src/lib/api.ts` | Queue default heartbeat cron job in `createAgent()` for Supabase-only path |

### What We Are NOT Changing

- `server/index.mjs` -- already creates heartbeats at provisioning; `buildHeartbeatInstructions()` already covers all steps
- No new bridge endpoints needed -- GET /api/tasks, GET /api/tasks/:taskId/events, GET /api/chat/recent already exist with bounded limits
- No UI changes
- No new tables or migrations
