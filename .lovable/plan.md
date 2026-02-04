

# Supabase Cron Mirror + Run Queue Implementation

## Overview

This plan implements a Supabase-first approach for the Schedule/Cron page that works even when the Control API (`VITE_API_BASE_URL`) is not configured or reachable. The UI will display cron jobs from Supabase `cron_mirror` table (populated by a Mac mini worker) and allow "Run" requests via a queued system that the Mac mini can execute later.

## Architecture

```text
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Lovable UI        │     │   Supabase          │     │   Mac mini Worker   │
│   (CronPage.tsx)    │     │   (cron_mirror,     │     │   (runs locally)    │
│                     │     │    cron_run_requests)│     │                     │
├─────────────────────┤     ├─────────────────────┤     ├─────────────────────┤
│ 1. Reads cron_mirror│◄────│ Stores mirrored jobs│◄────│ Syncs jobs every    │
│    for display      │     │                     │     │ 30-60 seconds       │
│                     │     │                     │     │                     │
│ 2. Inserts run      │────►│ Queues run requests │────►│ Polls for queued    │
│    requests         │     │ (status=queued)     │     │ requests, executes  │
│                     │     │                     │     │                     │
│ 3. Subscribes to    │◄────│ Realtime updates    │◄────│ Updates status to   │
│    realtime changes │     │                     │     │ done/error          │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

---

## Phase 1: Database Schema

### Table 1: `cron_mirror`

Stores the latest known list of cron jobs from the Mac mini executor.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `project_id` | text | No | - | Project scope |
| `job_id` | text | No | - | ClawdBot cron job ID |
| `name` | text | No | - | Human-readable name |
| `schedule_kind` | text | Yes | - | "every" / "cron" etc |
| `schedule_expr` | text | Yes | - | Cron expr or "everyMs" |
| `tz` | text | Yes | - | Timezone |
| `enabled` | boolean | No | true | Job enabled state |
| `next_run_at` | timestamptz | Yes | - | Next scheduled run |
| `last_run_at` | timestamptz | Yes | - | Last run timestamp |
| `last_status` | text | Yes | - | ok/error |
| `last_duration_ms` | integer | Yes | - | Duration of last run |
| `instructions` | text | Yes | - | Job instructions/payload |
| `updated_at` | timestamptz | No | now() | Last sync time |

**Unique constraint:** `(project_id, job_id)`

**RLS policies:** Match existing anon access pattern (SELECT/ALL for anon)

### Table 2: `cron_run_requests`

Allows the UI to request a run without direct Control API connectivity.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | uuid | No | gen_random_uuid() | Primary key |
| `project_id` | text | No | - | Project scope |
| `job_id` | text | No | - | Target cron job ID |
| `requested_by` | text | Yes | - | "ui" or agent key |
| `requested_at` | timestamptz | No | now() | When queued |
| `status` | text | No | 'queued' | queued/running/done/error |
| `picked_up_at` | timestamptz | Yes | - | When worker claimed it |
| `completed_at` | timestamptz | Yes | - | When finished |
| `result` | jsonb | Yes | - | Output/summary/errors |

**Index:** `(project_id, requested_at DESC)`

**RLS policies:** Match existing anon access pattern (SELECT/INSERT/UPDATE for anon)

---

## Phase 2: API Layer Updates

### File: `src/lib/api.ts`

1. **Add new interfaces:**
   - `CronMirrorJob` - matches the Supabase `cron_mirror` schema
   - `CronRunRequest` - matches the Supabase `cron_run_requests` schema

2. **Add new functions:**
   - `getCronMirrorJobs(projectId)` - fetch from `cron_mirror` table
   - `queueCronRunRequest(projectId, jobId)` - insert into `cron_run_requests`
   - `getCronRunRequests(projectId, limit?)` - fetch recent run requests

3. **Modify existing functions:**
   - `getCronJobs()` - update to prefer Supabase `cron_mirror` when Control API unavailable
   - `runCronJob()` - fall back to queue insertion when Control API unavailable

---

## Phase 3: Realtime Subscriptions

### File: `src/lib/supabase.ts`

Extend `subscribeToProjectRealtime()` to include:
- `cron_mirror` table changes
- `cron_run_requests` table changes

This enables the UI to update live when:
- The Mac mini syncs new job data
- A run request status changes from queued → running → done/error

---

## Phase 4: UI Updates

### File: `src/components/pages/CronPage.tsx`

**Data source priority:**
1. Always load from Supabase `cron_mirror` first
2. If Control API is connected, optionally show "Direct mode" indicator

**Connection status panel updates:**
- Show Supabase connection status (primary)
- Show Control API status (informational only, not required)

**Empty states:**
- No jobs in `cron_mirror`: "No cron jobs mirrored yet. The Mac mini sync worker will publish jobs here."
- Supabase not configured: Clear error with setup guidance

**Run button behavior:**
- If Control API connected: Call existing `runCronJob()` directly (unchanged)
- If Control API NOT connected:
  - Insert into `cron_run_requests` with status='queued'
  - Show toast: "Queued run request. Will execute when the Mac mini worker picks it up."

**New UI section: Recent Run Requests**
- Show last 10-20 run requests with status badges
- Status chips: queued (yellow), running (blue pulse), done (green), error (red)
- Subscribe to realtime for live status updates

**Search and filter:**
- Add search input to filter jobs by name
- Add enabled/disabled filter toggle

---

## Phase 5: Types Update

The Supabase types file will auto-update after migrations, but we'll add TypeScript interfaces in `api.ts` for immediate use.

---

## Implementation Order

1. Create `cron_mirror` table with RLS policies
2. Create `cron_run_requests` table with RLS policies  
3. Update `src/lib/api.ts` with new functions and types
4. Update `src/lib/supabase.ts` with realtime subscriptions
5. Rewrite `src/components/pages/CronPage.tsx` for Supabase-first approach

---

## Technical Details

### Migration SQL for `cron_mirror`:

```sql
CREATE TABLE public.cron_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  name text NOT NULL,
  schedule_kind text,
  schedule_expr text,
  tz text,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_duration_ms integer,
  instructions text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cron_mirror_project_job_idx 
  ON public.cron_mirror(project_id, job_id);

