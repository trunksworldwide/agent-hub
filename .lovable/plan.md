

# Auto-refresh Brain Doc Editors via Supabase Realtime

## The Problem

The sync pipeline works: local file edit -> brain-doc-sync -> Supabase row updated. But the dashboard editors (Soul, User, Memory) only fetch data once on mount. They never listen for updates. So when your bot edits SOUL.md on the Mac mini, the dashboard stays stale until you manually click "Reload."

## The Fix

Subscribe to Supabase Realtime changes on the `brain_docs` table. When a row updates, automatically refresh the editor content -- but only if the user hasn't made unsaved edits (to avoid clobbering their work).

## What Changes

### 1. New hook: `src/hooks/useBrainDocSubscription.ts`

A reusable hook that:
- Subscribes to Realtime `UPDATE` events on `brain_docs` filtered by `project_id` and `doc_type`
- When a change arrives:
  - If the editor has NO unsaved changes (not dirty): silently update the content
  - If the editor HAS unsaved changes: show a subtle toast "Remote update available" with a "Reload" action button (don't overwrite their work)
- Cleans up the subscription on unmount

### 2. Update `SoulEditor.tsx`

- Import and use the new hook
- Pass in the file key, doc_type, and dirty state
- The hook handles the rest

### 3. Update `UserEditor.tsx`

- Same pattern as SoulEditor

### 4. Update `MemoryEditor.tsx`

- Same pattern for both `memory_long` and `memory_today` tabs

### 5. Update `changes.md`

## Technical Detail

The hook implementation:

```
useBrainDocSubscription({
  projectId,
  docType: 'soul',       // or 'user', 'memory_long', 'memory_today'
  fileKey,
  isDirty: fileState?.isDirty ?? false,
  onUpdate: (newContent) => setFileOriginal(fileKey, newContent),
})
```

Inside the hook:
- Uses `supabase.channel()` to subscribe to `postgres_changes` on `brain_docs`
- Filters by `project_id` and matches on `doc_type` from the payload
- Checks `agent_key` is NULL (global docs) or matches the current agent
- If not dirty: calls `onUpdate(payload.new.content)` which resets the editor
- If dirty: fires a toast with "Remote changes available -- click Reload to update"
- Returns a cleanup function that removes the channel

This means: your bot edits SOUL.md -> brain-doc-sync pushes to Supabase -> Realtime fires -> dashboard editor updates instantly. No manual reload needed, ever.

### Files to create/modify

| File | Change |
|------|--------|
| `src/hooks/useBrainDocSubscription.ts` | New hook for Realtime subscription |
| `src/components/agent-tabs/SoulEditor.tsx` | Add realtime subscription |
| `src/components/agent-tabs/UserEditor.tsx` | Add realtime subscription |
| `src/components/agent-tabs/MemoryEditor.tsx` | Add realtime subscription |
| `changes.md` | Log the change |

