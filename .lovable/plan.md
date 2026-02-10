

# Persist Control API URL in Supabase

## What this solves
Right now, the Control API URL only lives in `localStorage`. When you open a new browser, incognito window, or clear your cache, it's gone and you have to paste it again. This change stores it in Supabase so it persists across all sessions and devices.

## Approach

### Step 1: Create a `project_settings` table in Supabase

A simple key-value settings table scoped to projects:

- `id` (uuid, PK, default `gen_random_uuid()`)
- `project_id` (text, not null)
- `key` (text, not null)
- `value` (text, not null)
- `updated_at` (timestamptz, default `now()`)
- Unique constraint on `(project_id, key)`

RLS: open read/write for anon (matching existing patterns in the project).

### Step 2: Update `src/lib/control-api.ts`

Add two new functions:
- `fetchControlApiUrlFromSupabase(projectId)` -- reads the `control_api_base_url` setting
- `saveControlApiUrlToSupabase(projectId, url)` -- upserts the setting

The priority chain stays: **localStorage -> Supabase -> env var -> empty string**

### Step 3: Update the Zustand store (`src/lib/store.ts`)

- Add an `initControlApiUrl()` async action that:
  1. Checks localStorage (instant)
  2. If empty, fetches from Supabase
  3. If found in Supabase, sets it in both the store and localStorage (for next instant load)
  4. Falls back to env var

### Step 4: Call `initControlApiUrl()` on app startup

Add a small `useEffect` in `AppShell` (or a dedicated hook) that calls this once on mount with the current `selectedProjectId`.

### Step 5: Update the HealthPanel save flow

When the user clicks **Save**:
- Write to localStorage (instant, existing behavior)
- Also upsert to Supabase `project_settings` (so it persists everywhere)

When the user clicks **Clear**:
- Remove from localStorage
- Delete/clear the Supabase setting
- Fall back to env var

### Step 6: Update `changes.md`

## Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/` (new) | Create `project_settings` table |
| `src/lib/control-api.ts` | Add Supabase read/write functions |
| `src/lib/store.ts` | Add `initControlApiUrl` action |
| `src/components/layout/AppShell.tsx` | Call init on mount |
| `src/components/settings/HealthPanel.tsx` | Save/Clear also write to Supabase |
| `changes.md` | Log the change |

## Startup flow

```text
App loads
  -> localStorage has URL? -> use it (instant)
  -> no? -> fetch from Supabase project_settings
     -> found? -> use it + cache to localStorage
     -> not found? -> use VITE_API_BASE_URL or empty
```

## What stays the same
- The existing `getControlApiUrl()` / `setControlApiUrl()` localStorage functions still work as a fast cache
- The store shape doesn't change -- `controlApiUrl` is still a string
- The HealthPanel UI looks the same (URL input, Test, Save, Clear)
- No breaking changes to any other components that read `controlApiUrl` from the store

