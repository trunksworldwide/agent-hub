

# Fix "Regenerate with AI" + Auto-Generate Docs on Agent Creation

## Problem

1. **"Regenerate with AI" button is broken** -- it only calls `createDocOverride(agent.id, 'soul')`, generating only SOUL.md. The toast misleadingly says "SOUL, USER, and MEMORY docs created."
2. **No auto-generation on agent creation** -- new agents start with all docs inherited from Trunks. The user has to manually find and click override buttons.

## Changes

### 1. Fix "Regenerate with AI" in `AgentOverview.tsx`

The inline `onClick` handler (lines 245-263) currently calls `createDocOverride(agent.id, 'soul')` -- only soul.

Fix: call `createDocOverride` for all three doc types (soul, user, memory_long). Since `createDocOverride` already calls the AI edge function and does disk-first sync, we just need to call it three times (or refactor it to accept multiple types).

However, looking at the current `createDocOverride` implementation, it already generates ALL docs in one edge function call (soul + user + memory + description) and writes all three rows. So the fix is simpler: the button just needs to call `createDocOverride` once with any type -- the function generates everything. But the UI only updates the status for the one type passed. 

**Actual fix**: After `createDocOverride` completes, refresh the full doc status (which it already does on line 252 with `getDocOverrideStatus`). The real bug is that `createDocOverride` in `api.ts` may only be writing the single doc type passed. Need to verify and fix the API layer.

### 2. Verify/fix `createDocOverride` in `api.ts`

Ensure it generates and writes ALL three doc types (soul, user, memory_long) plus updates `agents.description`, regardless of which `docType` is passed. The edge function already returns all four outputs.

### 3. Auto-generate on agent creation

In the agent creation flow, after the agent row is inserted and provisioned, automatically call `createDocOverride` if the agent has a `purpose_text` set. This gives every new agent tailored docs from the start.

The creation flow likely lives in a dialog component -- need to find it and add a post-creation step.

## Files to modify

| File | Change |
|------|--------|
| `src/lib/api.ts` | Verify `createDocOverride` writes all 3 doc types + description from the single edge function response |
| `src/components/agent-tabs/AgentOverview.tsx` | Fix "Regenerate with AI" onClick to properly trigger full regeneration and refresh all statuses |
| Agent creation dialog (likely `src/components/dialogs/` or `AgentsPage.tsx`) | Add auto-generate step after agent creation when purpose_text is provided |

## What stays the same

- Edge function (already generates all 4 outputs)
- DocSourceBanner (works correctly as-is)
- Individual "Create override" buttons on doc rows (fine for single-doc overrides)
- Disk-first sync logic

