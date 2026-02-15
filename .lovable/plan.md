

# Fix: AI-Generated Docs Not Appearing + Exclude Memory from Override/Regenerate

## Problem 1: AI-Generated Content Not Visible

When you click "Regenerate with AI," the edge function runs successfully and new content is written to Supabase -- but when you navigate to the Soul or User editor tabs, you still see the old content.

**Root cause:** The Zustand store caches file content under keys like `agent:ricky:main-soul`. The Soul/User editors only load from Supabase if there is NO cached entry (`if (!fileState)`). After regeneration, the cache still holds the old content, and the editors never re-fetch.

The "Regenerate with AI" button calls `onRefresh?.()` which reloads agent metadata, but does NOT clear the file caches in the Zustand store.

**Fix:** After successful regeneration in `AgentOverview.tsx`, clear the cached file entries for the affected doc types so the editors will re-fetch from Supabase on next render.

## Problem 2: Memory Should Be Excluded

Memory is a running knowledge base that accumulates over time. Regenerating or overriding it would wipe learned context. Both the "Create override" button for Memory and the "Regenerate with AI" flow should exclude it.

**Fix:**
- Remove the Memory entry from the doc override list in `AgentOverview.tsx` (no more "Create override" or "Edit" buttons for Memory in the Overview tab)
- Remove `memory_long` from the `createDocOverride` AI regeneration loop (skip the memory write)
- The Memory editor tab remains accessible separately -- it just is not part of the bulk override/regenerate flow

## Technical Details

### `src/lib/store.ts`

Add a `clearFileCache(key: string)` action that removes a specific file entry from the `files` record. This allows the editors to re-fetch fresh content.

### `src/components/agent-tabs/AgentOverview.tsx`

**After "Regenerate with AI" succeeds (around line 207):**
- Import `useClawdOffice` already exists; destructure the new `clearFileCache`
- Clear cached entries: `clearFileCache(\`${agent.id}-soul\`)` and `clearFileCache(\`${agent.id}-user\`)`
- This forces the Soul/User editors to re-fetch from Supabase on next tab switch

**Remove Memory from the docEntries array (around line 134):**
- Remove `{ key: 'memory_long', label: 'Memory', icon: '...', tab: 'memory' }` from the list
- This removes the "Create override" and "Edit" buttons for Memory from the Overview tab
- The Memory tab itself remains accessible via the tab bar

### `src/lib/api.ts` -- `createDocOverride`

Remove the `memory_long` entry from the `docsToWrite` array (line 1366). The AI regeneration will only write soul, user, and description -- not memory.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/store.ts` | Add `clearFileCache(key)` action |
| `src/components/agent-tabs/AgentOverview.tsx` | Clear file cache after regeneration; remove Memory from override list |
| `src/lib/api.ts` | Remove `memory_long` from `createDocOverride` |

### Verification
1. Click "Regenerate with AI" for Ricky -- success toast appears
2. Switch to the Soul tab -- new AI-generated content is visible (not old content)
3. Switch to the User tab -- new AI-generated content is visible
4. Memory tab still works independently; its content was NOT overwritten by regeneration
5. The Overview tab no longer shows a "Create override" button for Memory
