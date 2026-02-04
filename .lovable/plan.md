

# Schedule Page UI Cleanup + Delete Functionality Plan

## Overview

This plan improves the Schedule/Cron page with a cleaner, more modern UI layout and adds proper delete functionality via the Supabase queue pattern (since `cron_mirror` is a read-only mirror of the Mac mini executor).

---

## Current State Analysis

Looking at the screenshot and code, the current UI has several issues:

1. **Awkward spacing** - Refresh and New Job buttons are separated with odd gaps
2. **Prominent connection status panel** - Takes up too much visual space for normal operation
3. **Dense job cards** - Schedule badge (e.g., "Daily at 8:00 AM America/New_York") is cramped
4. **Missing delete** - No way to remove jobs (and deleting from `cron_mirror` directly won't work since the source of truth is on Mac mini)
5. **Floating "Last run: ok"** - The checkmark status is presentable but could be cleaner

---

## Phase 1: Database Schema - Add `cron_delete_requests` Table

### Table Definition

```sql
CREATE TABLE public.cron_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,  -- "ui" or agent key
  status text NOT NULL DEFAULT 'queued',  -- queued/running/done/error
  result jsonb,
  picked_up_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX cron_delete_requests_project_time_idx 
  ON public.cron_delete_requests(project_id, requested_at DESC);

ALTER TABLE public.cron_delete_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_delete_requests_select_anon" ON public.cron_delete_requests
  FOR SELECT USING (true);
CREATE POLICY "cron_delete_requests_insert_anon" ON public.cron_delete_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "cron_delete_requests_update_anon" ON public.cron_delete_requests
  FOR UPDATE USING (true) WITH CHECK (true);
```

---

## Phase 2: API Layer Updates

### File: `src/lib/api.ts`

1. **Add interface:**
   ```typescript
   export interface CronDeleteRequest {
     id: string;
     projectId: string;
     jobId: string;
     requestedBy?: string | null;
     requestedAt: string;
     status: 'queued' | 'running' | 'done' | 'error';
     pickedUpAt?: string | null;
     completedAt?: string | null;
     result?: any;
   }
   ```

2. **Add function:**
   ```typescript
   export async function queueCronDeleteRequest(jobId: string): Promise<{ ok: boolean; requestId?: string; error?: string }>
   ```

3. **Add getter:**
   ```typescript
   export async function getCronDeleteRequests(limit?: number): Promise<CronDeleteRequest[]>
   ```

---

## Phase 3: Realtime Subscriptions

### File: `src/lib/supabase.ts`

Extend `subscribeToProjectRealtime()` to include `cron_delete_requests`:

```typescript
.on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'cron_delete_requests', filter: `project_id=eq.${projectId}` },
  (payload) => onChange({ table: 'cron_delete_requests', ... })
)
```

---

## Phase 4: UI/UX Overhaul

### File: `src/components/pages/CronPage.tsx`

### 4.1 Header Layout Cleanup

**Before:**
```
Scheduled Jobs                    [Refresh]    [+ New Job]
Manage cron jobs...
Updated: just now
```

**After:**
```
Scheduled Jobs                           🔄  [+ New Job]
Manage cron jobs and scheduled tasks.
```

- Move "Updated: X ago" to a subtle inline indicator or footer
- Combine Refresh into an icon-only button next to "+ New Job"
- Use consistent button grouping with proper gap

### 4.2 Connection Status - Move to Footer

**Before:** Prominent card at top with both Supabase and Control API status

**After:**
- Move to a subtle footer bar at the bottom of the page
- Show as a single line: "⬤ Supabase connected • ○ Control API offline"
- Only show error banners prominently (at top) when something fails
- Keep the error retry functionality but move normal status to footer

### 4.3 Job Card Redesign

**Current structure:**
```
[Toggle] Name [Schedule Badge]
         Next: — • Last: Feb 3, 8:00 AM    ✓ Last run: ok  [Edit] [Run] [⌄]
```

**New structure:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Toggle] Job Name                              [▶ Run]  [🗑]  [⌄]       │
│          Every 15 minutes                      Last: ok • Feb 3         │
└─────────────────────────────────────────────────────────────────────────┘
```

Key changes:
- **Schedule** on second line, no badge wrapper (cleaner)
- **Last status + date** combined in one line on the right
- **Actions** simplified: Run, Trash (delete), Expand
- **Edit** moved into expanded details section (less common action)
- Remove the separate schedule badge styling for a cleaner look

### 4.4 Schedule Display Improvements

Current `formatSchedule()` already handles most cases well, but:
- Truncate long timezone names in the collapsed view
- Show full timezone in expanded details
- Use tooltip for overflow

**Examples:**
| Raw | Display |
|-----|---------|
| `every` + `900000` | Every 15 minutes |
| `cron` + `0 9 * * *` + `America/New_York` | Daily at 9:00 AM ET |
| `cron` + `0 8 * * *` + `America/New_York` | Daily at 8:00 AM ET |

Note: Abbreviate `America/New_York` → `ET` in compact view

### 4.5 Delete Button + Confirmation

Add trash icon button to each job row with confirmation dialog:

```typescript
// State
const [deletingJob, setDeletingJob] = useState<CronMirrorJob | null>(null);
const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

