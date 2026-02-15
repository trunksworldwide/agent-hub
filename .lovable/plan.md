

# Fix: brain_docs Unique Constraint Blocking Agent Overrides

## Problem

The `brain_docs` table has two unique indexes:
1. `brain_docs_project_type_uidx` on `(project_id, doc_type)` -- **this is the problem**
2. `brain_docs_project_id_agent_key_doc_type_key` on `(project_id, agent_key, doc_type)` -- this is correct

Index #1 was created before agent-specific overrides existed. It only allows ONE row per `(project_id, doc_type)` combination, so when the global row (with `agent_key = NULL`) already exists for e.g. `soul`, inserting an agent-specific override row (with `agent_key = 'agent:ricky:main'`, same `project_id` and `doc_type = 'soul'`) violates index #1.

Index #2 is the correct constraint -- it allows both a global row (`agent_key = NULL`) and agent-specific rows to coexist for the same doc type.

## Fix

Drop the overly restrictive index #1 via a Supabase migration:

```sql
DROP INDEX IF EXISTS brain_docs_project_type_uidx;
```

Index #2 (`brain_docs_project_id_agent_key_doc_type_key`) already enforces the correct uniqueness: one row per `(project_id, agent_key, doc_type)` combination.

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| New migration file | `DROP INDEX IF EXISTS brain_docs_project_type_uidx;` |

### Why This Is Safe

- Index #2 already prevents duplicate rows for the same agent + doc type combination
- Global docs (where `agent_key IS NULL`) remain unique per project because PostgreSQL treats each NULL as distinct in unique indexes -- but that is already handled by application logic (upsert with `onConflict` on index #2)
- No data changes, no column changes, just removing the redundant restrictive index

### Verification
1. Click "Create override" for an agent doc -- no error, badge shows "Override"
2. Click "Generate with AI" -- all three docs (soul, user, memory) are created without errors
3. Global docs still load correctly for agents without overrides

