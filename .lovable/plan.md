

# Fix: Brain Doc Editors Not Connected to Supabase Data

## Root Cause

There's a mismatch between how the sync script stores docs and how the editors read/write them:

- **brain-doc-sync.mjs** (Mac mini) stores SOUL.md, USER.md, MEMORY.md with `agent_key = NULL` (project-global docs)
- **SoulEditor / UserEditor / MemoryEditor** query with `.eq('agent_key', 'agent:main:main')` -- which never matches NULL rows in SQL
- **saveAgentFile** writes with `agent_key = 'agent:main:main'`, creating a separate row that the sync script ignores

Result: editors always see blank content, and any saves from the dashboard never reach your Mac mini.

## Fix Strategy

Update `getAgentFile` and `saveAgentFile` in `src/lib/api.ts` to handle the global-doc fallback:

### Reading (`getAgentFile`)
1. First, try to find an agent-specific row (`.eq('agent_key', agentId)`)
2. If not found, fall back to the global row (`.is('agent_key', null)`)
3. Track which row was found so saves go to the right place

### Writing (`saveAgentFile`)
1. For doc types that have a global row (`soul`, `user`, `memory_long`, `agents`), check if a global row exists
2. If the content was loaded from the global row, save back to the global row (so brain-doc-sync picks it up)
3. If the agent has its own dedicated row, save to that

This ensures:
- Trunks (agent:main:main) sees the SOUL.md content that brain-doc-sync put there
- Saves from the dashboard write to the same row, so changes sync back to the Mac mini
- Future per-agent overrides still work (agent-specific rows take priority)

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/api.ts` | Update `getAgentFile` with NULL fallback query; update `saveAgentFile` to write to the correct row |
| `changes.md` | Log the fix |

## Technical Detail

In `getAgentFile`, replace the single query:
```typescript
// BEFORE: never matches NULL rows
.eq('agent_key', agentId)

// AFTER: try agent-specific first, then global
const { data } = await supabase
  .from('brain_docs')
  .select('content,updated_at,agent_key')
  .eq('project_id', projectId)
  .eq('doc_type', type)
  .in('agent_key', [agentId])  // agent-specific
  .maybeSingle();

// If not found, try global
if (!data) {
  const { data: global } = await supabase
    .from('brain_docs')
    .select('content,updated_at,agent_key')
    .eq('project_id', projectId)
    .eq('doc_type', type)
    .is('agent_key', null)
    .maybeSingle();
  // use global if found
}
```

In `saveAgentFile`, for global doc types, check if a global row exists and save to it (using `.is('agent_key', null)` in the upsert) so brain-doc-sync sees the change.

## What this means for you
- After this fix, opening Trunks' Soul tab will show the actual SOUL.md content
- Editing and saving will write back to the same row the sync script watches
- Changes will flow: Dashboard save -> Supabase (agent_key=NULL) -> brain-doc-sync -> local file on Mac mini
- No changes needed on your Mac mini or to brain-doc-sync
