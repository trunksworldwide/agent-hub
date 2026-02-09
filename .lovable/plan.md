

# Fix: Cron Toggle "Unknown Job ID" Error

## Root Cause

The error `unknown cron job id: 8cb899cd-...` means the job exists in the `cron_mirror` Supabase table but does NOT exist on the OpenClaw executor. When `controlApiConnected` is `true`, the toggle handler calls the Control API directly (`openclaw cron disable "<id>"`), which fails because OpenClaw doesn't know that job.

This happened because:
- Jobs were created under the old `clawdbot` binary and may have different IDs now under OpenClaw
- The `cron_mirror` table was never cleaned up to remove stale entries

## Fix 1: Add Fallback on Direct API Failure

When the direct Control API toggle fails, automatically fall back to the Supabase queue path instead of just showing an error toast. This makes the system resilient.

**File: `src/components/pages/CronPage.tsx`** (handleToggle function, ~line 642)

Current behavior:
```
if (controlApiConnected) {
  try { await toggleCronJob(...) }
  catch { show error toast }  // <-- stops here
} else {
  // queue via Supabase
}
```

New behavior:
```
if (controlApiConnected) {
  try { await toggleCronJob(...) }
  catch {
    // Fall back to Supabase queue silently
    try { await queueCronPatchRequest(...) }
    catch { show error toast }
  }
} else {
  // queue via Supabase (unchanged)
}
```

## Fix 2: Clean Up Stale Mirror Entries

Update `scripts/cron-mirror.mjs` to delete mirror rows whose `job_id` no longer appears in the executor's job list. Currently it only upserts new/changed jobs but never removes old ones.

**File: `scripts/cron-mirror.mjs`** (inside `mirrorCronList()`)

After upserting the current jobs, add:
```javascript
// Remove mirror rows for jobs that no longer exist on executor
const currentJobIds = jobs.map(j => String(j.id));
currentJobIds.push('__mirror_state__'); // keep the state row
const { error: delErr } = await sb
  .from('cron_mirror')
  .delete()
  .eq('project_id', PROJECT_ID)
  .not('job_id', 'in', `(${currentJobIds.map(id => `"${id}"`).join(',')})`)
if (delErr) console.error('[cron-mirror] cleanup failed', delErr);
```

## Fix 3: Apply Same Fallback to Run and Delete Handlers

The same issue can happen for "Run Now" and "Delete" actions when the direct API doesn't recognize the job ID. Apply the same fallback pattern.

**File: `src/components/pages/CronPage.tsx`** (handleRun and handleDelete)

## File Summary

| File | Action |
|------|--------|
| `src/components/pages/CronPage.tsx` | Edit -- add fallback-to-queue on direct API failure for toggle, run, and delete |
| `scripts/cron-mirror.mjs` | Edit -- delete stale mirror rows during sync |
| `changes.md` | Edit -- log the fix |
