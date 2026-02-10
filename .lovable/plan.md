
# Per-Doc Override Without AI Regeneration

## What changes

Currently, clicking "Create override" on any single doc (Soul, User, or Memory) triggers AI generation of ALL three docs plus description. This is overkill -- the user just wants to make that one doc editable as an agent-specific copy.

The fix: add a lightweight function that copies the inherited (global) doc content into an agent-specific row, making it an "override" without touching AI or other docs.

## Implementation

### 1. New function in `src/lib/api.ts`: `createSingleDocOverride`

A new function that:
- Fetches the current global (inherited) content for the given `docType` from `brain_docs` where `agent_key IS NULL`
- Writes it as an agent-specific row (with `agent_key` set) via disk-first sync, falling back to Supabase upsert
- Returns `{ ok: true }` on success

This is a simple copy operation -- no AI calls, no touching other doc types.

### 2. Update "Create override" button in `AgentOverview.tsx`

Change `handleCreateOverride` to call the new `createSingleDocOverride` instead of `createDocOverride`. The existing status update logic (`setDocStatus`) already correctly updates only the clicked doc type, so the "Inherited" badge will flip to "Override" for just that one doc.

### 3. Keep "Regenerate with AI" unchanged

The "Regenerate with AI" button continues to use `createDocOverride` which generates all three docs + description via the edge function. This is the correct behavior for full regeneration.

## Files to modify

| File | Change |
|------|--------|
| `src/lib/api.ts` | Add `createSingleDocOverride(agentKey, docType)` function that copies global content to agent-specific row |
| `src/components/agent-tabs/AgentOverview.tsx` | Update `handleCreateOverride` to call new function instead of `createDocOverride` |

## What stays the same

- "Regenerate with AI" button (still generates all docs)
- Auto-generate on agent creation (still generates all docs)
- DocSourceBanner override button in editors
- Edge function
- Disk-first sync logic
