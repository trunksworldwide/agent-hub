# changes.md

### Agents page: show agent_status presence in agent header
- Agent detail header now surfaces Supabase-backed presence fields: `state`, “Seen …” relative timestamp, and an optional status note.
- Includes a tooltip with the raw last heartbeat/activity timestamp when available.

### Activity feed: server now merges Supabase activities + git commits
- `GET /api/activity` now best-effort fetches recent rows from Supabase `activities` for the selected project and merges them with recent brain-repo git commits.
- This makes the Dashboard “Live Feed” work even when the browser doesn’t have Supabase keys configured.

### Dashboard feed: click activity to open agent profile
- Dashboard live feed items now parse the activity `author` field (e.g. `agent:main:main`) and, when an agent match exists, clicking the feed entry opens that agent’s AgentProfilePanel.
- Makes the feed feel like a real “activity inbox” instead of a dead list.

### Build: avoid Rollup empty chunk warnings (detect-node-es)
- Updated Vite manualChunks logic to *not* force fully tree-shaken packages (like `detect-node-es`) into their own chunk.
  - Prevents Rollup from emitting “Generated an empty chunk” warnings during production builds.

### AgentProfilePanel: “Send message” logs to activity feed
- Wired the AgentProfilePanel message box to `createActivity(type=session)` so sending a note shows up in the Live Feed.
- Uses Supabase directly when configured, and falls back to the Control API endpoint (`POST /api/activity`).

### Projects: add `tag` (system highlighting) to Supabase-backed project list
- Added a `projects.tag` column (migration) so the UI can consistently highlight special/system projects like Front Office.
- Server `/api/projects` creation now upserts `tag` into Supabase (best-effort).
- Client `getProjects()` now selects + returns `tag` (with a fallback for `front-office`).