ALTER TABLE public.cron_mirror ENABLE ROW LEVEL SECURITY;

-- Anon read access
CREATE POLICY "cron_mirror_select_anon" ON public.cron_mirror
  FOR SELECT USING (true);

-- Anon write access (for Mac mini worker using anon key)
CREATE POLICY "cron_mirror_write_anon" ON public.cron_mirror
  FOR ALL USING (true) WITH CHECK (true);
```

### Migration SQL for `cron_run_requests`:

```sql
CREATE TABLE public.cron_run_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued',
  picked_up_at timestamptz,
  completed_at timestamptz,
  result jsonb
);

CREATE INDEX cron_run_requests_project_time_idx 
  ON public.cron_run_requests(project_id, requested_at DESC);

ALTER TABLE public.cron_run_requests ENABLE ROW LEVEL SECURITY;

-- Anon read access
CREATE POLICY "cron_run_requests_select_anon" ON public.cron_run_requests
  FOR SELECT USING (true);

-- Anon insert (UI can queue requests)
CREATE POLICY "cron_run_requests_insert_anon" ON public.cron_run_requests
  FOR INSERT WITH CHECK (true);

-- Anon update (worker can update status)
CREATE POLICY "cron_run_requests_update_anon" ON public.cron_run_requests
  FOR UPDATE USING (true) WITH CHECK (true);
```

### API Functions (in `src/lib/api.ts`):

```typescript
// New interfaces
export interface CronMirrorJob {
  id: string;
  projectId: string;
  jobId: string;
  name: string;
  scheduleKind?: string | null;
  scheduleExpr?: string | null;
  tz?: string | null;
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastDurationMs?: number | null;
  instructions?: string | null;
  updatedAt: string;
}

export interface CronRunRequest {
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

// Fetch mirrored cron jobs from Supabase
export async function getCronMirrorJobs(): Promise<CronMirrorJob[]>

// Queue a run request
export async function queueCronRunRequest(jobId: string): Promise<{ ok: boolean; requestId?: string }>

// Get recent run requests
export async function getCronRunRequests(limit?: number): Promise<CronRunRequest[]>
```

### Realtime subscription updates:

```typescript
// Add to subscribeToProjectRealtime()
.on('postgres_changes', 
  { event: '*', schema: 'public', table: 'cron_mirror', filter: `project_id=eq.${projectId}` },
  (payload) => onChange({ table: 'cron_mirror', ... })
)
.on('postgres_changes',
  { event: '*', schema: 'public', table: 'cron_run_requests', filter: `project_id=eq.${projectId}` },
  (payload) => onChange({ table: 'cron_run_requests', ... })
)
```

---

## QA Checklist

- [ ] Schedule page shows cron list from `cron_mirror` even without Control API
- [ ] Connection panel shows Supabase status (primary) and Control API status (secondary)
- [ ] Run button queues requests when Control API is missing
- [ ] Toast confirms "Queued run request" when using queue fallback
- [ ] Run requests section shows status updates in realtime
- [ ] No crashes if Supabase is unconfigured - show clear error banner
- [ ] Switching projects updates both cron list and run requests
- [ ] Existing Control API direct mode still works when configured
- [ ] Search/filter functionality works on job list

---

## Out of Scope (Mac mini worker)

The Mac mini worker script is not part of this Lovable implementation but is referenced:

1. **Sync loop (every 30-60s):**
   - Fetch local cron jobs
   - Upsert into `cron_mirror` (project scoped)

2. **Request poller:**
   - Query `cron_run_requests` WHERE status='queued'
   - Set status='running', execute job
   - Set status='done' or 'error' with result payload

