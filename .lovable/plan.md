

# Activity → Task Output Viewer

## Overview

When you click on an activity item that's linked to a task, it should show the task's outputs in a lightweight preview — without navigating away from the Activity page. This keeps the feed readable while letting you quickly inspect what was delivered.

---

## Current State

- **ActivityItem** has a `taskId` field (nullable) linking activities to tasks
- **TaskDetailSheet** already loads and displays outputs via `getTaskOutputs(taskId)`
- **Activity feed** currently has no click behavior — items are display-only

---

## Proposed Solution

### Approach: Lightweight Task Preview Sheet

Instead of re-rendering the full `TaskDetailSheet` (which loads comments, has editing UI, etc.), we'll create a **lightweight read-only preview** specifically for the Activity page that:

1. Shows task title + status badge
2. Shows outputs (reusing `TaskOutputSection` in read-only mode)
3. Optionally links to the full task detail (opens Tasks page)

This avoids loading comments/thread data we don't need on Activity page.

---

## Why Not Just Use TaskDetailSheet?

- **TaskDetailSheet** is 600+ lines with editing, comments, status changes
- Loading it for every activity click would fetch unnecessary data
- Activity page context is different: you want to see "what happened" not manage the task

---

## Database Consideration

Currently, outputs are fetched per-task via `getTaskOutputs(taskId)`. Two options:

**Option A: Fetch on Click (simpler, recommended)**
- When user clicks an activity with a `taskId`, fetch that task's outputs
- Pros: No schema change, works immediately
- Cons: One extra fetch per click

**Option B: Pre-fetch with Activity (more complex)**
- Join `task_outputs` when fetching activities
- Pros: No fetch on click
- Cons: Heavier initial load, complex query, not all activities have tasks

**Recommendation:** Start with Option A. If performance becomes an issue, we can add caching or pre-fetching later.

---

## UI Changes

### 1. Make Activity Items Clickable (when task-linked)

```
┌─────────────────────────────────────────────────┐
│ 📝 Fixed login bug — updated callback URL      → │  ← clickable when has taskId
│ 🤖 Trunks • 2 min ago                           │
└─────────────────────────────────────────────────┘
```

Visual cues for clickable items:
- Subtle hover effect (already exists)
- Right chevron icon when `taskId` is present
- Cursor: pointer

### 2. Task Output Preview Sheet

A new lightweight sheet that opens when clicking a task-linked activity:

```
┌─────────────────────────────────────────────────┐
│ Task: Fix login bug                     ✓ Done  │
├─────────────────────────────────────────────────┤
│ ▼ Outputs (2)                                   │
│   📝 Summary                                    │
│      "Fixed SSO redirect by updating..."       │
│                                                 │
│   🔗 Pull Request                               │
│      github.com/acme/app/pull/142              │
├─────────────────────────────────────────────────┤
│ [View Full Task →]                              │
└─────────────────────────────────────────────────┘
```

Features:
- Task title + status badge (read-only)
- Outputs section (reusing existing `TaskOutputSection` in read-only mode)
- "View Full Task" link that navigates to Tasks page with that task selected

### 3. API Addition

Need a function to fetch a single task by ID (currently only `getTasks()` exists):

```typescript
export async function getTaskById(taskId: string): Promise<Task | null>
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/api.ts` | Edit | Add `getTaskById(taskId)` function |
| `src/components/activity/TaskOutputPreview.tsx` | Create | Lightweight sheet for viewing task outputs |
| `src/components/pages/ActivityPage.tsx` | Edit | Add click handler for task-linked activities, show preview sheet |
| `src/components/tasks/TaskOutputSection.tsx` | Edit | Add optional `readOnly` prop to hide add/delete buttons |
| `changes.md` | Edit | Document the feature |

---

## Technical Details

### New API Function

```typescript
export async function getTaskById(taskId: string): Promise<Task | null> {
  if (!hasSupabase() || !supabase) return null;
  
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();
    
  if (error || !data) return null;
  
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    status: data.status,
    assigneeAgentKey: data.assignee_agent_key,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    isProposed: data.is_proposed,
    rejectedAt: data.rejected_at,
    rejectedReason: data.rejected_reason,
    blockedReason: data.blocked_reason,
    blockedAt: data.blocked_at,
  };
}
```

### TaskOutputPreview Component

```typescript
interface TaskOutputPreviewProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewFullTask: () => void;  // Navigate to Tasks page
}
```

State:
- `task: Task | null` — fetched on open
- `outputs: TaskOutput[]` — fetched on open
- `isLoading: boolean`

### ActivityPage Click Handler

```typescript
const handleActivityClick = (item: ActivityItem) => {
  if (item.taskId) {
    setPreviewTaskId(item.taskId);
    setShowPreview(true);
  }
};

const handleViewFullTask = () => {
  // Navigate to Tasks page with task selected
  navigate('/tasks');
  setSelectedTaskId(previewTaskId);
  setShowPreview(false);
};
```

---

## Edge Cases

1. **Task deleted**: Show "Task not found" message in preview
2. **No outputs**: Show empty state "No outputs recorded"
3. **Activity without taskId**: No click behavior (or show tooltip "No linked task")
4. **Loading state**: Show skeleton in preview while fetching

---

## Future Enhancements

- **Inline preview**: Show first output directly in activity item (expandable)
- **Activity grouping**: Group activities by task for cleaner view
- **Quick actions**: Add output directly from preview without opening full task

