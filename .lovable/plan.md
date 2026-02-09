

# Fix: Cron Toggle Fails Loudly + Pending Patches Override Stale Mirror

This plan addresses two related problems:

1. **Toggle silently falls back to queue** -- When the direct Control API fails (e.g., "unknown job ID"), the code silently queues a Supabase request instead of telling you it failed. You want it to show an error immediately so you know the Mac mini didn't actually disable the job.

2. **Toggle reverts on page reload** -- When you toggle a job off and navigate away then back, `loadJobs()` re-fetches from `cron_mirror` which still says `enabled: true` (the executor hasn't processed the patch yet). The optimistic UI update is lost.

---

## Combined Solution

### Part A: Fail loudly when Control API is connected

Remove the silent fallback-to-queue behavior. When `controlApiConnected` is true and the direct API call fails, show a destructive error toast with the actual error message. Do NOT update the UI state. The toggle stays in its current position so it accurately reflects reality.

The queue path only runs when `controlApiConnected` is false (genuine offline mode).

Apply this to all three action handlers: toggle, run, and delete.

### Part B: Overlay pending patches on mirror data

When the page loads or realtime triggers a refresh, fetch pending `cron_job_patch_requests` (status = queued or running) alongside the mirror data. Use a `useMemo` to produce `effectiveJobs` that merges pending patches on top of mirror state. Render `effectiveJobs` instead of raw `mirrorJobs`. This way, even if the mirror hasn't caught up, the UI shows the intended state.

---

## Technical Details

### File: `src/components/pages/CronPage.tsx`

**handleToggle (~line 667)**
- Remove the `doQueueFallback()` call from the `catch` block when `controlApiConnected` is true
- Instead, show a destructive toast with the error message (e.g., "unknown cron job id: ...")
- Do NOT call `setMirrorJobs` on failure -- the toggle stays unchanged
- The `else` branch (offline/queue mode) remains as-is

**handleRunNow (~line 908)**
- Same pattern: remove `doQueueRun()` from the catch block when `controlApiConnected` is true
- Show destructive toast on failure instead

**handleDelete (~line 704)**
- Currently always uses the queue. Keep that behavior since delete is inherently async, but if the user wants direct delete when connected, we can add that. For now, no change needed here since it already queues correctly.

**loadJobs (~line 551)**
- Add `getCronPatchRequests()` to the `Promise.all` call
- Store result in new state: `patchRequests`

**New state + effectiveJobs merge**
- Add `patchRequests` state (array of `CronPatchRequest`)
- Add a `useMemo` called `effectiveJobs` that:
  - Takes `mirrorJobs` as base
  - For each job, checks if there's a pending patch request (status = queued or running) targeting that job_id
  - If a pending patch has `enabled: false`, override the job's `enabled` to `false` (and vice versa)
  - Returns the merged array
- Replace all references to `mirrorJobs` in the render/filter logic with `effectiveJobs`

**Realtime subscription (~line 589)**
- Already listens to `cron_job_patch_requests` -- no change needed

### File: `src/lib/api.ts`

- `getCronPatchRequests()` already exists -- no changes needed
- `CronPatchRequest` type already exists -- no changes needed

### File: `changes.md`

- Log both fixes

---

## File Summary

| File | Action |
|------|--------|
| `src/components/pages/CronPage.tsx` | Edit -- remove silent fallback, show errors, add patch overlay logic |
| `changes.md` | Edit -- log the changes |

## What This Does NOT Change

- Offline/queue mode behavior (still works when Control API is disconnected)
- Server-side scripts or executor code
- Supabase tables or migrations
- Delete handler (already uses queue pattern correctly)
- Other pages or components
