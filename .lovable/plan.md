
# MVP Plan: Proposed Inbox, Accept/Reject, Threaded Work + Blocked Reasons + List View

## Executive Summary

This plan implements a complete task workflow system with:
- Proposed tasks that require review before becoming real work
- Accept/Reject actions with audit trail
- Threaded comments per task for progress/errors
- Blocked reason requirement when blocking tasks
- A new List View as an alternative to the Kanban board

All changes are additive and will not break existing functionality.

---

## Current State Summary

### Existing Infrastructure
- **Tasks table** has: `id`, `title`, `description`, `status`, `assignee_agent_key`, `project_id`, `created_at`, `updated_at`
- **Task statuses**: `inbox`, `assigned`, `in_progress`, `review`, `done`, `blocked`
- **task_comments table** already exists in the schema with: `id`, `project_id`, `task_id`, `author_agent_key`, `content`, `created_at`
- **TasksPage** renders a Kanban board with status selectors and assignee dropdowns
- **NewTaskDialog** is a shared component for creating tasks
- **Activities table** already supports task logging with `task_id` foreign key

### What Needs to Be Built
1. Schema additions: `is_proposed`, `rejected_at`, `rejected_reason`, `blocked_reason`, `blocked_at` on tasks
2. API functions for task comments (CRUD)
3. Task Detail Sheet with review actions and thread
4. Proposed tasks visual separation in Inbox
5. Blocked reason modal
6. Board/List toggle with new List View

---

## Phase 1: Database Schema Migrations

### Migration 1: Task Workflow Columns

Add columns to the existing `tasks` table:

```sql
-- Add proposed/rejected/blocked tracking columns
ALTER TABLE public.tasks 
ADD COLUMN is_proposed boolean DEFAULT false,
ADD COLUMN rejected_at timestamptz DEFAULT NULL,
ADD COLUMN rejected_reason text DEFAULT NULL,
ADD COLUMN blocked_reason text DEFAULT NULL,
ADD COLUMN blocked_at timestamptz DEFAULT NULL;

-- Index for filtering proposed tasks
CREATE INDEX tasks_proposed_idx ON public.tasks(project_id, is_proposed) WHERE is_proposed = true;

-- Index for filtering rejected tasks (done + rejected_at not null)
CREATE INDEX tasks_rejected_idx ON public.tasks(project_id, rejected_at) WHERE rejected_at IS NOT NULL;
```

### No Migration Needed for task_comments

The `task_comments` table already exists in the schema with the right structure:
- `id` (uuid, pk)
- `project_id` (text, not null)
- `task_id` (uuid, not null, FK to tasks)
- `author_agent_key` (text, nullable)
- `content` (text, not null)
- `created_at` (timestamptz)

It already has RLS policies matching the app's access model.

---

## Phase 2: API Layer Updates

### 2.1 Update Task Interface

Update the `Task` interface in `src/lib/api.ts`:

```typescript
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeAgentKey?: string;
  createdAt: string;
  updatedAt: string;
  // New fields
  isProposed?: boolean;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  blockedReason?: string | null;
  blockedAt?: string | null;
}
```

### 2.2 Update getTasks()

Fetch the new columns:

```typescript
.select('id,title,description,status,assignee_agent_key,created_at,updated_at,is_proposed,rejected_at,rejected_reason,blocked_reason,blocked_at')
```

### 2.3 Update updateTask()

Extend the patch to support new fields:

```typescript
export async function updateTask(taskId: string, patch: Partial<Pick<Task, 
  'status' | 'assigneeAgentKey' | 'title' | 'description' | 
  'isProposed' | 'rejectedAt' | 'rejectedReason' | 'blockedReason' | 'blockedAt'
>>): Promise<{ ok: boolean }>
```

### 2.4 Add Task Comments API

```typescript
export interface TaskComment {
  id: string;
  projectId: string;
  taskId: string;
  authorAgentKey: string | null;
  content: string;
  createdAt: string;
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]>
export async function createTaskComment(input: { taskId: string; content: string; authorAgentKey?: string }): Promise<{ ok: boolean; comment?: TaskComment }>
```

---

## Phase 3: Core UI Components

### 3.1 TaskDetailSheet Component

New file: `src/components/tasks/TaskDetailSheet.tsx`

