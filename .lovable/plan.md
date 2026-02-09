

# Fix: Skills and Channels Should Fall Back to Supabase

## Problem

`getSkills()` and `getChannels()` in `src/lib/api.ts` only fetch from the Control API. If the Control API URL is not set or the call fails, they return an empty array -- resulting in the "not configured" empty state on the Settings page.

There is no Supabase fallback, unlike cron jobs which read from `cron_mirror`.

## Solution

Follow the established Mirror pattern: create `skills_mirror` and `channels_mirror` Supabase tables, and update the API functions to fall back to Supabase when the Control API is unavailable or fails.

---

## Part 1: Supabase Mirror Tables

### Table: `skills_mirror`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| project_id | text | not null |
| skill_id | text | not null (executor-side ID) |
| name | text | not null |
| description | text | default '' |
| version | text | default '' |
| installed | boolean | default false |
| last_updated | text | default '' |
| synced_at | timestamptz | default now() |

Unique constraint on (project_id, skill_id). RLS enabled with read policy for authenticated users.

### Table: `channels_mirror`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| project_id | text | not null |
| channel_id | text | not null (executor-side ID) |
| name | text | not null |
| type | text | default '' |
| status | text | default 'disconnected' |
| last_activity | text | default '' |
| synced_at | timestamptz | default now() |

Unique constraint on (project_id, channel_id). RLS enabled with read policy for authenticated users.

---

## Part 2: API Functions Update

### File: `src/lib/api.ts`

**`getSkills()` (~line 1007)**

Change from:
```
if (base) { try fetch from API, catch return [] }
return []
```

To:
```
if (base) { try fetch from API, catch fall through }
// Fallback: read from skills_mirror in Supabase
```

Add a new `getSkillsMirror()` helper that reads from `skills_mirror` table filtered by project_id, mapping rows to the existing `Skill` type.

**`getChannels()` (~line 1970)**

Same pattern -- try Control API first, fall back to `channels_mirror` table.

Add a new `getChannelsMirror()` helper that reads from `channels_mirror` filtered by project_id, mapping rows to the existing `Channel` type.

---

## Part 3: No Page Changes Needed

`SkillsPage.tsx` and `ChannelsPage.tsx` already call `getSkills()` / `getChannels()` and render whatever is returned. Once the API functions have a Supabase fallback, the pages will automatically show data when it exists in the mirror tables.

---

## File Summary

| File | Action |
|------|--------|
| Supabase migration | Create `skills_mirror` and `channels_mirror` tables with RLS |
| `src/lib/api.ts` | Edit `getSkills()` and `getChannels()` to fall back to Supabase mirror tables |
| `changes.md` | Log the change |

## What This Does NOT Change

- Control API fetch logic (still tries direct API first when available)
- Page components (no UI changes needed)
- Executor scripts (mirror sync is handled by the Mac mini cron scripts)
- Other tables or existing mirror patterns

## Note

The mirror tables will need to be populated by the executor's sync scripts (similar to how `cron_mirror` is synced by `scripts/cron-mirror.mjs`). Until those scripts are updated, the tables will be empty -- but the pages will at least show the "no data" state rather than implying a connectivity problem.

