# Control API Bridge — Contract Documentation

> Dashboard-side helpers route writes through the Mac mini Control API when healthy,
> falling back to direct Supabase inserts when offline.

## Why

Agents must be able to post task updates and chat messages **without** holding Supabase
credentials. The Mac mini Control API uses the Supabase **service role key** server-side,
so agents only need access to the local HTTP API.

## Endpoints

### `POST /api/tasks/:taskId/events`

Inserts a row into **`task_events`**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `project_id` | UUID | ✅ | Must match X-ClawdOS-Project header |
| `author` | string | ✅ | Agent key (e.g. `agent:main:ricky`) |
| `event_type` | string | ✅ | One of: `comment`, `status_change`, `output_added`, `agent_update`, `approval_request`, `approval_resolved` |
| `content` | string | ❌ | Human-readable content |
| `metadata` | object | ❌ | Arbitrary JSON (e.g. `{ old_status, new_status }`) |

**Response (success):**
```json
{ "ok": true, "event": { "id": "uuid" } }
```

**Response (error):**
```json
{ "ok": false, "error": "Description of what went wrong" }
```

### `POST /api/chat/post`

Inserts a row into **`project_chat_messages`**.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `project_id` | UUID | ✅ | Must match X-ClawdOS-Project header |
| `thread_id` | UUID | ✅ | Target thread ID |
| `author` | string | ✅ | Agent key |
| `message` | string | ✅ | Message body |
| `message_type` | string | ❌ | Optional type tag |
| `metadata` | object | ❌ | Arbitrary JSON |

**Response (success):**
```json
{ "ok": true }
```

**Response (error):**
```json
{ "ok": false, "error": "Description of what went wrong" }
```

## Authentication

- **Server-side only**: The Control API authenticates to Supabase using the **service role key** stored in the Mac mini's environment. Agents never see this key.
- **Header**: All requests include `X-ClawdOS-Project: <project_id>` for routing.
- No bearer tokens or API keys are required from the agent — the Control API trusts local network access.

## Fallback Flow

```
Dashboard/Agent calls bridge helper
  │
  ├── isControlApiHealthy()?
  │     │
  │     ├── YES → POST to Control API
  │     │         │
  │     │         ├── success → return result
  │     │         └── failure → direct Supabase insert
  │     │
  │     └── NO → direct Supabase insert
```

## Dashboard Helpers

| Function | File | Purpose |
|----------|------|---------|
| `postTaskEventViaControlApi(input)` | `src/lib/api.ts` | Route task events through Control API with Supabase fallback |
| `postChatMessageViaControlApi(threadId, opts)` | `src/lib/api.ts` | Route chat messages through Control API with Supabase fallback |
| `createTaskEvent(input)` | `src/lib/api.ts` | Direct Supabase insert (used as fallback) |
| `sendChatMessage(input)` | `src/lib/api.ts` | Direct Supabase insert with delivery queue |
| `isControlApiHealthy()` | `src/lib/api.ts` | Checks store for recent successful health check (60s TTL) |

## What This Enables

- Agents post updates via `curl http://localhost:3737/api/tasks/:id/events` and
  the dashboard's realtime subscriptions show them instantly.
- No Supabase keys in agent workspaces.
- Dashboard degrades gracefully when the Control API is offline.
