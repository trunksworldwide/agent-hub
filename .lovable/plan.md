

# Task Stop/Delete, @Mentions, and War Room Context

## Summary

Three features implemented with minimal diffs: (A) stop and soft-delete tasks with audit trails, (B) @mentions system with server-side extraction and cursor-based deduplication, (C) updated heartbeat prompt for mention responses and war room context in proposals.

## A. Task Stop and Delete

### Database Migration

Add two columns to the `tasks` table:
- `deleted_at` (timestamptz, nullable, default null)
- `deleted_by` (text, nullable, default null)

Add `stopped` as a recognized status (no schema change needed -- `status` is already text).

### Control API Endpoints (`server/index.mjs`)

**`POST /api/tasks/:taskId/stop`**
- Body: `{ author?, reason? }`
- Sets `tasks.status = 'stopped'`
- Emits `task_events` row with `event_type: 'status_change'`, metadata `{ old_status, new_status: 'stopped', reason }`
- Returns `{ ok: true }`

**`POST /api/tasks/:taskId/delete`** (using POST instead of DELETE to avoid CORS complexity)
- Body: `{ author? }`
- Sets `tasks.deleted_at = now()`, `tasks.deleted_by = author`
- Emits `task_events` row with `event_type: 'task_deleted'`
- Idempotent: if already deleted, returns `{ ok: true }` without error

### Dashboard Helpers (`src/lib/api.ts`)

- Add `stopTask(taskId, reason?, author?)` -- calls `POST /api/tasks/:taskId/stop` with Supabase fallback
- Add `softDeleteTask(taskId, author?)` -- calls `POST /api/tasks/:taskId/delete` with Supabase fallback
- Update `TaskStatus` type to include `'stopped'`
- Update `Task` interface to include `deletedAt?: string | null`
- Update `getTasks()` to filter out rows where `deleted_at IS NOT NULL`
- Update `updateTask()` patch type to include `deletedAt` and `deletedBy`

### UI Changes

**`TaskDetailSheet.tsx`:**
- Add "Stop" button (Square icon, orange variant) and "Delete" button (Trash2 icon, ghost/destructive) in the header area
- Stop triggers a `StopTaskDialog` (confirmation + optional reason, same pattern as `RejectConfirmDialog`)
- Delete triggers a `DeleteTaskConfirmDialog` with copy: "This will hide the task from the board. Task history is preserved for audit."
- Add `stopped` to the `STATUS_COLUMNS` array

**New components:**
- `StopTaskDialog.tsx` -- confirmation with optional reason textarea
- `DeleteTaskConfirmDialog.tsx` -- simple confirmation dialog

**`TaskListView.tsx`:**
- Add `stopped` to `STATUS_LABELS` and `STATUS_COLORS`
- Add "Show Stopped" checkbox filter (same pattern as "Show Done")

## B. @Mentions System

### Database Migration

**`mentions` table:**
- `id` uuid PK default gen_random_uuid()
- `project_id` text NOT NULL
- `agent_key` text NOT NULL (normalized short key, e.g. `ricky`)
- `source_type` text NOT NULL (`chat_message` or `task_event`)
- `source_id` uuid NOT NULL
- `task_id` uuid nullable
- `thread_id` uuid nullable
- `author` text NOT NULL (who wrote the mention)
- `excerpt` text nullable (first 200 chars of source content)
- `created_at` timestamptz default now()
- Unique: `(project_id, agent_key, source_type, source_id)`
- RLS: **enabled but no permissive policies for anon** -- all access goes through Control API (service role)

**`agent_mention_cursor` table:**
- `project_id` text NOT NULL
- `agent_key` text NOT NULL
- `last_seen_at` timestamptz NOT NULL default '1970-01-01T00:00:00Z'
- `updated_at` timestamptz default now()
- PK: `(project_id, agent_key)`
- RLS: **enabled but no permissive policies for anon** -- all access goes through Control API (service role)

### Mention Extraction Logic (`server/index.mjs`)

Shared function:

```javascript
function extractMentionKeys(text, knownAgentKeys) {
  // Match @word (simple) and @agent:key:main (full form)
  const raw = [];
  const simpleRegex = /@([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = simpleRegex.exec(text)) !== null) {
    raw.push(match[1]);
  }
  // Normalize: "agent:ricky:main" -> "ricky", "ricky" -> "ricky"
  const normalized = raw.map(r => {
    const parts = r.split(':');
    return parts[0] === 'agent' && parts.length >= 2 ? parts[1] : r;
  });
  // Validate against known agent keys
  return [...new Set(normalized)].filter(k => knownAgentKeys.has(k));
}
```

The `knownAgentKeys` set is fetched lazily from the `agents` table (cached briefly) to validate mentions.

### Server-Side Population

After inserting in:
- `POST /api/tasks/:taskId/events` -- extract mentions from `content`, insert into `mentions` (best-effort)
- `POST /api/chat/post` -- extract mentions from `message`, insert into `mentions` (best-effort)

### Control API Read/Write Endpoints

