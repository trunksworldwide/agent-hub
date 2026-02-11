

# Agent to Dashboard Bridge (Control API) -- Dashboard Side

## Summary

Add two API helper functions that route task events and chat messages through the Control API when it's healthy, falling back to direct Supabase writes when offline. Document the Control API contract so the Mac-side implementation is clear.

## Changes

### 1. New helper: `postTaskEventViaControlApi()` in `src/lib/api.ts`

Add a new exported function near the existing `createTaskEvent()`:

```typescript
/**
 * Post a task event, preferring the Control API when healthy.
 * Falls back to direct Supabase insert (existing behavior).
 *
 * Control API contract:
 *   POST /api/tasks/:taskId/events
 *   Body: { project_id, author, event_type, content, metadata }
 *   Response: { ok: true, event: { id, ... } }
 *   Errors: { ok: false, error: string }
 */
export async function postTaskEventViaControlApi(
  input: CreateTaskEventInput
): Promise<{ ok: boolean; event?: TaskEvent; error?: string }>
```

Logic:
- Check `isControlApiHealthy()`
- If healthy: `POST ${controlApiUrl}/api/tasks/${taskId}/events` with JSON body `{ project_id, author, event_type, content, metadata }`
- If the Control API call fails (network error, non-2xx): fall back to `createTaskEvent()` (direct Supabase)
- If not healthy: call `createTaskEvent()` directly

This keeps the current Supabase path as the reliable fallback. No behavior change for existing UI flows.

### 2. New helper: `postChatMessageViaControlApi()` in `src/lib/api.ts`

Add near the existing `sendChatMessage()`:

```typescript
/**
 * Post a chat message via Control API, falling back to Supabase.
 *
 * Control API contract:
 *   POST /api/chat/post
 *   Body: { project_id, thread_id, author, message, message_type?, metadata? }
 *   Response: { ok: true }
 *   Errors: { ok: false, error: string }
 */
export async function postChatMessageViaControlApi(
  threadId: string,
  opts: { author: string; message: string; messageType?: string; metadata?: Record<string, any> }
): Promise<{ ok: boolean; error?: string }>
```

Same pattern: try Control API first, fall back to direct Supabase insert.

### 3. No UI changes required

The existing `createTaskEvent()` and `sendChatMessage()` remain unchanged. The new helpers are additive -- agents calling the Control API will insert rows server-side, and the dashboard's existing realtime subscriptions will pick them up automatically.

No new components, no UI redesign.

### 4. Document the contract in `docs/CONTROL-API-BRIDGE.md`

New documentation file covering:

- Endpoint routes and request/response shapes
- How each endpoint maps to Supabase tables (`task_events`, `project_chat_messages`)
- Authentication model (service role key, server-side only)
- Error handling expectations
- Why agents never get Supabase credentials

### 5. Log in `changes.md`

Entry: "Added Control API bridge helpers (`postTaskEventViaControlApi`, `postChatMessageViaControlApi`) with Supabase fallback. Documented Control API contract in `docs/CONTROL-API-BRIDGE.md`."

## Technical Details

### Control API Endpoints (Mac-side -- NOT implemented here, just documented)

```text
POST /api/tasks/:taskId/events
  Body:    { project_id, author, event_type, content, metadata }
  Response: { ok: true, event: { id } }  |  { ok: false, error: "..." }
  Maps to: INSERT into task_events

POST /api/chat/post
  Body:    { project_id, thread_id, author, message, message_type?, metadata? }
  Response: { ok: true }  |  { ok: false, error: "..." }
  Maps to: INSERT into project_chat_messages
```

### Fallback Flow

```text
UI calls postTaskEventViaControlApi()
  |
  +-- isControlApiHealthy()?
       |
       +-- YES --> POST /api/tasks/:id/events
       |            |
       |            +-- success --> return result
       |            +-- failure --> createTaskEvent() (Supabase)
       |
       +-- NO  --> createTaskEvent() (Supabase)
```

### Files Changed

| File | Change |
|------|--------|
| `src/lib/api.ts` | Add `postTaskEventViaControlApi()` and `postChatMessageViaControlApi()` |
| `docs/CONTROL-API-BRIDGE.md` | New file: contract documentation |
| `changes.md` | Log entry |

### What This Enables

- Any agent can call `POST /api/tasks/:taskId/events` on the Mac mini and the update appears in TaskTimeline instantly via realtime subscription
- No Supabase keys in agent workspaces
- Dashboard gracefully degrades when Control API is offline

