

# Fix: Heartbeat toggle falls back to queue when Control API is unreachable

## Problem

Toggling a heartbeat on/off fails with "Failed to fetch" because the Lovable cloud preview cannot reach the Mac mini's Control API URL. The current code treats all errors as hard failures when `controlApiConnected` is true.

## What actually happens when we fix this

1. You click the toggle
2. The code tries the Control API directly
3. If the server is unreachable (network error), it automatically falls back to `queueCronPatchRequest`
4. This inserts a row into `cron_job_patch_requests` in Supabase with `{ enabled: false }` (or `true`)
5. The Mac mini executor polls that table and applies the patch -- the heartbeat is actually disabled
6. You see a toast saying "Toggle queued -- will be disabled when the executor picks up the request"

Real API errors (server responded with 4xx/5xx) still fail loudly so you know something is genuinely wrong.

## Changes

### `src/components/pages/CronPage.tsx`

In the `handleToggle` catch block (lines 725-732), detect network-level errors and fall back to the queue:

```
catch (directErr: any) {
  const msg = String(directErr?.message || directErr);
  const isNetworkError = /failed to fetch|networkerror|load failed|fetch failed/i.test(msg);

  if (isNetworkError) {
    try {
      await doQueueFallback();
    } catch (queueErr: any) {
      toast({
        title: 'Toggle failed',
        description: 'Control API unreachable and queue fallback also failed.',
        variant: 'destructive',
      });
    }
  } else {
    toast({
      title: 'Toggle failed',
      description: msg,
      variant: 'destructive',
    });
  }
}
```

### `changes.md`

Log the fix.

## What this does NOT change

- No changes to the `controlApiConnected` logic or health polling
- Delete, run, and edit handlers keep their current behavior (same pattern can be applied later if needed)
- No new tables or dependencies

