

# Fix: Clear `is_proposed` on status change + remove stale approval UI

## Problem

When a proposed task is moved to "In Progress" via the board's status dropdown, only the `status` column updates. The `is_proposed` flag stays `true` in the database. So when you click into the task, the detail sheet still shows the amber "Review Required" block with Accept/Reject buttons -- even though the task is already in progress.

## Root causes

1. **`TasksPage.tsx` `handleMoveTask`** (line 108-128): patches only `status` -- never touches `isProposed`.
2. **`TaskDetailSheet.tsx` `handleStatusChange` / `performStatusChange`** (lines 83-135): same issue -- status changes don't clear `isProposed`.
3. **`TaskDetailSheet.tsx` line 405**: renders the approval block purely based on `task.isProposed`, ignoring the current status.

## Changes

### 1. `src/components/pages/TasksPage.tsx` — `handleMoveTask`

When moving any task out of `inbox` (to `in_progress` or `done`), automatically set `isProposed: false` in the patch. This ensures the flag is cleared at the database level the moment the operator moves a task forward on the board.

```ts
// Inside handleMoveTask, when building the patch:
const patch: Partial<Task> = { status: newStatus };

// Auto-clear proposed flag when moving out of inbox
if (task.isProposed && newStatus !== 'inbox') {
  patch.isProposed = false;
}
```

### 2. `src/components/tasks/TaskDetailSheet.tsx` — `performStatusChange`

Same fix: when the status dropdown in the detail sheet is changed away from `inbox`, clear `isProposed`.

```ts
// Inside performStatusChange, when building the patch:
if (task.isProposed && newStatus !== 'inbox') {
  patch.isProposed = false;
}
```

### 3. `src/components/tasks/TaskDetailSheet.tsx` — approval block guard

Change the condition on line 405 from just `task.isProposed` to also require the task to still be in `inbox` status. This is a belt-and-suspenders fix so even if stale data comes through, the approval UI won't show for in-progress tasks:

```tsx
{task.isProposed && task.status === 'inbox' && (
  <div className="bg-amber-500/10 ...">
    ...
  </div>
)}
```

### 4. `src/components/tasks/TaskDetailSheet.tsx` — remove "Needs review" badge or guard it

Line 311-315 shows a "Needs review" badge based solely on `task.isProposed`. Add the same `task.status === 'inbox'` guard:

```tsx
{task.isProposed && task.status === 'inbox' && (
  <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/10">
    Needs review
  </Badge>
)}
```

### 5. `changes.md`

Log the fix.

## What this does NOT change

- The Accept/Reject flow itself still works for tasks genuinely in inbox with `is_proposed = true`
- No database schema changes
- No changes to the Control API or agent heartbeat flow
- The 3-column board layout is untouched

## About triggering agents

The agents are already triggered by their hourly heartbeat cron jobs. The heartbeat prompt instructs agents to check for tasks assigned to them and work on `in_progress` tasks. Moving a task to `in_progress` and assigning it to an agent is all that's needed -- the agent will pick it up on its next heartbeat cycle. No additional trigger mechanism is required beyond what already exists.

