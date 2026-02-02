### Build: remove TopBar dynamic import warning
- TopBar now imports `createProject()` statically instead of via `await import()`.
  - Fixes Vite warning about `src/lib/api.ts` being both dynamically and statically imported (and keeps chunking predictable).

### Agents sidebar: manual refresh + "updated" timestamp
- Agents sidebar now shows how recently the roster was refreshed and provides a one-click refresh button (with spinner), matching the Live Feed UX.

### Dashboard: presence keepalive (agent_status)
- Dashboard now pings `/api/status` every 60s while open (best effort).
  - This keeps Supabase `agent_status` fresh (server-side upsert happens on `/api/status`) so agents don’t drift offline when the UI is idle.

### Server: Supabase service-role support + presence heartbeat
- `server/index.mjs` now prefers `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) when present.
  - This fixes server-side inserts/upserts that were blocked by RLS when only anon keys were available.
- `/api/status` now best-effort upserts `agent_status` for the main agent (`agent:main:main`) so presence stays fresh.

### Projects dropdown (workspace selector)
- Added `projects.json` and a Project selector in the top bar.
- Control API now supports scoping by project via `x-clawdos-project` header.
- UI stores the selected project in localStorage (key: `clawdos.project`).

### Dashboard restored to a task manager
- Dashboard is now a task board again (Kanban) backed by `memory/tasks.json` in the selected project workspace.
- Added basic Create Task and Move Task actions.
- Sessions are no longer the primary dashboard object (they were confusing in the UI).

### Supabase integration (start)
- Added `@supabase/supabase-js` and `src/lib/supabase.ts`.
- `getProjects()`, `getAgents()`, and task APIs now prefer Supabase tables when Supabase env vars are present.
- Mock data now requires explicit `VITE_ALLOW_MOCKS=true` in dev to prevent ghost agents.
- Added `scripts/supabase-admin.mjs` to seed/repair DB state (projects + agents).
- Activity feed:
  - `getActivity()` now prefers Supabase `activities`.
  - Task create/move now writes activity rows (best effort).

### Supabase admin script can now log activities + agent presence
- `scripts/supabase-admin.mjs` accepts `--activity "..."` to insert an `activities` row.
- Supports `--type` (default `build_update`) and `--actor` (default `agent:main:main`).
- Now also supports `--status` / `--heartbeat` to upsert `agent_status` (presence), with `--state`, `--note`, and `--agent-key`.
- Intended for quickly recording build updates and keeping agent presence fresh while wiring is in progress.
- Also loads `.env.local` (in addition to `.env`) so service role keys don’t have to live in `.env`.

### Cron: enable/disable wired (Control API)
- Added `POST /api/cron/:id/toggle` (plus `/enable` and `/disable`) to the Control API.
- `toggleCronJob()` now hits the Control API so the Cron UI switch actually enables/disables real jobs.

### Bidirectional brain docs (Supabase + Mac mini sync)
- Added Supabase `brain_docs` table (project_id + doc_type + content + updated_at + updated_by) and dev RLS policies.
- Frontend SOUL/USER/MEMORY editors now read/write via Supabase `brain_docs` when Supabase is configured.
- Added `scripts/brain-doc-sync.mjs` (Mac mini) to keep workspace files in lockstep:
  - seeds missing docs from local files
  - subscribes to Supabase realtime changes and writes to local files
  - watches local files and upserts back to Supabase
  - git-commits synced file changes (best effort)
- Installed always-on launchd service:
  - `~/Library/LaunchAgents/com.trunks.clawdos.brain-doc-sync.plist`
  - log: `~/Library/Logs/clawdos-brain-doc-sync.log`
  - docs: `docs/OPERATIONS.md`

### New project scaffolding (v1)
- Control API can now create a new workspace on disk under `/Users/trunks/clawd-projects/<projectId>` and register it.
- Top bar now includes a “+” button to create a new project (id + name).

## Next planned work
- New agent button per project (roster + agent_status + later cron heartbeat).
- Agents sidebar alignment:
  - Treat agents as session keys (per the Mission Control article).
  - Show “Runs” separately (cron wakeups, isolated runs).
- UI: display commit hash returned on save + add diff/rollback UI.
- Cron: edit endpoints + UI (schedule/instructions) + run history status.
- Add safer “reload” behaviors (lightweight reload vs full gateway restart) with guardrails.
- UI polish: animations, empty states, error states, realtime updates.
- Remote access path (Tailscale/Cloudflare) + authentication.

### Agent presence (Supabase agent_status)
- `getAgents()` now merges `agents` + `agent_status` (when Supabase is configured).
- Dashboard status is derived from `agent_status.state` + recency of `last_activity_at` (online/idle/offline) with `working → running`.
- Agent profile panel now shows the real `agent_status.note` (when present) and a rough "since" based on `last_activity_at`.

### Activity feed (Supabase activities)
- `getActivity()` now returns structured activity items when Supabase is configured (preserves `type` and `taskId`).
- Dashboard feed now shows activity-specific icons (task_created/task_moved/build_update) and formats timestamps.

### Mobile polish: AgentProfilePanel
- Agent profile now opens as a right-side **Sheet** on mobile (instead of trying to render a fixed-width sidebar).
- Desktop keeps the persistent right sidebar panel.
- `AgentProfilePanel` supports a `variant` prop (`sidebar` | `sheet`) to control layout/borders.

### Fix: project scoping header (CORS)
- Server now allows the browser to send the `x-clawdos-project` header by including it in CORS `access-control-allow-headers`.
- This unblocks real per-project workspace routing (instead of always defaulting to `front-office`).

### Fix: Control API server startup log
- Fixed a `ReferenceError` on server startup (`WORKSPACE` was undefined) by logging `DEFAULT_WORKSPACE` instead.

### AgentProfilePanel wiring: real attention + timeline
- Agent profile panel now accepts `tasks` + `activity` from the Dashboard.
- **Attention** tab shows real assigned (non-done) tasks for the agent.
- **Timeline** tab shows recent activity rows authored by the agent (from Supabase `activities` when configured).
- Replaced mock “about/skills” placeholders with lightweight, real presence fields (state/current task/last heartbeat/activity) and skillCount.

### Fix: Control API can create project memory/ files on first write
- Control API now `mkdir -p`s the parent directory before writing agent files (`memory/YYYY-MM-DD.md`) and `memory/tasks.json`.
- This prevents 500s when a new project workspace doesn’t already have a `memory/` folder.

### Front Office project highlighting
- Top bar now shows a **Front Office** badge when the selected project is tagged `system`.
- Project selector prefixes system projects with a star ("★") so it’s obvious when you’re editing the admin system itself.

### Cron: run history endpoint + UI
- Control API: added `GET /api/cron/:id/runs?limit=N` (calls `clawdbot cron runs`) so the UI can fetch JSONL-backed run history.
- Cron page: when you expand a job, it fetches and shows the last few runs (status, duration, summary).

### Agent file editors: show commit hash on save
- SOUL/USER/MEMORY editors now display the short git commit hash returned by the Control API after a successful save.
- Also ensures saving state clears reliably via `finally`.

### Presence: dashboard agent status now considers heartbeat timestamps
- When resolving an agent's dashboard status (online/idle/offline), we now use the most recent of `last_activity_at` and `last_heartbeat_at` from Supabase `agent_status`.
- This prevents agents from showing as "idle" when they are heartbeating but not emitting activity events.
- Agent profile panel now shows its "Since …" helper based on the same "last seen" concept (newest activity/heartbeat).

### Presence: auto-create missing agent_status rows
- When Supabase is configured, `getAgents()` now upserts default `agent_status` rows for any agents missing presence.
- This keeps the dashboard/profile panel presence fields populated without manual seeding.

### Activity UI: display-friendly actor labels (while keeping raw keys)
- Supabase activities now carry both a raw `author` (e.g. `agent:main:main`) and a display-friendly `authorLabel` (e.g. `main`).
- Dashboard Live Feed uses the friendly label so the feed reads cleanly, while exact matching still works elsewhere.

### Fix: restore selected project on reload
- Zustand store now initializes `selectedProjectId` from `localStorage` (`clawdos.project`) so project scoping stays consistent across refreshes.

### Activity feed: human-readable task move messages
- When a task is moved in Supabase mode, we now look up the task title and write activity messages like `Moved “Title” → in_progress` instead of `taskId -> status`.

### Tooling: log build updates to Supabase
- Added `scripts/log-build-update.mjs` to insert a short `activities` row (`type=build_update`) from the CLI.
- Now loads `.env.local` as well as `.env` so local Supabase keys work out of the box.

### Live Feed: manual refresh + "updated" timestamp
- Dashboard Live Feed header now shows how recently the data was refreshed and provides a one-click refresh button (with spinner).

### Brain-doc sync: log agent file edits to Supabase activity feed
- Control API now best-effort inserts an `activities` row (`type=brain_doc_updated`) when saving SOUL/USER/MEMORY files.
- This makes doc edits show up in the Live Feed when Supabase is configured.

### Agents sidebar: live refresh + status-priority sorting
- Agents list now auto-refreshes every 30s (fails soft if the request errors).
- Sidebar sorts agents by status priority (running → online → idle → offline), then name.

### Agents sidebar: show per-agent color theme
- Agent roster now carries through the Supabase `agents.color` field (when present).
- Sidebar renders a small colored dot on each agent card, making distinct agents easier to scan.

### Dashboard: Supabase realtime subscriptions
- When Supabase is configured, Dashboard now subscribes to realtime changes on `activities`, `agent_status`, and `tasks` for the selected project.
- Falls back to a slower poll (30s) so it self-heals if a realtime channel drops.

### Agents sidebar: subtle glow for running agents
- Sidebar now adds a subtle animated halo/glow around agents whose status resolves to `running`.
- Respects `prefers-reduced-motion`.

### Cron page: refresh jobs + run history
- Added a “Refresh” button with last-updated timestamp for the cron jobs list.
- Added per-job “Refresh runs” to re-fetch run history on demand (useful during debugging).

### Agents page: richer agent header
- Agent detail header now displays the real agent emoji/avatar, role, status badge, and color dot (when available) instead of a hard-coded 🤖.
- Fetches agent roster best-effort and fails soft so file editors still work if roster fetch fails.

### AgentProfilePanel: timeline now matches normalized Supabase actor keys
- Fixed AgentProfilePanel timeline filtering to handle compound actor keys (e.g. `agent:<agentKey>:<sessionKind>`), so per-agent activity shows up reliably.

### Cron: edit job name/schedule/instructions (Control API + UI)
- Control API now supports `POST /api/cron/:id/edit` (maps to `clawdbot cron edit`) so jobs can be updated from the web UI.
- Cron page now has an **Edit** dialog for updating a job's name, cron expression, and instructions.
- Increased cron list/enable/disable/run timeouts in the Control API to avoid gateway timeouts on slower responses.

### Build: vendor chunking (Vite)
- Added a simple Rollup `manualChunks` strategy so production builds split `node_modules` into vendor chunks.
- Prevents the main JS bundle from growing into a single monolith (and removes the >500k chunk warning).

### Cron: stable next-run timestamps (nextRunAtMs)
- Control API now passes through `nextRunAtMs` (when provided by `clawdbot cron list`).
- Cron page and Dashboard feed prefer the numeric timestamp for rendering/sorting, and fall back to the old `nextRun` string.

### Build: suppress noisy Browserslist old-data warning
- Build scripts now set BROWSERSLIST_IGNORE_OLD_DATA=1 so CI/local builds aren’t spammed by the caniuse-lite age warning (until bun is available for update-browserslist-db).

### Cron: log run requests to Supabase activity feed
- `POST /api/cron/:id/run` now best-effort inserts an `activities` row (`type=cron_run_requested`) before triggering `clawdbot cron run`.

### Server: cleanup duplicate Supabase import
- Removed a duplicate `createClient` import in `server/index.mjs`.

### Activity feed: write activities via Control API
- Added `POST /api/activity` to best-effort insert a Supabase `activities` row (`type`, `message`, optional `actor`).
- Enables build updates (and other UI actions) to publish to the live feed without bundling Supabase keys into the browser.

### Agents sidebar: show real "seen" timestamps (Supabase presence)
- Agents sidebar now prefers Supabase presence timestamps (`last_heartbeat_at` / `last_activity_at`) to render a reliable “Seen … ago” label.
- Falls back to the existing `lastActive` string when timestamps aren’t available.

### Agents page: show agent_status presence in agent header
- Agent detail header now surfaces Supabase-backed presence fields: `state`, “Seen …” relative timestamp, and an optional status note.
- Includes a tooltip with the raw last heartbeat/activity timestamp when available.

### Activity feed: server now merges Supabase activities + git commits
- `GET /api/activity` now best-effort fetches recent rows from Supabase `activities` for the selected project and merges them with recent brain-repo git commits.
- This makes the Dashboard “Live Feed” work even when the browser doesn’t have Supabase keys configured.
