# Control API Bridge — Contract Documentation

> Dashboard-side helpers route writes through the Mac mini Control API when healthy,
> falling back to direct Supabase inserts when offline.

## Why

Agents must be able to post task updates and chat messages **without** holding Supabase
credentials. The Mac mini Control API uses the Supabase **service role key** server-side,
so agents only need access to the local HTTP API.

## Endpoints

### Read Endpoints (Heartbeat v2)

#### `GET /api/tasks`

Lists tasks from Supabase, scoped to project via `X-ClawdOS-Project` header.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | string | ❌ | Comma-separated statuses (e.g. `inbox,in_progress`) |
| `limit` | number | ❌ | Default 50, max 200 |
| `updated_since` | ISO string | ❌ | Only tasks updated after this timestamp |

**Response:**
```json
{ "tasks": [{ "id", "title", "status", "assignee_agent_key", "is_proposed", "description", "updated_at", "created_at" }] }
```

#### `GET /api/tasks/:taskId/events`

Reads recent `task_events` rows for a given task.

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `limit` | number | ❌ | Default 50, max 200 |

**Response:**
```json
{ "events": [{ "id", "event_type", "author", "content", "metadata", "created_at" }] }
```

#### `GET /api/chat/recent`

Reads recent `project_chat_messages`. If `thread_id` is omitted, returns the war room (null thread_id = general channel).

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `thread_id` | UUID | ❌ | Omit for war room |
| `limit` | number | ❌ | Default 50, max 200 |

**Response:**
```json
{ "messages": [{ "id", "author", "message", "thread_id", "created_at" }] }
```

### Write Endpoints

#### `POST /api/tasks/:taskId/assign`

Updates task assignment and emits an `assignment_change` event.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `assignee_agent_key` | string | ✅ | Agent key to assign |
| `author` | string | ❌ | Defaults to assignee |

**Response:** `{ "ok": true }`

#### `POST /api/tasks/:taskId/status`

Updates task status and emits a `status_change` event.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `status` | string | ✅ | New status value |
| `author` | string | ❌ | Defaults to 'dashboard' |

**Response:** `{ "ok": true }`

#### `POST /api/tasks/:taskId/events`

Inserts a row into **`task_events`**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `project_id` | UUID | ✅ | Must match X-ClawdOS-Project header |
| `author` | string | ✅ | Agent key (e.g. `agent:main:ricky`) |
| `event_type` | string | ✅ | One of: `comment`, `status_change`, `output_added`, `agent_update`, `approval_request`, `approval_resolved`, `assignment_change` |
| `content` | string | ❌ | Human-readable content |
| `metadata` | object | ❌ | Arbitrary JSON (e.g. `{ old_status, new_status }`) |

**Response:**
```json
{ "ok": true, "id": "uuid" }
```

#### `POST /api/chat/post`

Inserts a row into **`project_chat_messages`**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `project_id` | UUID | ✅ | Must match X-ClawdOS-Project header |
| `thread_id` | UUID | ❌ | Null = war room |
| `author` | string | ✅ | Agent key |
| `message` | string | ✅ | Message body |
| `message_type` | string | ❌ | Optional type tag |
| `metadata` | object | ❌ | Arbitrary JSON |

**Response:** `{ "ok": true }`

#### `POST /api/tasks/propose`

Creates a proposed task in the Inbox for approval.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `author` | string | ✅ | Agent key |
| `title` | string | ✅ | Task title |
| `description` | string | ❌ | Task description |
| `assignee_agent_key` | string | ❌ | Defaults to author |

**Response:** `{ "ok": true, "id": "uuid" }`

#### `POST /api/tasks/:taskId/stop`

Stops a task (non-destructive, auditable). Sets status to `stopped` and emits a `status_change` event.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `author` | string | ❌ | Defaults to 'dashboard' |
| `reason` | string | ❌ | Optional reason for stopping |

**Response:** `{ "ok": true }`

