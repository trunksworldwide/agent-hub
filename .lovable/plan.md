

# Fix Scheduled Job Deletion

## The Root Cause (Two Problems)

### Problem 1: OpenClaw keeps recreating deleted jobs
Your Mac mini's `openclaw cron rm` command runs and sometimes succeeds (`removed: true`), but the jobs reappear. The most recent delete attempts all return `removed: false` -- meaning OpenClaw acknowledges the request but the job still exists. Something on your Mac mini (a config file, startup script, or OpenClaw's own persistence) is recreating these jobs.

**You need to investigate this on your Mac mini.** Try running manually:
```
openclaw cron rm f6eceee5-68d8-4b41-ac7d-3e4848665000
openclaw cron list --all --json
```
If the job is still there after `rm`, the issue is in OpenClaw's job storage. Check if there's a cron config file that re-registers jobs on startup.

### Problem 2: The UI doesn't handle failed deletes properly
Even when the executor reports `removed: false`, the UI marks it as "done" and stops showing "Deletion pending". Then the mirror re-syncs the job and it pops right back with no explanation. The UI needs to:

1. Detect when a delete completed but the job wasn't actually removed
2. Keep showing the job as "delete failed" instead of silently restoring it
3. Hide jobs from the list when deletion truly succeeded (before the mirror cleanup catches up)

## Plan

### Step 1: Improve delete result handling in the UI
In `CronPage.tsx`, update the `pendingDeletes` logic:
- Track not just `queued`/`running` deletes, but also recent `done` deletes
- If a delete completed with `removed: true`, hide the job from the list entirely (the mirror will clean it up on next sync)
- If a delete completed with `removed: false`, show a "Delete failed" badge instead of silently restoring the job

### Step 2: Add a "delete failed" state to the job row
In the `CronJobRow` component:
- Add a new visual state for "delete failed" -- a red badge with an explanation
- Add a "Retry delete" button so you can try again without opening dialogs

### Step 3: Filter out successfully deleted jobs
In the `effectiveJobs` or `filteredJobs` memo:
- If there's a completed delete request with `removed: true` for a job, filter it out of the list
- This prevents the ghost job from flashing back before the mirror catches up

### Step 4: Parse delete result properly
The `result` field from the executor contains `stdoutTail` with JSON. The code needs to parse this to extract the `removed` boolean and use it for UI decisions.

## Technical Details

### Files to modify
- `src/components/pages/CronPage.tsx` -- delete state management, job filtering, retry UI
- `src/lib/api.ts` -- add a parsed `removed` field to the `CronDeleteRequest` type

### Changes to `CronDeleteRequest` type (api.ts)
Add an optional `removed` field derived from parsing `result.stdoutTail`:
```typescript
export interface CronDeleteRequest {
  // ... existing fields
  removed?: boolean; // parsed from result
}
```

### Changes to `getCronDeleteRequests` (api.ts)
Parse the `result.stdoutTail` JSON to extract the `removed` boolean when mapping rows.

### Changes to `CronPage.tsx`

**pendingDeletes logic** -- replace the simple Set with a Map that tracks state:
```text
Map<jobId, 'pending' | 'failed' | 'removed'>
```

- `queued` or `running` status -> `'pending'`
- `done` with `removed: true` -> `'removed'` (hide job from list)
- `done` with `removed: false` -> `'failed'` (show error badge + retry)

**filteredJobs** -- exclude jobs in `'removed'` state.

**CronJobRow** -- show "Delete failed" badge with retry button when state is `'failed'`.

## What you need to do on your Mac mini
After this UI fix, deletion will at least show you clearly when it fails. But to actually make jobs stay deleted, you need to figure out why OpenClaw is recreating them. Check:
1. Is there a cron config file that registers jobs on openclaw startup?
2. Does `openclaw cron rm <id>` actually persist the removal, or does it only remove from memory?
3. Is there a `cron.json` or similar file in your OpenClaw config directory?

