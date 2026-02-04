
# ClawdOS Multi-Feature Improvement Plan

## Overview

This plan implements four major improvements to ClawdOS additively, without breaking existing functionality:

- A) Task assignee flow with project-scoped agent selection
- B) Human-friendly summaries for the Activity feed
- C) Schedule page toggle/create queue support (extending existing cron mirror)
- D) Robust project dropdown default behavior

---

## A) Tasks: Add Project-Scoped Assignee Flow

### Current State
- `TasksPage.tsx` has a "New Task" dialog with only title and description fields
- Backend already supports `tasks.assignee_agent_key` column
- `createTask()` in `api.ts` already accepts `assigneeAgentKey` parameter
- `getAgents()` returns project-scoped agents via `selectedProjectId`
- Task cards show assignee if set but offer no way to change it

### Implementation

**1. Update "New Task" Dialog (TasksPage.tsx)**
- Add state for `newTaskAssignee` (string | null)
- Add an Assignee dropdown below description:
  - First option: "Unassigned" (value: null)
  - Remaining options: agents from current project (emoji + name)
- Pass `assigneeAgentKey` to `createTask()` when set

**2. Task Cards: Add Quick Reassign**
- Add a second dropdown/select on each task card for reassignment
- Options: Unassigned + all project agents
- On change, call `updateTask(taskId, { assigneeAgentKey })` 
- Optimistic UI update

**3. File Changes**
- `src/components/pages/TasksPage.tsx`: Add assignee select to dialog and task cards

---

## B) Human-Friendly Summaries for Activity Feed

### Current State
- `activities` table has: `id`, `type`, `message`, `actor_agent_key`, `task_id`, `created_at`
- Activity feed shows raw `message` directly
- Messages are developer-focused (e.g., "Moved task to in_progress")

### Implementation

**1. Add `summary` Column to activities Table**
- Add nullable `summary` text column via migration
- This stores the human-friendly version when available

**2. Create Client-Side Template Mapper**
- Add `generateActivitySummary()` function in new file `src/lib/activity-summary.ts`
- Map known activity types to friendly templates:
  - `task_created` -> "Created a new task: {title}"
  - `task_moved` -> "Moved task to {status}"
  - `agent_created` -> "Added a new team member: {name}"
  - `brain_doc_updated` -> "Updated {doc} documentation"
  - `cron_run_requested` -> "Scheduled {job} to run"
  - Default fallback: return original message

**3. Update Activity UI**
- Show `summary` if present, otherwise generate one client-side from `message` + `type`
- Keep raw message accessible via "Details" expand or tooltip

**4. Database Migration**
```sql
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS summary text;
```

**5. File Changes**
- New file: `src/lib/activity-summary.ts`
- `src/components/pages/ActivityPage.tsx`: Use summary generation, add expandable details
- `src/lib/api.ts`: Update `ActivityItem` interface to include optional `summary`

---

## C) Schedule: Toggle and Create Queue Support

### Current State
- `cron_mirror` table exists (job metadata from Mac mini)
- `cron_run_requests` table exists (run queue)
- Toggle switches are disabled when Control API not connected
- No ability to create new cron jobs from UI when offline

### Implementation

**1. Add `cron_job_patch_requests` Table**
```sql
CREATE TABLE public.cron_job_patch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  patch_json jsonb NOT NULL,  -- { "enabled": true/false, "name": "...", etc. }
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,  -- "ui" or agent key
  status text NOT NULL DEFAULT 'queued',  -- queued/running/done/error
  result jsonb,
  picked_up_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX cron_job_patch_requests_project_time_idx 
  ON public.cron_job_patch_requests(project_id, requested_at DESC);

ALTER TABLE public.cron_job_patch_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_job_patch_requests_select_anon" ON public.cron_job_patch_requests
  FOR SELECT USING (true);
CREATE POLICY "cron_job_patch_requests_insert_anon" ON public.cron_job_patch_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "cron_job_patch_requests_update_anon" ON public.cron_job_patch_requests
  FOR UPDATE USING (true) WITH CHECK (true);
```

**2. Add `cron_create_requests` Table**
```sql
CREATE TABLE public.cron_create_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  name text NOT NULL,
  schedule_kind text,  -- "cron" or "every"
  schedule_expr text NOT NULL,  -- cron expression or ms value
  tz text,
  instructions text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  picked_up_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX cron_create_requests_project_time_idx 
  ON public.cron_create_requests(project_id, requested_at DESC);

ALTER TABLE public.cron_create_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_create_requests_select_anon" ON public.cron_create_requests
  FOR SELECT USING (true);
CREATE POLICY "cron_create_requests_insert_anon" ON public.cron_create_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "cron_create_requests_update_anon" ON public.cron_create_requests
  FOR UPDATE USING (true) WITH CHECK (true);
```

**3. Update API Layer (api.ts)**
- Add `queueCronPatchRequest(jobId, patch)` function
- Add `queueCronCreateRequest(job)` function
- Add interfaces for the new request types

**4. Update CronPage.tsx**

Toggle behavior:
- If Control API connected: call `toggleCronJob()` directly (unchanged)
- If Control API NOT connected:
  - Queue patch request with `{ enabled: !current }`
  - Show toast: "Queued toggle. Will apply when Mac mini worker is online."
  - Optimistic UI: show "Pending..." indicator on switch

Schedule frequency display:
- Parse `schedule_kind` + `schedule_expr` into human-readable format:
  - `every` + `900000` -> "Every 15 minutes"
  - `cron` + `0 9 * * *` + tz -> "Daily at 9:00 AM ET"
- Add helper function `formatSchedule(kind, expr, tz)`

Last status cleanup:
- Replace floating checkmark with inline text: "Last run: OK" or "Last run: Error"
- Move to expanded details section if needed

