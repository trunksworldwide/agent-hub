

# Agent Heartbeat v2: Hourly Wake with Task Proposals, War Room, and Task Adoption

## Summary

Extend the Control API with read endpoints so agents can autonomously inspect tasks and chat, then auto-create an hourly heartbeat cron job at agent provisioning time. The heartbeat prompt instructs agents to propose tasks, assist active work, contribute to the war room, and complete their own assigned tasks.

## What Changes

### 1. New Control API Read Endpoints (server/index.mjs)

Four new GET endpoints using the service-role Supabase client (agents never get keys):

**A) `GET /api/tasks?status=...&limit=50&updated_since=...`**
- Reads from Supabase `tasks` table, scoped to project via `X-ClawdOS-Project` header
- Returns: `{ tasks: [{ id, title, status, assignee_agent_key, is_proposed, description, updated_at, created_at }] }`
- `status` param supports comma-separated values (e.g. `status=inbox,in_progress`)
- This replaces the existing `GET /api/tasks` (which reads from local `tasks.json`) -- the new version reads from Supabase when the service role is available, falling back to the file-based version

**B) `GET /api/tasks/:taskId/events?limit=50`**
- Reads recent `task_events` rows for a given task
- Returns: `{ events: [{ id, event_type, author, content, metadata, created_at }] }`

**C) `GET /api/chat/recent?thread_id=&limit=50`**
- Reads recent `project_chat_messages` rows
- If `thread_id` is omitted or empty, returns the war room thread (first thread created for the project, or all messages with null thread_id)
- Returns: `{ messages: [{ id, author, message, thread_id, created_at }] }`

**D) `POST /api/tasks/:taskId/assign`**
- Body: `{ assignee_agent_key }`
- Updates `tasks.assignee_agent_key` and emits a `task_events` row with `event_type: 'assignment_change'`
- Returns: `{ ok: true }`

**E) `POST /api/tasks/:taskId/status`**
- Body: `{ status, author? }`
- Updates `tasks.status` and emits a `task_events` row with `event_type: 'status_change'`
- Returns: `{ ok: true }`

### 2. Auto-Create Heartbeat at Provisioning

Modify **two places** where agents get provisioned:

**A) `server/index.mjs` -- `POST /api/agents/provision`** (direct provisioning path)
After seeding workspace files, create an hourly heartbeat cron job via the executor CLI:
```
openclaw cron create "Heartbeat — {displayName}" --every 3600000 --agent {agentIdShort} --system-event "{heartbeat instructions}"
```
Use a deterministic job name pattern (`heartbeat-{agentIdShort}`) to prevent duplicates on re-provision.

**B) `scripts/cron-mirror.mjs` -- `processProvisionRequests()`** (queued provisioning path)
Same logic: after provisioning succeeds, create the heartbeat cron job via the executor CLI.

### 3. Heartbeat Prompt (Instructions Baked into Cron Payload)

The heartbeat cron job's instructions will be a structured prompt (stored in the `instructions` field):

