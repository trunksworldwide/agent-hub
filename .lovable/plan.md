

# Lean & Smart Context Packs: Pinning UI + Per-Task Retrieval + Hard Caps

## What already exists (no changes needed)

- `project_documents.pinned` column exists
- `updateDocument()` in `api.ts` already supports `{ pinned: true/false }`
- `getDocuments()` already sorts pinned docs first
- Edge function (`get-context-pack`) already fetches pinned docs and does per-task knowledge retrieval via `knowledge-worker`
- DocumentList already shows a Pin icon indicator on pinned docs

## What to build

### 1. Pin/Unpin toggle in DocumentList

**File: `src/components/documents/DocumentList.tsx`**

- Replace the static Pin icon indicator with a clickable pin/unpin button per document
- On click: call `updateDocument(doc.id, { pinned: !doc.pinned })` and trigger `onReload()`
- Show a filled pin icon when pinned, outline when not
- Show toast on toggle ("Pinned" / "Unpinned")
- Add `onTogglePin` callback prop, or handle inline using the existing `updateDocument` import

### 2. "Pinned" badge and sort order

**File: `src/components/documents/DocumentList.tsx`**

- Show a "Pinned" badge on pinned docs (already partially there with the Pin icon; upgrade to a visible Badge)
- Documents are already sorted pinned-first from the API query -- no change needed

### 3. Hard character caps on Context Pack sections

**File: `supabase/functions/get-context-pack/index.ts`**

Add constants and enforcement:

```
MAX_PINNED_CHARS = 8000    (total chars across all pinned doc notes)
MAX_KNOWLEDGE_CHARS = 6000 (total chars across retrieved chunks)
MAX_PINNED_DOCS = 5        (reduce from current 10)
MAX_KNOWLEDGE_RESULTS = 5  (increase from current 3)
```

In `fetchPinnedDocs`: accumulate character count across docs, stop adding when limit reached. Append "(truncated -- N more pinned docs not shown)" if any were dropped.

In `fetchRelevantKnowledge`: truncate individual chunks if needed and enforce total char cap.

**File: `src/lib/context-pack.ts`**

Mirror the same caps and truncation logic for the client-side builder.

### 4. Per-task knowledge retrieval in client-side builder

**File: `src/lib/context-pack.ts`**

The edge function already does per-task retrieval, but the client-side `buildContextPack()` does not. Add:

- A `relevantKnowledge` field to the client-side `ContextPack` interface (already exists in the edge function version)
- When `taskId` is provided, fetch task context, build a search query from it, and call the knowledge-worker edge function (same pattern as edge function)
- Include results in `renderContextPackAsMarkdown` under "## Relevant Knowledge"

### 5. Markdown renderer section ordering

**Files: both `src/lib/context-pack.ts` and `supabase/functions/get-context-pack/index.ts`**

Ensure consistent section order:
1. Mission
2. Project Overview
3. Pinned Knowledge (global + agent, with char caps)
4. Task Context (if present)
5. Relevant Knowledge (per-task retrieved snippets, if present)
6. Recent Changes

### 6. Documentation

**File: `changes.md`**

Log: pin toggle UI, hard caps on context pack, per-task retrieval in client builder.

## Files changed summary

| File | Change |
|------|--------|
| `src/components/documents/DocumentList.tsx` | Add pin/unpin toggle button, "Pinned" badge |
| `supabase/functions/get-context-pack/index.ts` | Hard char caps, reduce MAX_PINNED_DOCS to 5, increase MAX_KNOWLEDGE_RESULTS to 5 |
| `src/lib/context-pack.ts` | Add per-task knowledge retrieval, hard char caps, `relevantKnowledge` field |
| `changes.md` | Document changes |

## What this does NOT do

- No new tables or columns
- No new API endpoints (pin uses existing `updateDocument`)
- No Knowledge page redesign
- No new dependencies

