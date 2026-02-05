

# Task Outputs: Capture What Got Done

## Overview

Add structured task output capture so every completed task shows what happened—whether it's a file, a screenshot, a summary, or just a confirmation message.

---

## Database Changes

### New Table: `task_outputs`

Stores one or more outputs per task (some tasks produce multiple artifacts).

```sql
CREATE TABLE task_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  
  -- What kind of output
  output_type TEXT NOT NULL CHECK (output_type IN (
    'summary',      -- AI-generated or manual text summary
    'file',         -- Uploaded artifact (image, doc, etc.)
    'link',         -- External URL (deployed site, PR, etc.)
    'message',      -- Simple confirmation text
    'log_summary'   -- Auto-summarized from activity logs
  )),
  
  -- Content based on type
  title TEXT,                    -- Display name ("Final Design", "Build Log")
  content_text TEXT,             -- For summary/message/log_summary types
  storage_path TEXT,             -- For file type (bucket path)
  link_url TEXT,                 -- For link type
  mime_type TEXT,                -- For file type
  
  -- Who/when
  created_by TEXT,               -- agent_key or 'ui'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching outputs by task
CREATE INDEX idx_task_outputs_task ON task_outputs(task_id);

-- RLS
ALTER TABLE task_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view outputs for their projects" 
  ON task_outputs FOR SELECT 
  USING (project_id IN (SELECT id FROM projects));
CREATE POLICY "Users can insert outputs for their projects" 
  ON task_outputs FOR INSERT 
  WITH CHECK (project_id IN (SELECT id FROM projects));
```

---

## Storage Convention

Reuse the existing `clawdos-documents` bucket with this path structure:

```
clawdos-documents/
  {projectId}/
    {docId}/            ← existing documents
      file.pdf
    tasks/
      {taskId}/         ← NEW: task outputs
        screenshot.png
        final-design.fig
```

**Why one bucket?**
- Simpler RLS (project-scoped paths already work)
- Single backup/cleanup target
- No bucket proliferation as projects scale

---

## UI Changes

### 1. Task Detail Sheet: Outputs Section

Add a collapsible "Outputs" section to the task detail sheet:

```
┌─────────────────────────────────────────────────┐
│ Fix login bug                           ✓ Done  │
├─────────────────────────────────────────────────┤
│ Description: Users can't log in with SSO...    │
├─────────────────────────────────────────────────┤
│ ▼ Outputs (2)                                   │
│   📝 Summary                                    │
│      "Fixed SSO redirect by updating the       │
│       callback URL in auth config."            │
│                                                 │
│   🔗 Pull Request                               │
│      github.com/acme/app/pull/142              │
├─────────────────────────────────────────────────┤
│ Discussion (3 comments)                         │
└─────────────────────────────────────────────────┘
```

### 2. Add Output Dialog

When completing a task, prompt for outputs:

- **Summary** (text area) — what was done
- **Add file** — upload artifact
- **Add link** — paste URL
- **Auto-summarize** — generate from related activities

### 3. Completion Checklist (Optional Enhancement)

Before marking done, require:
- At least one output OR explicit "no output needed" checkbox
- Prevents empty completions

---

## Action Task Handling: Log Summarization

For tasks that are "actions" (run a script, send an email, etc.):

1. **Related Activities**: Query `activities` where `task_id` matches
2. **Summarize**: Send to existing `summarize-activity` edge function
3. **Store as `log_summary`**: Auto-create a task output with the AI summary

```typescript
// When task moves to "done" and has related activities
const relatedActivities = await getActivitiesForTask(taskId);
if (relatedActivities.length > 0) {
  const summary = await summarizeActivities(relatedActivities);
  await createTaskOutput({
    taskId,
    outputType: 'log_summary',
    title: 'Activity Log',
    contentText: summary,
  });
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/...` | Create | Add `task_outputs` table |
| `src/lib/api.ts` | Edit | Add CRUD for task outputs |
| `src/components/tasks/TaskDetailSheet.tsx` | Edit | Add Outputs section |
| `src/components/tasks/TaskOutputSection.tsx` | Create | Outputs display/add UI |
| `src/components/tasks/AddOutputDialog.tsx` | Create | Dialog for adding outputs |
| `changes.md` | Edit | Document the feature |

---

## API Functions to Add

```typescript
interface TaskOutput {
  id: string;
  taskId: string;
  projectId: string;
  outputType: 'summary' | 'file' | 'link' | 'message' | 'log_summary';
  title?: string;
  contentText?: string;
  storagePath?: string;
  linkUrl?: string;
  mimeType?: string;
  createdBy?: string;
  createdAt: string;
}

// Get all outputs for a task
getTaskOutputs(taskId: string): Promise<TaskOutput[]>

// Add an output
createTaskOutput(input: CreateTaskOutputInput): Promise<{ ok: boolean; id?: string }>

// Upload file as output
uploadTaskOutput(taskId: string, file: File, title: string): Promise<{ ok: boolean; id?: string }>

// Delete an output
deleteTaskOutput(outputId: string): Promise<{ ok: boolean }>

// Auto-generate log summary for a task
generateTaskLogSummary(taskId: string): Promise<{ ok: boolean; summary?: string }>
```

---

## Edge Cases

1. **No activities for action task**: Skip auto-summary, allow manual entry
2. **Large files**: Same limits as documents (handled by Supabase storage)
3. **Task deleted**: Cascade delete outputs + storage cleanup
4. **Multiple outputs**: Support array (some tasks produce several artifacts)
5. **Viewing outputs**: Reuse `DocumentViewer` component for files

---

## Future Enhancements

- **Pinned comments as outputs**: Mark specific comments as "artifact"
- **Output templates**: Pre-fill output types based on task labels
- **Agent enforcement**: Require outputs before agents can mark done
- **Output gallery**: Visual grid of all task artifacts across project

