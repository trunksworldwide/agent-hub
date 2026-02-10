

# Fix Memory + Improve Daily Memory Storage + QMD Clarification

## What's happening now (confirmed by database query)

| doc_type | agent_key | content_len | status |
|----------|-----------|-------------|--------|
| soul | NULL | 1,467 | Working |
| user | NULL | 635 | Working |
| agents | NULL | 7,768 | Working |
| memory_long | NULL | **0** | Empty file on Mac mini |
| memory_today | -- | **no row** | Never synced yet |

- **memory_long is blank** because `MEMORY.md` on the Mac mini is genuinely 0 bytes. Not a bug -- the file is empty.
- **memory_today has no row** because the sync script needs to be restarted on the Mac mini after the code update (or hasn't run yet with the new `memory_today` entry).
- **QMD shows "No"** because QMD is not installed on your Mac mini. That's an accurate reading, not a bug. Once you install QMD (`npm i -g qmd` or however OpenClaw distributes it), it will show "Yes".

## Changes to make

### 1. Store daily memory as date-stamped entries (address overwrite concern)

Your bot is right: a single `memory_today` row will lose yesterday's data at midnight. Change the approach:

- **doc_type**: Keep `memory_today` as the "latest/current day" rolling entry (for the editor to bind to)
- **Add archival**: When the date rolls over during sync, before overwriting `memory_today`, copy the previous day's content to a new row with `doc_type = 'memory_day'` and store the date in a simple prefix in the content (e.g., first line `<!-- date: 2026-02-09 -->`)
- This keeps the `brain_docs` schema unchanged -- no new columns needed

**In `brain-doc-sync.mjs`**: Track the last-synced date. When date changes, archive the old `memory_today` content as a `memory_day` row before overwriting.

### 2. MemoryEditor improvements (already partially done)

The empty state and seed template are already implemented from the last round. Verify they work:

- Empty long-term shows "Long-term memory is empty" + "Seed template" button (already in code)
- Promote button already works (appends selection or full content with date header)

No new UI changes needed -- these were shipped in the last update.

### 3. No changes needed for QMD display

The endpoint correctly checks `command -v qmd` and reads `~/.openclaw/openclaw.json`. It shows "No" because QMD isn't installed. This is accurate behavior, not a bug. No code change needed.

### 4. Restart `brain-doc-sync` on Mac mini

The `memory_today` sync path exists in the code but the script needs to be restarted to pick up the changes. After restarting, it will:
- Read `memory/2026-02-10.md` from disk
- Upsert it to `brain_docs` as `doc_type = 'memory_today'`, `agent_key = NULL`
- The Memory editor's Today tab will then show content

## Technical details

### brain-doc-sync.mjs -- date rollover archival

```text
// Before overwriting memory_today, check if the date changed
// If so, archive the old content as memory_day

let lastSyncedDate = null;

// In the poll loop:
const today = new Date().toISOString().slice(0, 10);
if (lastSyncedDate && lastSyncedDate !== today) {
  // Archive yesterday's memory_today content
  const oldContent = await getRemoteDoc('memory_today');
  if (oldContent?.content?.trim()) {
    await sb.from('brain_docs').insert({
      project_id: PROJECT_ID,
      agent_key: null,
      doc_type: 'memory_day',
      content: `<!-- date: ${lastSyncedDate} -->\n${oldContent.content}`,
      updated_by: 'archive_rollover',
    });
  }
}
lastSyncedDate = today;
```

### Files to modify

| File | Change |
|------|--------|
| `scripts/brain-doc-sync.mjs` | Add date rollover archival for daily memory |
| `changes.md` | Log the change |

### What does NOT change
- MemoryEditor.tsx -- empty state and promote already work
- HealthPanel.tsx -- QMD display is correct
- server/index.mjs -- memory/status endpoint is correct
- No schema changes needed

## Action items for you (on Mac mini)
1. Restart `brain-doc-sync.mjs` so it picks up the `memory_today` sync
2. Optionally seed `MEMORY.md` with some content (or use the "Seed template" button in the dashboard)
3. Install QMD when ready -- the dashboard will automatically detect it