A Sheet (slide-out panel) that shows:

```
+---------------------------------------+
| [Title]                          [X]  |
| [Status badge] [Assignee dropdown]    |
+---------------------------------------+
| [Description - editable]              |
+---------------------------------------+
| REVIEW ACTIONS (if is_proposed=true)  |
| [Accept] [Accept & Start] [Reject]    |
+---------------------------------------+
| BLOCKED INFO (if status=blocked)      |
| Reason: "..."        [Resolve]        |
+---------------------------------------+
| THREAD                                |
| +-----------------------------------+ |
| | Comment 1                         | |
| | Comment 2                         | |
| | ...                               | |
| +-----------------------------------+ |
| [Composer input]           [Send]     |
+---------------------------------------+
```

Key behaviors:
- Opens when clicking a task card (anywhere on the board or list)
- Shows review actions only for proposed tasks
- Shows blocked reason only for blocked tasks
- Thread loads from `task_comments` table
- Composer creates new comments

### 3.2 ProposedTaskSection in Inbox

Update the Inbox column in TasksPage to visually separate proposed tasks:

```
+-------------------------+
| INBOX                   |
+-------------------------+
| NEEDS REVIEW (2)        |
| +---------------------+ |
| | [PROPOSED] Task A   | |
| +---------------------+ |
| | [PROPOSED] Task B   | |
| +---------------------+ |
|                         |
| MANUAL TASKS (3)        |
| +---------------------+ |
| | Task C              | |
| +---------------------+ |
| | Task D              | |
| +---------------------+ |
+-------------------------+
```

Proposed tasks:
- Show a "Needs review" badge (subtle amber/warning color)
- Appear at the top of the Inbox column
- Have a subtle tinted border to distinguish them

### 3.3 BlockedReasonModal

New file: `src/components/tasks/BlockedReasonModal.tsx`

A dialog that prompts for a blocked reason when moving to blocked status:

```
+---------------------------------------+
| Why is this blocked?                  |
+---------------------------------------+
| [Textarea: What's blocking this?]     |
|                                       |
| [x] Post to thread too (default ON)   |
+---------------------------------------+
| [Cancel]                  [Block]     |
+---------------------------------------+
```

Triggers when:
- User changes status to "blocked" via dropdown
- User drags task to blocked column (if drag-drop exists)

### 3.4 RejectConfirmDialog

New file: `src/components/tasks/RejectConfirmDialog.tsx`

A confirmation dialog when rejecting a proposed task:

```
+---------------------------------------+
| Reject this task?                     |
+---------------------------------------+
| [Textarea: Reason (optional)]         |
+---------------------------------------+
| [Cancel]                  [Reject]    |
+---------------------------------------+
```

On reject:
- Set `rejected_at = now()`
- Set `rejected_reason = input`
- Set `status = 'done'` (keeps status simple)
- Set `is_proposed = false`

Rejected tasks are hidden by default (filter: `rejected_at IS NULL`).

---

## Phase 4: Review Actions Implementation

### 4.1 Accept Action

When "Accept" is clicked on a proposed task:
1. Set `is_proposed = false`
2. Set `status = 'assigned'`
3. Create activity: `"Accepted proposed task: {title}"`

### 4.2 Accept & Start Action

When "Accept & Start" is clicked:
1. Set `is_proposed = false`
2. Set `status = 'in_progress'`
3. Create activity: `"Accepted & started: {title}"`

### 4.3 Reject Action

When "Reject" is confirmed:
1. Set `rejected_at = now()`
2. Set `rejected_reason = input` (if provided)
3. Set `status = 'done'`
4. Set `is_proposed = false`
5. Create activity: `"Rejected proposed task: {title}"`

---

## Phase 5: Thread/Comments Implementation

### 5.1 Thread UI in TaskDetailSheet

- Load comments via `getTaskComments(taskId)`
- Display in chronological order (oldest first, newest at bottom)
- Show author (resolve agent name from agents list) + relative time
- Composer at bottom with Enter to send

### 5.2 Comment Creation

When a comment is posted:
1. Insert into `task_comments`
2. Create activity: `type: 'task_comment'`, `message: 'Commented on "{title}": {first 80 chars}'`

### 5.3 Blocked Reason in Thread