**`GET /api/mentions?agent_key=<key>&since=<ISO>&limit=50`**
- Reads from `mentions` table where `agent_key = key` and `created_at > since`
- Returns `{ mentions: [{ id, source_type, source_id, task_id, thread_id, author, excerpt, created_at }] }`

**`POST /api/mentions/ack`**
- Body: `{ agent_key, last_seen_at }` (the max `created_at` from processed mentions)
- Updates `agent_mention_cursor` using `GREATEST(existing.last_seen_at, incoming.last_seen_at)` to prevent skipping
- Upserts to handle first-time ack
- Returns `{ ok: true }`

## C. Heartbeat Prompt Updates (`server/index.mjs`)

Update `buildHeartbeatInstructions()` to prepend a new **STEP 0**:

```
STEP 0 -- CHECK @MENTIONS (do this first)
- GET /api/mentions?agent_key={agentIdShort}&since=<your last cursor>
  (If you don't know your cursor, use a recent timestamp like 1 hour ago.)
- For each new mention:
  - If source_type = "task_event": respond via POST /api/tasks/:taskId/events
    with { event_type: "comment", content: "<your response>", author: "{agentKey}" }
  - If source_type = "chat_message": respond via POST /api/chat/post
    with { message: "<your response>", thread_id: <same thread_id or null>, author: "{agentKey}" }
  - Keep responses brief, helpful, and on-topic.
- After responding to all: POST /api/mentions/ack
  with { agent_key: "{agentIdShort}", last_seen_at: "<max created_at from mentions you processed>" }
```

Update **STEP 3 (War Room)** to add context inclusion guidance:

```
- When proposing a task derived from war room discussion, include a
  "Context (war room)" section in the description with relevant message
  excerpts (max 5 messages, include timestamps).
- GET /api/chat/recent?limit=100 (bounded read, never request more).
```

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_task_stop_delete_mentions.sql` | Add `deleted_at`/`deleted_by` to tasks, create `mentions` table with RLS enabled (no anon policies), create `agent_mention_cursor` table with RLS enabled (no anon policies) |
| `server/index.mjs` | Add `POST /api/tasks/:taskId/stop`, `POST /api/tasks/:taskId/delete`, `GET /api/mentions`, `POST /api/mentions/ack`. Add `extractMentionKeys()`. Populate mentions on chat/event writes. Update `buildHeartbeatInstructions()`. No CORS changes needed (all endpoints use POST). |
| `src/lib/api.ts` | Add `stopTask()`, `softDeleteTask()`. Update `TaskStatus` to include `stopped`. Update `Task` interface with `deletedAt`/`deletedBy`. Update `getTasks()` to filter deleted. |
| `src/components/tasks/TaskDetailSheet.tsx` | Add Stop and Delete buttons with confirmation dialogs, add `stopped` to status columns |
| `src/components/tasks/TaskListView.tsx` | Add `stopped` to status labels/colors, add "Show Stopped" filter |
| `src/components/tasks/StopTaskDialog.tsx` | New: confirmation dialog with optional reason |
| `src/components/tasks/DeleteTaskConfirmDialog.tsx` | New: confirmation dialog with accurate soft-delete copy |
| `docs/CONTROL-API-BRIDGE.md` | Document new endpoints (stop, delete, mentions, ack) |
| `changes.md` | Log all changes with verification checklist |

### Key Design Decisions

1. **Mentions RLS**: No anon policies. All mention I/O goes through Control API (service role). This keeps the security posture consistent with the bridge architecture.

2. **Mention syntax**: `@ricky` is canonical. `@agent:ricky:main` is also accepted and normalized to `ricky`. Stored as `agent_key = 'ricky'` in the `mentions` table.

3. **Ack semantics**: Client sends `{ last_seen_at: <max created_at> }`. Server uses `GREATEST(existing, incoming)` to prevent cursor regression.

4. **Delete copy**: "This will hide the task from the board. Task history is preserved for audit." -- accurately reflects soft-delete behavior.

5. **POST for delete endpoint**: Using `POST /api/tasks/:taskId/delete` instead of `DELETE /api/tasks/:taskId` to avoid adding DELETE to CORS allow-methods (keeps diff minimal).

6. **No UI for mentions**: Mentions are agent-facing only. Users type `@ricky` naturally in chat/task threads. No autocomplete or highlighting needed now.

### Task Status Values After Change
`'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked' | 'stopped'`

Deleted tasks are filtered by `deleted_at IS NOT NULL`, not by status.

### Verification Checklist
1. Stop a task from TaskDetailSheet -- status changes to `stopped`, event in timeline
2. Delete a task -- disappears from board, `deleted_at` set, task_event logged
3. Type `@ricky` in war room chat via Control API -- mention row created in `mentions` table
4. Type `@agent:ricky:main` -- same result, normalized to `ricky`
5. Call `GET /api/mentions?agent_key=ricky&since=...` -- returns new mentions
6. Call `POST /api/mentions/ack` with max created_at -- cursor updated
7. Re-call `GET /api/mentions` with new cursor -- returns empty
8. Agent heartbeat responds to mention, then acks -- no re-response on next run

