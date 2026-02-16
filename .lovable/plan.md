

# Fix: Mission + Project Overview Not Persisting

## Root Cause

PostgreSQL UNIQUE constraints treat NULL values as **always distinct**. The current constraint `UNIQUE(project_id, agent_key, doc_type)` does not prevent duplicates when `agent_key IS NULL`.

This means:
- Every `upsert` with `agent_key: null` creates a **new row** instead of updating
- `.maybeSingle()` then finds multiple rows and returns an error
- The data appears to vanish on refresh

Current state: 3 duplicate `mission` rows and 3 duplicate `project_overview` rows exist for `front-office`.

## Fix (3 parts, minimal diffs)

### 1. Migration: NULL-safe unique index + cleanup duplicates

```sql
-- Delete duplicates, keeping only the most recent row per (project_id, doc_type) where agent_key IS NULL
DELETE FROM brain_docs a
USING brain_docs b
WHERE a.project_id = b.project_id
  AND a.doc_type = b.doc_type
  AND a.agent_key IS NULL
  AND b.agent_key IS NULL
  AND a.updated_at < b.updated_at;

-- Drop the existing unique constraint (it doesn't work with NULLs)
ALTER TABLE brain_docs DROP CONSTRAINT IF EXISTS brain_docs_project_id_agent_key_doc_type_key;

-- Create a NULL-safe unique index using COALESCE
CREATE UNIQUE INDEX brain_docs_project_agent_doctype_uniq
  ON brain_docs (project_id, COALESCE(agent_key, ''), doc_type);
```

This unique index treats `NULL` agent_key as `''` for uniqueness purposes, preventing duplicates while still storing the actual NULL value.

### 2. Frontend: Fix upsert to work with the new index

In `src/lib/api.ts`, change `saveProjectOverview` and `saveProjectMission` from using Supabase's `.upsert()` (which cannot match on a COALESCE index) to a manual select-then-insert/update pattern:

```typescript
// Instead of:
await supabase.from('brain_docs').upsert({ ... }, { onConflict: '...' });

// Use:
const { data: existing } = await supabase
  .from('brain_docs')
  .select('id')
  .eq('project_id', projectId)
  .eq('doc_type', 'mission')
  .is('agent_key', null)
  .maybeSingle();

if (existing) {
  await supabase.from('brain_docs').update({ content, updated_by: 'ui' }).eq('id', existing.id);
} else {
  await supabase.from('brain_docs').insert({ project_id: projectId, agent_key: null, doc_type: 'mission', content, updated_by: 'ui' });
}
```

Apply this pattern to both `saveProjectOverview` and `saveProjectMission`.

### 3. Frontend: Better error surfacing in ProjectOverviewCard

- In `loadOverview`: if `getProjectOverview()` or `getProjectMission()` returns an error (not just null), show a toast so the user knows the read failed rather than thinking there's nothing saved.
- The save functions already show toast errors -- no change needed there.

## Files Changed

| File | Change |
|------|--------|
| New migration | Deduplicate rows, drop old constraint, create NULL-safe unique index |
| `src/lib/api.ts` | Replace `.upsert()` with select-then-insert/update for mission and overview saves |
| `src/components/documents/ProjectOverviewCard.tsx` | Surface load errors via toast |

## No UI redesign. No new dependencies. No RLS changes needed (existing policies already allow anon read/write on brain_docs).

