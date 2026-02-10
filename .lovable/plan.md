
# Wire Up Cron Job Edit Persistence (Two Missing Pieces)

## What already works

The edit dialog, Control API endpoint, queue fallback, optimistic UI, and realtime subscriptions are all implemented. You can already open a job, change the title/instructions, and save — it reaches the executor in direct mode.

## What's missing

Two backend gaps prevent edits from fully persisting and syncing:

### 1. Offline patch processing in cron-mirror worker

**File:** `scripts/cron-mirror.mjs`

The worker processes run requests and delete requests, but has no handler for `cron_job_patch_requests`. When the Control API is offline and the dashboard queues a patch (name, instructions, schedule, enabled, agent, intent), nothing ever picks it up.

**Add `processPatchRequests()` function** that:
- Queries `cron_job_patch_requests` for `status = 'queued'` rows matching the project
- For each request, reads `patch_json` and builds `openclaw cron edit <jobId>` CLI args:
  - `patch.name` maps to `--name`
  - `patch.instructions` maps to `--system-event`
  - `patch.scheduleExpr` maps to `--cron` (for cron kind) or `--every` (for interval kind)
  - `patch.enabled` maps to `--enable` / `--disable`
- Marks the request `running`, then `done` or `error` with result
- Runs on a 10-second interval (same as run/delete processing)

Also add patch requests to the existing `failStuckRequests` watchdog so stale patches don't sit in "queued" forever.

### 2. Immediate mirror upsert after direct edit

**File:** `server/index.mjs` (the `/api/cron/:jobId/edit` handler, ~line 931-968)

After the executor edit succeeds, the server currently just returns `{ ok: true }`. The Supabase mirror won't update until the next 60-second mirror cycle.

**Add a best-effort `cron_mirror` upsert** immediately after the successful edit:
- Upsert the changed fields (name, instructions) into `cron_mirror` for the matching `project_id` + `job_id`
- This is best-effort (wrapped in try/catch) so it doesn't break the response if Supabase is unavailable
- The UI sees the change instantly via realtime subscription instead of waiting up to 60 seconds

### 3. Log to changes.md

Document both additions.

## Technical detail

### Patch processing function (cron-mirror.mjs)

```text
processPatchRequests():
  1. SELECT from cron_job_patch_requests WHERE status='queued', project_id=PROJECT_ID, LIMIT 5
  2. For each request:
     a. UPDATE status='running'
     b. Read patch_json, build CLI args
     c. Run: openclaw cron edit <jobId> --name "..." --system-event "..." ...
     d. UPDATE status='done'/'error' with result
  3. Return count processed
```

Interval: `setInterval(processPatchRequests, 10_000)`

### Mirror upsert after direct edit (server/index.mjs)

```text
After execExecutor(cmdArgs) succeeds:
  1. Build partial upsert object from body fields
  2. supabase.from('cron_mirror').update(partial).eq('project_id', projectId).eq('job_id', jobId)
  3. Catch and log errors (non-blocking)
```

### Files to modify

| File | Change |
|------|--------|
| `scripts/cron-mirror.mjs` | Add `processPatchRequests()` + wire into main loop + add to stuck watchdog |
| `server/index.mjs` | Add best-effort mirror upsert after successful direct edit |
| `changes.md` | Log both changes |
