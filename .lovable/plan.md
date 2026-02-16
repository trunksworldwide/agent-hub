

# Add Mission to Context Pack

## Problem

The Context Pack builders (both the client-side `src/lib/context-pack.ts` and the edge function `supabase/functions/get-context-pack/index.ts`) only fetch `project_overview` from `brain_docs`. The `mission` doc_type was added later and never wired into the pack. The UI helper text on the Mission card already says it's included, which is currently a lie.

## Fix (4 files, minimal diffs)

### 1. Edge function: `supabase/functions/get-context-pack/index.ts`

- Add `mission` field to the `ContextPack` interface (type `string`)
- Add a `fetchMission()` function (same pattern as `fetchProjectOverview`, querying `doc_type = 'mission'`, `agent_key IS NULL`)
- Call it in the parallel `Promise.all` block
- Include it in the returned `contextPack` object
- In `renderContextPackAsMarkdown`: add a `## Mission` section right before `## Project Overview` (only if mission is not empty/placeholder)

### 2. Client-side builder: `src/lib/context-pack.ts`

- Add `mission` field to the `ContextPack` interface
- Add a `fetchMission()` function (same query pattern)
- Call it in the `Promise.all` block inside `buildContextPack`
- Include in the returned object and error fallback
- In `renderContextPackAsMarkdown`: add `## Mission` section before `## Project Overview`

### 3. UI helper text: `src/components/documents/ProjectOverviewCard.tsx`

- Mission card empty-state text already says "This is included in every agent's Context Pack" -- this will now be true, no change needed there.
- Mission card display state: no change needed.
- Both cards are already consistent. No UI text changes required.

### 4. Documentation: `changes.md`

- Log the change.

## Technical details

| File | Change |
|------|--------|
| `supabase/functions/get-context-pack/index.ts` | Add `fetchMission`, wire into pack + markdown renderer |
| `src/lib/context-pack.ts` | Add `fetchMission`, wire into pack + markdown renderer |
| `changes.md` | Log the change |

No schema changes. No new dependencies. No UI changes (the UI text is already correct -- it just needed the backend to match).