```
@agent:{agent_key}

HEARTBEAT — You are {displayName} ({role}).

Your goal: make the project better every hour with minimal noise.

BEFORE ACTING: Read the Context Pack injected above. Use project overview, shared priorities, and recent activity as your guide. Do NOT use long personal memory.

STEP 1 — PROPOSE TASKS (Inbox)
- Check how many proposed tasks from you are still pending. If 3+ exist, propose 0-1 instead.
- Propose 1-3 small, concrete tasks with clear outputs.
- Each proposal must include "why now" and expected deliverable.
- POST /api/tasks/propose with { author: "{agent_key}", title, description, assignee_agent_key: "{agent_key}" }

STEP 2 — ASSIST AN ACTIVE TASK
- GET /api/tasks?status=assigned,in_progress,blocked,review&limit=30
- Pick 1 task matching your role ({role}) that you can meaningfully help with.
- POST /api/tasks/:taskId/events with { event_type: "comment", content: "<your contribution>", author: "{agent_key}" }
- Contributions: clarifying question, next step, risk/edge case, or "I can take this".
- If claiming ownership and role permits: POST /api/tasks/:taskId/assign with { assignee_agent_key: "{agent_key}" }

STEP 3 — WAR ROOM
- GET /api/chat/recent?limit=50
- Contribute 0-2 messages MAX. Only if genuinely additive.
- Good: unblock someone, summarize progress, flag a risk, propose a micro-task.
- Bad: "checking in!", echoing what was just said, empty encouragement.
- POST /api/chat/post with { author: "{agent_key}", message: "<contribution>" }
- If nothing meaningful to say, say nothing.

STEP 4 — COMPLETE YOUR OWN WORK
- GET /api/tasks?status=in_progress,assigned&limit=30
- Filter for tasks where assignee_agent_key = "{agent_key}".
- For each task you own that has moved past "assigned": review progress, post an update, and if done, update status.
- POST /api/tasks/:taskId/status with { status: "done", author: "{agent_key}" } when complete.
- POST /api/tasks/:taskId/events with { event_type: "comment", content: "Completed: <summary>", author: "{agent_key}" }

ROLE-BASED GUIDANCE:
- Builder: propose implementable tasks, offer code patches, focus on shipping.
- QA: propose tests, edge cases, reproduction steps.
- PM/Operator: propose sequencing, acceptance criteria, progress summaries.
- Default to your role as defined in SOUL.md.

ANTI-SPAM RULES:
- Max 3 proposed tasks per heartbeat (fewer if many pending).
- Max 2 war room messages per heartbeat.
- If nothing is valuable, do nothing and exit quietly.
```

### 4. Dashboard-Side Read Helpers (src/lib/api.ts)

Add corresponding dashboard helpers that call the new read endpoints (with Supabase fallback for when Control API is offline):

- `fetchTasksViaControlApi(params)` -- calls `GET /api/tasks`, falls back to Supabase query
- `fetchTaskEventsViaControlApi(taskId)` -- calls `GET /api/tasks/:taskId/events`, falls back to Supabase
- `fetchRecentChatViaControlApi(threadId?)` -- calls `GET /api/chat/recent`, falls back to Supabase
- `assignTaskViaControlApi(taskId, agentKey)` -- calls `POST /api/tasks/:taskId/assign`, falls back to direct Supabase update
- `updateTaskStatusViaControlApi(taskId, status)` -- calls `POST /api/tasks/:taskId/status`, falls back to direct Supabase update

These are additive -- existing UI continues to work through Supabase directly. The helpers exist so agents (via Control API) and future dashboard features share the same bridge pattern.

### 5. Documentation and Changelog

**Update `docs/CONTROL-API-BRIDGE.md`** with the new endpoints.

**Update `changes.md`** with:
- New read endpoints added to Control API
- Auto-heartbeat created at agent provisioning
- Heartbeat prompt with 4-step autonomous behavior
- Verification checklist

## Technical Details

### War Room Thread Convention
- Thread ID = `null` means "war room" (general channel). The `GET /api/chat/recent` endpoint treats missing/null `thread_id` as the war room.
- This matches existing behavior in `ChatPage` where the general thread is the default.

### Duplicate Heartbeat Prevention
- Use deterministic cron job name: `heartbeat-{agentIdShort}`
- Before creating, check existing jobs via `openclaw cron list --json` and skip if a job with that name already exists.
- The `scheduleAgentDigest` function already exists as a pattern for this.

### Task Status Values Used
Based on the `TaskStatus` type: `'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked'`

### Files Changed

| File | Change |
|------|--------|
| `server/index.mjs` | Add 5 new endpoints (GET tasks, GET task events, GET chat recent, POST task assign, POST task status). Modify provisioning to auto-create heartbeat cron. |
| `scripts/cron-mirror.mjs` | Add heartbeat cron creation in `processProvisionRequests()` after successful provisioning. |
| `src/lib/api.ts` | Add dashboard-side read/write helpers with Control API + Supabase fallback. |
| `docs/CONTROL-API-BRIDGE.md` | Document new endpoints and heartbeat contract. |
| `changes.md` | Log all changes with verification checklist. |

### Verification Checklist
1. Provision a new agent -- heartbeat cron job appears in Schedule page
2. Run heartbeat once manually -- proposed tasks appear in Inbox
3. Heartbeat posts a comment on an active task (check TaskTimeline)
4. Heartbeat posts at most 2 war room messages (check Chat page)
5. Re-provisioning same agent does NOT create duplicate heartbeat job

