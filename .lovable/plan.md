

# Fix Cron Jobs: Auto-Assign Existing Jobs + Enable Queue-Based Editing

## Problem Summary

1. **All existing jobs show "Needs assignment"** because they were created before the assignment feature - their `target_agent_key` is NULL in the database

2. **Users cannot edit instructions** because the Edit button only appears when the Control API is connected. In remote/mirror mode, the button is hidden entirely.

## Solution Overview

### Part 1: Auto-Assign Existing Jobs to Trunks

Run a one-time update to assign all existing unassigned cron jobs to the default agent (Trunks):

```sql
UPDATE cron_mirror 
SET target_agent_key = 'agent:main:main', 
    job_intent = 'custom',
    updated_at = now()
WHERE project_id = 'front-office' 
  AND target_agent_key IS NULL;
```

This immediately fixes the "Needs assignment" display for all current jobs.

### Part 2: Enable Queue-Based Job Editing (Offline Mode)

Currently, the Edit feature requires the Control API. We need to extend it to work via the patch queue when offline:

**Changes to CronPage.tsx:**

1. **Always show the Edit button** (not just when controlApiConnected)

2. **Add target agent and intent fields** to the Edit dialog (missing currently)

3. **Update handleSaveEdit** to use queue pattern when offline:

```typescript
const handleSaveEdit = async () => {
  if (!editingJob || savingEdit) return;
  setSavingEdit(true);
  
  try {
    // Encode agent + intent into instructions for durability
    const encodedInstructions = encodeJobHeaders(
      editTargetAgent || null,
      editJobIntent || null,
      editInstructions || ''
    );
    
    if (controlApiConnected) {
      // Direct edit via Control API
      await editCronJob(editingJob.jobId, {
        name: editName,
        schedule: editSchedule,
        instructions: encodedInstructions,
      });
      toast({ title: 'Job updated' });
    } else {
      // Queue patch request for offline execution
      const result = await queueCronPatchRequest(editingJob.jobId, {
        name: editName,
        scheduleExpr: editSchedule,
        instructions: encodedInstructions,
        targetAgentKey: editTargetAgent || undefined,
        jobIntent: editJobIntent || undefined,
      });
      if (result.ok) {
        toast({ 
          title: 'Edit queued', 
          description: 'Changes will apply when the executor picks up the request.' 
        });
      }
    }
    
    setEditingJob(null);
    await loadJobs();
  } catch (err) {
    // ... error handling
  }
};
```

4. **Update openEdit** to populate new fields:

```typescript
const openEdit = (job: CronMirrorJob) => {
  setEditingJob(job);
  setEditName(job.name || '');
  setEditSchedule(job.scheduleExpr || '');
  // Parse instructions to get body without headers
  const { body, targetAgent, intent } = decodeJobHeaders(job.instructions);
  setEditInstructions(body);
  setEditTargetAgent(targetAgent || job.targetAgentKey || '');
  setEditJobIntent((intent || job.jobIntent || 'custom') as JobIntent);
};
```

5. **Enhance Edit Dialog** with agent/intent dropdowns matching the Create dialog

---

## Technical Implementation

### File Changes

| File | Changes |
|------|---------|
| Database | One-time UPDATE to assign existing jobs to Trunks |
| `src/components/pages/CronPage.tsx` | Add edit state for agent/intent, update openEdit and handleSaveEdit, show Edit button always, enhance Edit dialog UI |

### New State Variables

```typescript
// Add to existing edit dialog state
const [editTargetAgent, setEditTargetAgent] = useState('');
const [editJobIntent, setEditJobIntent] = useState<JobIntent>('custom');
```

### Updated Edit Dialog UI

The Edit dialog will include:
- Job Name (existing)
- Schedule (existing, but use human-friendly editor instead of raw cron)
- Target Agent dropdown (new)
- Job Intent dropdown (new)
- Instructions textarea (existing)
- Offline mode warning banner

### API Layer

The existing `queueCronPatchRequest` already supports patching:
- `name`
- `scheduleExpr`
- `instructions`
- `targetAgentKey`
- `jobIntent`

No API changes needed.

---

## Implementation Order

1. Run database update to auto-assign existing jobs to Trunks
2. Add `editTargetAgent` and `editJobIntent` state variables
3. Update `openEdit` to parse and populate agent/intent from job
4. Update `handleSaveEdit` to use queue pattern when offline
5. Remove the `controlApiConnected &&` condition from Edit button
6. Enhance Edit dialog with agent/intent dropdowns
7. Add human-friendly schedule editor to Edit dialog (optional, can use raw cron for now)
8. Add offline mode warning banner to Edit dialog

---

## Expected Outcome

1. All existing jobs immediately show "Trunks" instead of "Needs assignment"
2. Users can click Edit on any job even when the Mac mini is offline
3. Edits are queued and applied when the executor picks them up
4. Instructions are editable with agent/intent metadata preserved
5. The queue pattern remains consistent across all operations (run, toggle, delete, edit, create)

---

## Out of Scope

- Human-friendly schedule editor in Edit dialog (keep raw cron input for v1)
- Bulk editing of multiple jobs
- Undo/revert of edits