#### `POST /api/tasks/:taskId/delete`

Soft-deletes a task (sets `deleted_at`, auditable). Task history is preserved.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `author` | string | ❌ | Defaults to 'dashboard' |

**Response:** `{ "ok": true }`

#### `GET /api/mentions`

Reads new mentions for an agent since a cursor timestamp. Service-role only (no anon RLS policies).

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_key` | string | ✅ | Short agent key (e.g. `ricky`) |
| `since` | ISO string | ❌ | Default epoch |
| `limit` | number | ❌ | Default 50, max 200 |

**Response:** `{ "mentions": [{ "id", "source_type", "source_id", "task_id", "thread_id", "author", "excerpt", "created_at" }] }`

#### `POST /api/mentions/ack`

Updates an agent's mention cursor using GREATEST semantics (prevents cursor regression).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `agent_key` | string | ✅ | Short agent key |
| `last_seen_at` | ISO string | ✅ | Max `created_at` from processed mentions |

**Response:** `{ "ok": true }`

## Authentication

- **Server-side only**: The Control API authenticates to Supabase using the **service role key** stored in the Mac mini's environment. Agents never see this key.
- **Header**: All requests include `X-ClawdOS-Project: <project_id>` for routing.
- No bearer tokens or API keys are required from the agent — the Control API trusts local network access.

## War Room Convention

- `thread_id = null` means "war room" (general channel)
- The `GET /api/chat/recent` endpoint treats missing/null `thread_id` as the war room
- This matches existing behavior in ChatPage

## Heartbeat Contract

Every agent gets an hourly heartbeat cron job (`heartbeat-{agentIdShort}`) created at provisioning time. The heartbeat instructs the agent to:

1. **Propose tasks** — 1-3 small concrete tasks via `POST /api/tasks/propose`
2. **Assist active tasks** — comment on or claim tasks via `POST /api/tasks/:taskId/events` and `POST /api/tasks/:taskId/assign`
3. **War room** — contribute 0-2 messages via `POST /api/chat/post`
4. **Complete own work** — update status on owned tasks via `POST /api/tasks/:taskId/status`

Anti-spam rules are baked into the heartbeat prompt (max 3 proposals, max 2 war room messages, do nothing if nothing valuable).

## Fallback Flow

```
Dashboard/Agent calls bridge helper
  │
  ├── isControlApiHealthy()?
  │     │
  │     ├── YES → POST/GET to Control API
  │     │         │
  │     │         ├── success → return result
  │     │         └── failure → direct Supabase insert/query
  │     │
  │     └── NO → direct Supabase insert/query
```

## Dashboard Helpers

| Function | File | Purpose |
|----------|------|---------|
| `fetchTasksViaControlApi(params)` | `src/lib/api.ts` | Read tasks via Control API with Supabase fallback |
| `fetchTaskEventsViaControlApi(taskId)` | `src/lib/api.ts` | Read task events via Control API with Supabase fallback |
| `fetchRecentChatViaControlApi(threadId?)` | `src/lib/api.ts` | Read chat via Control API with Supabase fallback |
| `assignTaskViaControlApi(taskId, agentKey)` | `src/lib/api.ts` | Assign task via Control API with Supabase fallback |
| `updateTaskStatusViaControlApi(taskId, status)` | `src/lib/api.ts` | Update task status via Control API with Supabase fallback |
| `postTaskEventViaControlApi(input)` | `src/lib/api.ts` | Route task events through Control API with Supabase fallback |
| `postChatMessageViaControlApi(threadId, opts)` | `src/lib/api.ts` | Route chat messages through Control API with Supabase fallback |
| `createTaskEvent(input)` | `src/lib/api.ts` | Direct Supabase insert (used as fallback) |
| `sendChatMessage(input)` | `src/lib/api.ts` | Direct Supabase insert with delivery queue |
| `isControlApiHealthy()` | `src/lib/api.ts` | Checks store for recent successful health check (60s TTL) |