When a task is blocked with "Post to thread too" checked:
1. Create the comment: `"Blocked: {reason}"`
2. Set `blocked_reason` and `blocked_at` on task

---

## Phase 6: Blocked Flow Implementation

### 6.1 Intercept Status Change to Blocked

When status changes to "blocked":
1. If `blocked_reason` is empty, open BlockedReasonModal
2. Modal collects reason and "post to thread" preference
3. On submit:
   - Set `blocked_reason = input`
   - Set `blocked_at = now()`
   - Set `status = 'blocked'`
   - If post to thread: create comment
   - Create activity: `"Blocked: {title} - {reason}"`

### 6.2 Resolve Blocked

In TaskDetailSheet or List View:
- "Resolve" button on blocked tasks
- Opens dropdown: "Move to Assigned" / "Move to In Progress"
- Clears `blocked_reason` and `blocked_at`
- Creates activity: `"Unblocked: {title}"`

---

## Phase 7: List View Implementation

### 7.1 Board/List Toggle

Add a toggle in TasksPage header:

```
+------------------------------------------+
| Tasks        [Board | List]  [+] [Refresh]|
+------------------------------------------+
```

Persist preference in localStorage: `clawdos.tasksView.{projectId}`

### 7.2 TaskListView Component

New file: `src/components/tasks/TaskListView.tsx`

