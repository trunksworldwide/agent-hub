

# Wiring Gap Fixes: Reconcile UI with Reality

## Overview

Five targeted fixes to align the frontend and database with actual execution behavior. No UI redesigns -- just correctness patches. Answer to the question: yes, only emit `status_change` when `old_status != new_status`.

---

## Fix 1: `updateTask()` emits `task_events` on status change

**File:** `src/lib/api.ts` (inside `updateTask()`, lines ~2245-2267)

Before inserting the `activities` row, fetch the old status alongside the title (combine into one query). If `patch.status` is defined AND differs from the old status, insert a `task_events` row:

```
task_events {
  project_id,
  task_id: taskId,
  event_type: 'status_change',
  author: 'dashboard',
  content: `Status changed from ${oldStatus} to ${newStatus}`,
  metadata: { old_status: oldStatus, new_status: newStatus }
}
```

- Best-effort: wrapped in try/catch, non-blocking (task update already succeeded)
- Only emits when `oldStatus !== patch.status`
- Reuses the same `select('title, status')` query already being made for the activity message

---

## Fix 2: `isControlApiHealthy()` adds TTL + URL check

**File:** `src/lib/store.ts` -- add `lastExecutorCheckAt: number | null` field and setter

**File:** `src/lib/api.ts` -- update `isControlApiHealthy()` (lines ~3312-3324):

```
// Current (broken):
return !!check;

// Fixed:
if (!check) return false;
const lastCheckAt = useClawdOffice.getState().lastExecutorCheckAt;
if (!lastCheckAt || Date.now() - lastCheckAt > 60_000) return false;
return true;
```

Also update wherever `setExecutorCheck` is called to simultaneously set `lastExecutorCheckAt: Date.now()`.

---

## Fix 3: Heartbeat grouping fallback for `schedule_kind='every'`

**File:** `src/components/pages/CronPage.tsx` (lines ~1341-1342)

Change the filter from:
```
j.jobIntent === 'heartbeat'
```
To:
```
j.jobIntent === 'heartbeat' || (j.scheduleKind === 'every' && !j.jobIntent)
```

And the "scheduled jobs" filter becomes the inverse of that condition.

---

## Fix 4: Unique constraint on `chat_delivery_queue`

**New migration file**

```sql
-- Remove any existing duplicates (keep newest per pair)
DELETE FROM public.chat_delivery_queue a
USING public.chat_delivery_queue b
WHERE a.message_id = b.message_id
  AND a.target_agent_key = b.target_agent_key
  AND a.created_at < b.created_at;

-- Add unique constraint
ALTER TABLE public.chat_delivery_queue
  ADD CONSTRAINT uq_chat_delivery_message_agent
  UNIQUE (message_id, target_agent_key);
```

Then update `src/lib/api.ts` where queue rows are inserted: use `.upsert()` instead of `.insert()` (or wrap in try/catch to swallow duplicate key errors) so retries and direct-mode mirroring don't fail.

---

## Fix 5: Document Mac-side gaps (code comments only)

**File:** `src/lib/api.ts` -- add comments near `sendChatMessage` noting:
- `/api/chat/deliver` endpoint is not yet implemented in Control API
- Queue worker (poll + watchdog) is Mac-side work
- Direct delivery will always fall back to queue until endpoint exists

---

## Changes Summary

| File | What |
|---|---|
| `src/lib/api.ts` | Fix 1: emit `task_events` in `updateTask()` |
| `src/lib/api.ts` | Fix 2: TTL check in `isControlApiHealthy()` |
| `src/lib/store.ts` | Fix 2: add `lastExecutorCheckAt` field |
| `src/components/pages/CronPage.tsx` | Fix 3: heartbeat fallback grouping |
| New migration | Fix 4: unique constraint + dedup |
| `src/lib/api.ts` | Fix 4: upsert for queue inserts |
| `src/lib/api.ts` | Fix 5: doc comments |
| `changes.md` | Log all changes |

