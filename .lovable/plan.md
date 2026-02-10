

# Fix Memory Editor + Add Daily Memory Sync + QMD Awareness

## What's Actually Wrong

Two separate issues, both now confirmed by looking at the database and sync scripts:

### 1. Long-term memory (MEMORY.md) is blank because the file is blank
The `brain_docs` row for `memory_long` exists (with `agent_key = NULL`) but has **0 bytes of content**. Your Mac mini's `MEMORY.md` file is genuinely empty. The dashboard is correctly showing "nothing" -- it's not a sync bug.

### 2. Today's memory has NO sync path at all
The `brain-doc-sync.mjs` script only syncs 4 files: `SOUL.md`, `AGENTS.md`, `USER.md`, `MEMORY.md`. Daily memory files (`memory/YYYY-MM-DD.md`) are **never pushed to Supabase**. There's no row for `memory_today` in the database. The Memory editor's "Today" tab will always be blank in the current architecture.

## Plan

### Part A: Add daily memory sync to `brain-doc-sync.mjs`

Extend the sync script to also sync today's memory file:

- Add `memory_today` to the DOCS list, pointing to `memory/YYYY-MM-DD.md` (using today's date)
- The date-based path needs to recalculate on each poll cycle (midnight rollover)
- Upsert to `brain_docs` with `doc_type = 'memory_today'` and `agent_key = NULL`
- This means the Memory editor's "Today" tab will finally show real content

### Part B: Empty state UX for long-term memory

When `memory_long` content is empty/whitespace, show:

- A friendly "Long-term memory is empty" message (not a blank editor that looks broken)
- A "Seed template" button that inserts a starter template into the editor (marks buffer dirty, user still has to Save)
- The template will have sections like `# Key Facts`, `# Important Dates`, `# Recurring Themes`

### Part C: Wire up "Promote to Long-term" button

Currently the button exists but does nothing. Make it:

1. Take the entire Today content (or selected text if we can get a selection ref -- textarea selection is straightforward)
2. Append it to the Long-term buffer with a date header (`## Promoted from YYYY-MM-DD`)
3. Mark both buffers dirty so the user can review and Save

### Part D: QMD awareness in Config/Health panel (informational only)

Add a small "Memory Backend" section in the HealthPanel or ConfigPage that:

- Shows current backend (default: "sqlite")
- If QMD is configured, shows "qmd"
- A note explaining: "This affects how the agent searches memory, not what's stored"
- This reads from a new optional Control API endpoint `GET /api/memory/status` -- if the endpoint doesn't exist yet on your Mac mini, the UI gracefully shows "Unknown" with guidance

This is informational only. No toggle to switch backends from the UI (that's a later feature).

## Technical Details

### Files to modify

| File | Change |
|------|--------|
| `scripts/brain-doc-sync.mjs` | Add `memory_today` sync with date-rolling logic |
| `src/components/agent-tabs/MemoryEditor.tsx` | Empty state UX, seed template, promote button, textarea ref for selection |
| `src/components/settings/HealthPanel.tsx` | Add memory backend status section |
| `src/lib/api.ts` | Add `getMemoryBackendStatus()` function (calls Control API, graceful fallback) |
| `server/index.mjs` | Add `GET /api/memory/status` endpoint that reads OpenClaw config |
| `changes.md` | Document all changes |

### brain-doc-sync.mjs changes

The daily memory file path changes every day. Instead of a static DOCS array entry, use a function:

```text
function getTodayMemoryPath() {
  const today = new Date().toISOString().slice(0, 10);
  return join(WORKSPACE, 'memory', `${today}.md`);
}
```

On each poll cycle, recalculate the path and sync. The `doc_type` stays `memory_today` with `agent_key = NULL`. Previous days' files are not synced (they become part of long-term memory or are searchable via QMD).

### MemoryEditor.tsx changes

- Add a `textareaRef` for the Today tab to support text selection for Promote
- Empty state component when `content.trim() === ''` on the Long-term tab
- Seed template button inserts content via `setFileContent(longKey, TEMPLATE)`
- Promote button: reads Today content, appends to Long-term with date header

### server/index.mjs - new endpoint

```text
GET /api/memory/status

Response:
{
  backend: "sqlite" | "qmd",
  qmdConfigured: boolean,
  qmdCliFound: boolean
}
```

Reads from `~/.openclaw/openclaw.json` if it exists, checks `which qmd` for CLI availability.

### HealthPanel.tsx addition

A small card/section below the existing connectivity panel showing:
- Memory backend: sqlite/qmd/unknown
- QMD installed: yes/no/unknown
- Explanatory text about what this means