```
+--------------------------------------------------+
| Search: [___________]  Assignee: [▼]  Status: [▼] |
| [ ] Show Done  [ ] Show Rejected                  |
+--------------------------------------------------+
|                                                  |
| IN PROGRESS (2)                                  |
| +----------------------------------------------+ |
| | Task A  [In Progress]  🤖 Trunks   2m ago    | |
| | Task B  [In Progress]  👤 Unassigned  5m ago | |
| +----------------------------------------------+ |
|                                                  |
| BLOCKED (1)                                      |
| +----------------------------------------------+ |
| | Task C  [Blocked]  💻 Coder  10m ago         | |
| |   └ "Waiting for API key"                    | |
| +----------------------------------------------+ |
|                                                  |
| ASSIGNED (3)                                     |
| +----------------------------------------------+ |
| | ...                                          | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

Features:
- Default filter: Assigned, In Progress, Blocked, Review
- Done collapsed behind "Show Done" toggle
- Rejected hidden by default behind "Show Rejected" toggle
- Group by status (default ON)
- Sort: In Progress > Blocked > Assigned > Review > Done
- Each row clickable to open TaskDetailSheet

### 7.3 Quick Actions in List

Each row has a small actions area:
- Status dropdown (or 3-dot menu with status options)
- For blocked tasks: "Resolve" button

---

## Phase 8: Activity Logging

All actions create appropriate activity entries:

| Action | Type | Message |
|--------|------|---------|
| Accept proposed | `task_accepted` | `Accepted proposed task: "{title}"` |
| Accept & Start | `task_accepted` | `Accepted & started: "{title}"` |
| Reject proposed | `task_rejected` | `Rejected proposed task: "{title}"` |
| Block task | `task_blocked` | `Blocked: "{title}" - {reason}` |
| Unblock task | `task_unblocked` | `Unblocked: "{title}"` |
| Comment added | `task_comment` | `Commented on "{title}": {first 80 chars}` |

---

## Implementation Order

1. **Database Migration**
   - Add columns to tasks table

2. **API Layer**
   - Update Task interface
   - Update getTasks to fetch new columns
   - Update updateTask to support new fields
   - Add getTaskComments and createTaskComment

3. **Core Components**
   - Create TaskDetailSheet
   - Create BlockedReasonModal
   - Create RejectConfirmDialog
   - Update task cards to be clickable

4. **Inbox Updates**
   - Update TasksPage to separate proposed tasks
   - Add "Needs review" badge styling
   - Add filtering for rejected tasks

5. **Review Actions**
   - Implement Accept/Accept & Start/Reject in TaskDetailSheet

6. **Thread Implementation**
   - Comment list in TaskDetailSheet
   - Comment composer
   - Activity logging for comments

7. **Blocked Flow**
   - Intercept status change to blocked
   - BlockedReasonModal integration
   - Resolve action

8. **List View**
   - Board/List toggle
   - TaskListView component
   - Filters and search
   - Quick actions

---

## Technical Details

### Rejected Task Handling

**Design decision:** Keep rejected tasks in status `done` with `rejected_at` timestamp.

Rationale:
- No new status needed (avoids Kanban column complexity)
- Simple filter: `rejected_at IS NULL` for normal views
- `rejected_at IS NOT NULL` for "Show Rejected" filter
- Audit trail preserved

### Proposed Task UI

- Badge variant: `outline` with amber/warning styling
- Card border: subtle amber-500/30 tint
- Position: top of Inbox column in separate section

### Thread Author Resolution

- If `author_agent_key` starts with `agent:`, look up in agents list for emoji + name
- If `author_agent_key` is `ui` or `dashboard`, show "You" or user icon
- Fallback: show the raw key

### List View Sorting

Default order within groups:
1. Most recently updated first

Group order:
1. In Progress (active work)
2. Blocked (needs attention)
3. Assigned (ready to start)
4. Review (waiting for feedback)
5. Done (collapsed)

---

## File Changes Summary

| File | Type | Changes |
|------|------|---------|
| `supabase/migrations/xxx.sql` | New | Add task workflow columns |
| `src/lib/api.ts` | Edit | Update Task interface, add comment APIs |
| `src/components/tasks/TaskDetailSheet.tsx` | New | Task detail panel with thread |
| `src/components/tasks/BlockedReasonModal.tsx` | New | Blocked reason prompt |
| `src/components/tasks/RejectConfirmDialog.tsx` | New | Reject confirmation |
| `src/components/tasks/TaskListView.tsx` | New | List view component |
| `src/components/tasks/TaskCard.tsx` | New | Reusable task card component |
| `src/components/pages/TasksPage.tsx` | Edit | Board/List toggle, proposed separation, card click handling |
| `src/lib/store.ts` | Edit | Add selectedTaskId for detail sheet |

---

## QA Checklist

### Proposed Tasks
- [ ] Proposed tasks appear at top of Inbox with "Needs review" badge
- [ ] Proposed tasks have visual distinction (border/tint)
- [ ] Clicking proposed task opens TaskDetailSheet with review actions
- [ ] Regular inbox tasks appear below proposed section

### Review Actions
- [ ] Accept moves to Assigned and clears is_proposed
- [ ] Accept & Start moves to In Progress and clears is_proposed
- [ ] Reject prompts for reason and moves to Done with rejected_at
- [ ] Activity logged for all review actions

### Task Detail Sheet
- [ ] Opens when clicking any task card
- [ ] Shows title, status, assignee, description
- [ ] Assignee dropdown shows project agents
- [ ] Thread section shows comments
- [ ] Composer posts new comments
- [ ] Review actions only show for proposed tasks
- [ ] Blocked info only shows for blocked tasks

### Thread/Comments
- [ ] Comments load in chronological order
- [ ] Author displays with emoji/name for agents
- [ ] Enter sends comment
- [ ] Activity logged for new comments
- [ ] Empty state: "No comments yet"

### Blocked Flow
- [ ] Moving to blocked triggers reason modal
- [ ] Reason is required to proceed
- [ ] "Post to thread" option works
- [ ] Blocked tasks show reason in detail and list
- [ ] Resolve action clears blocked state
- [ ] Activity logged for block/unblock

### List View
- [ ] Board/List toggle works
- [ ] Preference persists per project
- [ ] List shows grouped tasks with correct order
- [ ] Filters work (search, assignee, status)
- [ ] Show Done/Rejected toggles work
- [ ] Clicking row opens TaskDetailSheet
- [ ] Quick actions work (status change, resolve)

### General
- [ ] All changes project-scoped
- [ ] Mobile layout works (responsive cards, scrollable list)
- [ ] Error states show with retry
- [ ] Activity feed not broken
- [ ] Kanban board still works as before

---

## Design Decisions Confirmed

1. **Reject behavior:** Keep in Inbox but hidden (status = done, rejected_at set, filtered by default)

2. **Accept default:** Moves to Assigned

3. **Accept & Start:** Skips Assigned, goes directly to In Progress

4. **Blocked reason:** Required via modal, stored on task, optionally posted to thread

5. **List View:** Separate component, toggle in header, mobile-first design
