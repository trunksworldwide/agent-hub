

# Preview Context Pack + Size Budgeting + Exclusion Transparency

## Overview

Add a "Preview Context Pack" button to the Knowledge page that lets operators see exactly what an agent will receive, including which documents were included, which were excluded (and why), and character counts per section.

## What to build

### 1. New component: ContextPackPreviewDialog

**File: `src/components/documents/ContextPackPreviewDialog.tsx`**

A Dialog with:
- **Agent selector**: dropdown populated from the agents list (required)
- **Task selector**: dropdown populated from tasks list, plus a "No task" option (optional)
- **"Generate Preview" button**: calls `buildContextPack()` with selected agent + task
- **Results display** (after generation):
  - Section-by-section breakdown showing:
    - Section name (Mission, Overview, Pinned Knowledge, Your Knowledge, Task Context, Relevant Knowledge, Recent Changes)
    - Character count per section with a colored bar (green/yellow/red based on budget usage)
    - Hard cap shown next to count (e.g., "2,341 / 8,000 chars")
  - **Included items**: list of pinned doc titles that made it in
  - **Excluded items**: if any docs were dropped due to caps, list them under "Excluded (over budget)" with just titles
  - **Full markdown preview**: collapsible, showing the exact rendered markdown (scrollable, mono font)
- Loading state while generating

### 2. Enhanced buildContextPack to return metadata

**File: `src/lib/context-pack.ts`**

Extend `ContextPack` interface with optional metadata:
```
excludedDocs?: { title: string; reason: string }[];
sectionSizes?: Record<string, number>;
```

Update `fetchPinnedDocs` to track and return excluded doc titles (currently it just increments a `dropped` counter and logs a warning -- upgrade to return the titles).

Add a helper `computeSectionSizes(pack)` that calculates character counts for each section of the rendered markdown.

### 3. Wire into DocumentsPage

**File: `src/components/pages/DocumentsPage.tsx`**

- Add a "Preview Context Pack" button next to the existing header buttons (between Refresh and Add Document)
- Opens the ContextPackPreviewDialog
- Pass `agents` and a lazy-loaded tasks list

### 4. Documentation

**File: `changes.md`**

Log the new preview feature.

## Technical details

### Section size budgets (display only, enforcement already exists)

| Section | Hard Cap | Source |
|---------|----------|--------|
| Mission | No cap (typically short) | brain_docs |
| Project Overview | No cap (typically short) | brain_docs |
| Pinned Knowledge (Global) | 8,000 chars / 5 docs | project_documents |
| Your Knowledge (Agent) | 8,000 chars / 5 docs | project_documents |
| Task Context | No cap (bounded by task data) | tasks + task_comments |
| Relevant Knowledge | 6,000 chars / 5 chunks | knowledge-worker |
| Recent Changes | 20 activities max | activities |

### Excluded docs tracking

`fetchPinnedDocs` currently does:
```typescript
if (totalChars + docChars > MAX_PINNED_CHARS && results.length > 0) {
  dropped++;
  continue;
}
```

Change to also collect `{ title: d.title, reason: 'Over character budget' }` into an array returned alongside the docs. This requires changing the return type to `{ docs: DocReference[], excluded: ExcludedDoc[] }` and updating callers.

### Files changed

| File | Change |
|------|--------|
| `src/components/documents/ContextPackPreviewDialog.tsx` | New component: agent/task selectors, preview display, section sizes, exclusions |
| `src/lib/context-pack.ts` | Add `excludedDocs` + `sectionSizes` to ContextPack, return excluded doc titles from fetchPinnedDocs, add `computeSectionSizes()` |
| `src/components/pages/DocumentsPage.tsx` | Add "Preview Context Pack" button, wire dialog |
| `changes.md` | Document the feature |

### What this does NOT include (deferred)

- Pin priority / ordering (item 3 from the request) -- can be added later as a separate feature with a `pin_priority` column
- No new DB columns or tables
- No edge function changes (preview uses the client-side builder only)