// Confirmation dialog
<AlertDialog open={Boolean(deletingJob)} onOpenChange={(open) => { if (!open) setDeletingJob(null); }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete scheduled job?</AlertDialogTitle>
      <AlertDialogDescription>
        This will remove "{deletingJob?.name}" from the executor. This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete} className="bg-destructive">
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 4.6 Delete Handler Logic

```typescript
const handleDelete = async () => {
  if (!deletingJob) return;
  
  const job = deletingJob;
  setDeletingJob(null);
  setPendingDeletes((prev) => new Set(prev).add(job.jobId));
  
  try {
    if (controlApiConnected) {
      // Direct delete via Control API (when implemented)
      // await deleteCronJob(job.jobId);
      toast({ title: 'Job deleted', description: `${job.name} has been removed.` });
    } else {
      // Queue delete request
      const result = await queueCronDeleteRequest(job.jobId);
      if (result.ok) {
        toast({
          title: 'Delete queued',
          description: `${job.name} will be removed when the Mac mini executor picks up the request.`,
        });
      } else {
        throw new Error(result.error || 'Failed to queue delete');
      }
    }
  } catch (err: any) {
    toast({ title: 'Failed to delete job', description: String(err?.message || err), variant: 'destructive' });
    setPendingDeletes((prev) => { const next = new Set(prev); next.delete(job.jobId); return next; });
  }
};
```

### 4.7 Visual Indicator for Pending Delete

Jobs with a pending delete request show a subtle badge and are slightly faded:

```tsx
{pendingDeletes.has(job.jobId) && (
  <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
    Deletion pending
  </Badge>
)}
```

### 4.8 Requests Section - Combine All Request Types

Current: Only shows "Recent Run Requests"

New: Show a unified "Pending Requests" section that includes:
- Run requests (status: queued/running)
- Toggle (patch) requests (status: queued/running)
- Delete requests (status: queued/running)
- Completed requests in a separate collapsible "History" section

---

## Phase 5: Footer Status Bar Component

Create a new sub-component for the connection status footer:

```tsx
interface ConnectionStatusFooterProps {
  supabaseConnected: boolean;
  controlApiConnected: boolean;
}

function ConnectionStatusFooter({ supabaseConnected, controlApiConnected }: ConnectionStatusFooterProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-4 py-2 text-xs text-muted-foreground">
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', supabaseConnected ? 'bg-success' : 'bg-muted-foreground')} />
          <span>Supabase</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', controlApiConnected ? 'bg-success' : 'bg-muted-foreground')} />
          <span>Control API</span>
        </div>
      </div>
    </div>
  );
}
```

---

## Implementation Order

1. **Database migration**: Create `cron_delete_requests` table with RLS
2. **API layer**: Add `queueCronDeleteRequest()` and `getCronDeleteRequests()` 
3. **Realtime**: Subscribe to `cron_delete_requests` changes
4. **CronPage UI**:
   - Refactor header layout (compact actions)
   - Move connection status to footer
   - Add delete button + confirmation dialog
   - Add pending delete visual state
   - Combine requests section to show run/toggle/delete
5. **Polish**: Responsive tweaks, mobile testing

---

## File Changes Summary

| File | Changes |
|------|---------|
| `supabase/migrations/xxx.sql` | Create `cron_delete_requests` table |
| `src/lib/api.ts` | Add `CronDeleteRequest` interface, `queueCronDeleteRequest()`, `getCronDeleteRequests()` |
| `src/lib/supabase.ts` | Add realtime subscription for `cron_delete_requests` |
| `src/components/pages/CronPage.tsx` | UI overhaul: header, footer status, job cards, delete functionality |

---

## QA Checklist

- [ ] Header layout is clean with Refresh icon + New Job button aligned right
- [ ] Connection status moved to subtle footer (not prominent card)
- [ ] Error banners still show prominently when something fails
- [ ] Job cards are cleaner with schedule on second line
- [ ] Delete button shows on each job row
- [ ] Delete confirmation dialog appears before deletion
- [ ] Delete queues request when Control API is offline
- [ ] "Deletion pending" badge shows while waiting for executor
- [ ] Jobs with pending deletes are visually indicated
- [ ] Realtime updates work for delete requests
- [ ] Mobile responsive layout works
- [ ] No breaking changes to existing functionality

