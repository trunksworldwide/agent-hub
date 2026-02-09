

# Fix: Skills and Channels Server Endpoints (OpenClaw-Native)

## Problem

The dashboard shows "online" but Skills and Channels are empty. This is a server-side issue in `server/index.mjs`:

1. `/api/skills` returns `[]` when `EXECUTOR_SKILLS_DIR` is not set (line 586)
2. `/api/channels` endpoint doesn't exist at all -- returns 404

The UI-side Supabase fallback we added works, but the mirror tables are also empty because nothing populates them. The real fix is making the server endpoints return actual data.

## Solution

### 1. Update `/api/skills` -- use OpenClaw CLI (lines 582-613)

Replace the directory-scan-only approach with a CLI-first strategy:

- **Primary**: Call `execExecutor('skills list --json')` and parse the result
- **Fallback 1**: Scan `EXECUTOR_SKILLS_DIR` if set (existing logic)
- **Fallback 2**: Try common default paths (`/opt/homebrew/lib/node_modules/openclaw/skills`, `/opt/homebrew/lib/node_modules/clawdbot/skills`)
- Only return `[]` if all strategies fail

This works out of the box without any env var configuration.

### 2. Add `GET /api/channels` (new route, after skills)

Read channel config from `~/.openclaw/openclaw.json`:

- Parse `config.channels` map
- Normalize each entry into: `{ id, name, type, enabled, status, lastActivity }` plus any useful fields like `dmPolicy`, `groupPolicy`, `includeAttachments`, `mediaMaxMb`
- If file missing or parse fails, return `[]` (not 404)

Insert the new route after the `/api/skills` block (after line 613).

### 3. Mirror sync on fetch

After both endpoints return data, upsert results into `skills_mirror` and `channels_mirror` (best-effort, non-blocking) so the Supabase fallback stays populated for when the executor is offline.

## Technical Details

### File: `server/index.mjs`

**`/api/skills` (lines 582-613) -- replace entirely:**

```javascript
if (req.method === 'GET' && url.pathname === '/api/skills') {
  try {
    let skills = [];

    // Strategy 1: OpenClaw CLI
    try {
      const { stdout } = await execExecutor('skills list --json');
      const parsed = JSON.parse(stdout || '{}');
      const list = parsed.skills || (Array.isArray(parsed) ? parsed : []);
      if (list.length > 0) {
        skills = list.map(s => ({
          id: s.name || s.id,
          name: s.name || s.id,
          slug: s.slug || s.name || s.id,
          description: s.description || '',
          version: s.version || 'installed',
          installed: true,
          lastUpdated: s.lastUpdated || new Date().toISOString(),
        }));
      }
    } catch { /* CLI doesn't support skills list, fall through */ }

    // Strategy 2: Directory scan
    if (skills.length === 0) {
      const dirs = [
        process.env.EXECUTOR_SKILLS_DIR,
        '/opt/homebrew/lib/node_modules/openclaw/skills',
        '/opt/homebrew/lib/node_modules/clawdbot/skills',
      ].filter(Boolean);

      for (const skillsDir of dirs) {
        // ... existing directory scan logic (read SKILL.md files) ...
        if (skills.length > 0) break;
      }
    }

    // Best-effort: sync to Supabase mirror
    syncSkillsMirror(projectId, skills);

    return sendJson(res, 200, skills);
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
}
```

**New `/api/channels` route (insert after skills block):**

```javascript
if (req.method === 'GET' && url.pathname === '/api/channels') {
  try {
    let channels = [];
    const configPath = path.join(
      process.env.HOME || '/root',
      '.openclaw',
      'openclaw.json'
    );
    const st = await safeStat(configPath);
    if (st) {
      const raw = await readFile(configPath, 'utf8');
      const config = JSON.parse(raw);
      const channelsMap = config.channels || {};
      channels = Object.entries(channelsMap).map(([id, cfg]) => ({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        type: 'messaging',
        enabled: cfg.enabled !== false,
        status: cfg.enabled !== false ? 'connected' : 'disconnected',
        lastActivity: '',
        includeAttachments: cfg.includeAttachments || false,
        mediaMaxMb: cfg.mediaMaxMb || null,
        dmPolicy: cfg.dmPolicy || null,
        groupPolicy: cfg.groupPolicy || null,
      }));
    }

    // Best-effort: sync to Supabase mirror
    syncChannelsMirror(projectId, channels);

    return sendJson(res, 200, channels);
  } catch (err) {
    return sendJson(res, 200, []); // Graceful empty on error
  }
}
```

**New mirror sync helpers (add near top, after existing Supabase helpers):**

- `syncSkillsMirror(projectId, skills)` -- upserts into `skills_mirror`, throttled
- `syncChannelsMirror(projectId, channels)` -- upserts into `channels_mirror`, throttled

Both use the existing `getSupabase()` client and are fire-and-forget (non-blocking, error-swallowing).

### File: `changes.md`

Log the changes.

## File Summary

| File | Action |
|------|--------|
| `server/index.mjs` | Replace skills endpoint with CLI-first strategy, add channels endpoint, add mirror sync helpers |
| `changes.md` | Log changes |

## What This Does NOT Change

- UI components (no page changes)
- Supabase tables (already created)
- `src/lib/api.ts` (fallback logic already in place)
- Other server endpoints

