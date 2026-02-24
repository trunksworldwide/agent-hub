

# Plan: War Room → Task Promotion + No-Loitering Rule

## Overview

Three features, all additive. No schema changes. Uses existing `task_events`, `activities`, `project_chat_messages`, and `chat_delivery_queue` tables.

---

## Feature 1: "Promote to Suggested Task" from War Room

**Current state:** ChatPage already has a `handleCreateTask` that opens `NewTaskDialog`. But:
- It doesn't prefill title/description from the message
- It doesn't set `is_proposed = true`
- It doesn't store source metadata linking back to the War Room message

**Changes:**

### `src/components/dialogs/NewTaskDialog.tsx`
- Add optional props: `defaultTitle`, `defaultDescription`, `isProposed` (boolean), `sourceMetadata` (object with `chat_message_id`)
- When `isProposed` is true, pass `is_proposed: true` to `createTask`
- Rename the Create button label to "Suggest Task" when `isProposed` is true

### `src/lib/api.ts` — `createTask`
- Accept optional `isProposed?: boolean` and `contextSnapshot?: object` in the input
- Pass `is_proposed` and `context_snapshot` to the Supabase insert row

### `src/components/pages/ChatPage.tsx`
- Update `handleCreateTask` to prefill `NewTaskDialog` with:
  - `defaultTitle` = first line of message (truncated to 80 chars)
  - `defaultDescription` = full message text
  - `isProposed = true`
  - `sourceMetadata = { chat_message_id: msg.id }`
- Update the button tooltip from "Create task from message" to "Suggest Task"
- Show the button on ALL messages (not just incoming) — any message can become a task
- After creation, show toast: "Suggested task created" with a link/mention of inbox

### `src/components/dialogs/NewTaskDialog.tsx` — dialog title
- When `isProposed`, dialog title = "Suggest Task from Message"

---

## Feature 2: Auto-clear `is_proposed` (already done)

Already implemented in the last diff. The plan confirms:
- `handleMoveTask` in TasksPage clears `isProposed` when moving out of inbox ✓
- `performStatusChange` in TaskDetailSheet does the same ✓
- Approval UI guards with `task.status === 'inbox'` ✓

No further work needed.

---

## Feature 3: No-Loitering Rule for In Progress

**Timeout: 30 minutes** (your vote).

### 3a. "Started" event on entering In Progress

**`src/components/pages/TasksPage.tsx` — `handleMoveTask`**
- After `updateTask`, if `newStatus === 'in_progress'` and `task.status !== 'in_progress'`:
  - Fire `createTaskEvent({ taskId, eventType: 'status_change', content: 'Started', metadata: { old_status: task.status, new_status: 'in_progress' } })` (best-effort, already happens in TaskDetailSheet but NOT in TasksPage board moves)

**`src/components/pages/TasksPage.tsx` — `handleMoveTask`** (kickoff message)
- If the task has an `assigneeAgentKey` and `newStatus === 'in_progress'`:
  - Call `sendChatMessage({ message: kickoff text, targetAgentKey: task.assigneeAgentKey })`
  - Kickoff text: `"🚀 Task started: **{title}**\n\nDescription: {description}\n\nPlease begin work and post updates to the task timeline."`
  - This uses existing delivery semantics (direct if Control API healthy, queued otherwise)

### 3b. Stale task watchdog (client-side polling)

This will be a lightweight React hook + UI component, not a server-side cron (keeping it simple and avoiding schema changes).

**New file: `src/hooks/useStaleTaskWatchdog.ts`**
- Accepts: list of tasks, agents list
- Every 5 minutes, checks all `in_progress` tasks:
  - For each, fetch latest `task_events` for that task
  - If no events from an agent author within the last 30 minutes:
    - Auto-post a system comment: `createTaskEvent({ taskId, eventType: 'comment', content: '⚠️ NEEDS ATTENTION: No agent activity in 30 minutes', author: 'system' })`
    - Post to War Room: `sendChatMessage({ message: '⚠️ Stale task: "{title}" — no agent activity in 30 minutes', targetAgentKey: task.assigneeAgentKey || undefined })`
    - Track which tasks have already been flagged (in a `Set`) to avoid re-flagging every 5 minutes. Reset when the task gets new activity.
- Returns: `staleTasks: Task[]` for optional UI display

**`src/components/pages/TasksPage.tsx`**
- Use the watchdog hook
- Optionally show a small amber banner at the top of the board: "N tasks need attention" when `staleTasks.length > 0`

### Graceful degradation
- All War Room messages use `sendChatMessage` which already handles offline queueing
- All task events use `createTaskEvent` which writes directly to Supabase
- If Control API is down, kickoff messages queue; watchdog comments still post to Supabase

---

## Files touched

| File | Change |
|------|--------|
| `src/components/dialogs/NewTaskDialog.tsx` | Add prefill props, `isProposed` flag, label changes |
| `src/lib/api.ts` (`createTask`) | Accept `isProposed`, `contextSnapshot` params |
| `src/components/pages/ChatPage.tsx` | Prefill dialog from message, update button label |
| `src/components/pages/TasksPage.tsx` | Add "Started" event + kickoff message on in_progress, integrate watchdog hook, optional stale banner |
| `src/hooks/useStaleTaskWatchdog.ts` | New hook for 30-min no-activity detection |
| `changes.md` | Log all three features |

## What stays the same
- No database schema changes
- No new tables or columns
- Task detail sheet, list view, blocked modal untouched
- All existing delivery semantics preserved
- All existing status flows preserved

