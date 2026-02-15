

# Fix: "Create Override" Not Persisting to Supabase

## Problem

When clicking "Create override" for a sub-agent (e.g. Ricky), the function `createSingleDocOverride` writes the doc to disk via the Control API, then **skips the Supabase upsert** because `diskHandled` is `true`. The UI immediately re-queries Supabase for the doc status, finds no agent-specific row, and shows "Inherited" again.

The same pattern exists in `createDocOverride` (AI regeneration) -- it also skips Supabase when the Control API succeeds.

## Root Cause

In `src/lib/api.ts`, line 1424:

```
const diskHandled = await trySyncToControlApi(agentKey, docType, content);
if (!diskHandled) {
  // Only writes to Supabase if disk write failed
}
```

The disk write is correct (executor needs the file), but the Supabase write must also happen so the dashboard can immediately reflect the override status.

## Fix

Change `createSingleDocOverride` to **always** upsert the Supabase row, regardless of whether the Control API write succeeded. The disk write remains best-effort for executor immediacy; the Supabase write is the source of truth for the dashboard.

Apply the same fix to the loop in `createDocOverride` (the AI regeneration path), which has the same skip pattern.

## Technical Details

### `src/lib/api.ts` -- `createSingleDocOverride` (lines 1422-1437)

Change from:
```
const diskHandled = await trySyncToControlApi(agentKey, docType, content);
if (!diskHandled) {
  // upsert to Supabase
}
```

To:
```
// Best-effort: sync to disk for executor
await trySyncToControlApi(agentKey, docType, content);

// Always write to Supabase so dashboard reflects the override immediately
const { error } = await supabase.from('brain_docs').upsert(...);
if (error) throw error;
```

### `src/lib/api.ts` -- `createDocOverride` loop (lines 1369-1380)

Same pattern fix: always upsert to Supabase after the disk write attempt.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/api.ts` | Remove the `if (!diskHandled)` guard in both `createSingleDocOverride` and `createDocOverride`, so Supabase upsert always runs |

### Verification
1. Click "Create override" for Ricky's Soul doc
2. UI immediately shows "Override" badge (not "Inherited")
3. Supabase `brain_docs` table has a row with `agent_key = 'agent:ricky:main'` and `doc_type = 'soul'`
4. The Soul editor loads the agent-specific content