Add "+ New Scheduled Task" button:
- Opens dialog with name, schedule, timezone, instructions
- When Control API connected: create directly
- When offline: queue create request

**5. Update Realtime Subscriptions (supabase.ts)**
- Add subscriptions for `cron_job_patch_requests` and `cron_create_requests`

**6. File Changes**
- `src/lib/api.ts`: Add new queue functions and interfaces
- `src/lib/supabase.ts`: Add realtime subscriptions for new tables
- `src/components/pages/CronPage.tsx`: Update toggle logic, add create dialog, improve schedule display

---

## D) Project Dropdown: Robust Default Behavior

### Current State
- `AppSidebar.tsx` already has logic to fall back to `front-office` or first project
- Uses `DEFAULT_PROJECT_ID` from `project.ts`
- Shows toast when falling back

### Current Issue
- The create project flow might temporarily leave selection in a weird state
- Edge case: if `projects` array is empty during creation, selection could blank

### Implementation

**1. Strengthen Validation in AppSidebar.tsx**
- Ensure `selectedProjectId` is never empty string or undefined
- During project creation, do NOT clear current selection
- After creation, explicitly set to new project ID only after success

**2. Add Guard in Store (store.ts)**
- `setSelectedProjectId` should validate input is non-empty
- If empty/invalid passed, fall back to `DEFAULT_PROJECT_ID`

**3. File Changes**
- `src/lib/store.ts`: Add validation to `setSelectedProjectId`
- `src/components/layout/AppSidebar.tsx`: Minor refinements to ensure no blank state

---

## Implementation Order

1. **Database migrations** (3 changes):
   - Add `summary` column to `activities`
   - Create `cron_job_patch_requests` table
   - Create `cron_create_requests` table

2. **API layer updates** (`src/lib/api.ts`):
   - Add summary to ActivityItem interface
   - Add patch/create queue functions for cron

3. **New helper file** (`src/lib/activity-summary.ts`):
   - Template-based summary generator

4. **Realtime updates** (`src/lib/supabase.ts`):
   - Add subscriptions for new cron tables

5. **Store validation** (`src/lib/store.ts`):
   - Guard against empty project selection

6. **UI updates** (in order):
   - `TasksPage.tsx`: Assignee dropdown in dialog + task cards
   - `ActivityPage.tsx`: Summary display with expand for details
   - `CronPage.tsx`: Toggle queue, schedule formatting, create dialog
   - `AppSidebar.tsx`: Minor selection guard refinements

---

## Technical Details

### Activity Summary Templates

```typescript
// src/lib/activity-summary.ts
const TEMPLATES: Record<string, (msg: string, type: string) => string> = {
  task_created: (msg) => `Created a new task: "${msg}"`,
  task_moved: (msg) => {
    const match = msg.match(/Moved (.+) → (.+)/);
    if (match) return `Moved task to ${match[2]}`;
    return msg;
  },
  agent_created: (msg) => {
    const match = msg.match(/Created agent (.+)/);
    if (match) return `Added team member: ${match[1]}`;
    return msg;
  },
  brain_doc_updated: (msg) => {
    const match = msg.match(/Updated (.+)/);
    if (match) return `Updated ${match[1]} documentation`;
    return msg;
  },
  cron_run_requested: (msg) => {
    const match = msg.match(/Requested cron run:\s*(.+)/);
    if (match) return `Scheduled "${match[1]}" to run`;
    return msg;
  },
};

export function generateActivitySummary(type: string, message: string): string {
  const template = TEMPLATES[type];
  if (template) return template(message, type);
  return message;
}
```

### Schedule Formatting Helper

```typescript
// In CronPage.tsx or new utility file
function formatSchedule(kind: string | null, expr: string | null, tz?: string | null): string {
  if (!expr) return '—';
  
  if (kind === 'every' || !kind) {
    const ms = parseInt(expr, 10);
    if (!isNaN(ms)) {
      if (ms < 60000) return `Every ${Math.round(ms / 1000)}s`;
      if (ms < 3600000) return `Every ${Math.round(ms / 60000)} minutes`;
      return `Every ${Math.round(ms / 3600000)} hours`;
    }
  }
  
  // Cron expression parsing (simplified)
  if (kind === 'cron') {
    const parts = expr.split(' ');
    if (parts.length === 5) {
      const [min, hour, dom, mon, dow] = parts;
      if (dom === '*' && mon === '*' && dow === '*') {
        return `Daily at ${hour}:${min.padStart(2, '0')}${tz ? ` ${tz}` : ''}`;
      }
      // Add more patterns as needed
    }
    return `Cron: ${expr}${tz ? ` (${tz})` : ''}`;
  }
  
  return expr;
}
```

---

## QA Checklist

### Tasks
- [ ] New Task dialog shows Assignee dropdown with project agents
- [ ] Creating task with assignee saves correctly
- [ ] Task cards show assignee (emoji + name) when set
- [ ] Quick reassign dropdown works on task cards
- [ ] Reassignment updates optimistically

### Activity
- [ ] Activity items show friendly summaries
- [ ] Raw message accessible via expand/details
- [ ] New summary column added to database
- [ ] Template mapper handles known types

### Schedule
- [ ] Toggle works via queue when Control API offline
- [ ] Toast confirms "Queued toggle" behavior
- [ ] Schedule shows human-readable format (Every 15 min, Daily at 9 AM)
- [ ] Last status shows as text, not floating icon
- [ ] "+ New Scheduled Task" button opens create dialog
- [ ] Create queues request when offline
- [ ] Realtime updates for new tables work

### Project Dropdown
- [ ] Never shows blank/empty selection
- [ ] Defaults to front-office when invalid
- [ ] Create project flow doesn't break selection
- [ ] Toast shows when falling back to different project
