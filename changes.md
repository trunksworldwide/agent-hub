### Agents sidebar: reduce re-render churn for “Seen … ago” labels (mobile polish)
- Sidebar no longer re-renders every second just to update “Seen … ago”.
- Timestamp tick is now every ~10s, and very recent activity shows as “Seen just now” / “Seen <1m ago”.

### Dashboard Live Feed: don’t truncate activity list at 20 items
- The feed renderer no longer hard-caps Supabase activity items to 20; it now renders the full fetched list (respecting the configured fetch limit / “Load more”).

### Presence: seed missing agent_status rows using agents.created_at (less misleading)
- When an agent exists in `agents` but is missing a matching `agent_status` row, we still upsert a default presence row so the dashboard can render.
- Instead of seeding `last_activity_at` with "now" (which made agents look freshly online), we now prefer the agent's `created_at` timestamp when available.

### AgentProfilePanel: copy agent key button
- Agent profile header now shows the agent key (e.g. `agent:main:main`) with a one-click **Copy** action.
- Handy for wiring cron heuristics, activity debugging, and quick “message routing” tests.

### Dashboard Live Feed: keep cron “upcoming” links from floating above real activity
- Cron jobs in the Live Feed are now anchored to epoch time so upcoming schedules (future timestamps) don’t sort above real recent activity.
- Still shows the next run time in the subtitle ("Next: …") and remains clickable for quick navigation to Cron manager.

### Dashboard Live Feed: feed item details dialog
- Added an inline **Details** (ⓘ) button on each Live Feed card to open a dialog with raw fields.
- Includes quick actions (Open agent/Open Cron manager when applicable) + a **Copy JSON** button for debugging.

### TopBar: Load more for global activity notifications
- Global activity bell now supports **Load more** (increments fetch limit in steps of 10, clamped to 200).
- The popover keeps auto-refreshing at the currently selected limit.

### Dashboard Live Feed: Load more button + configurable activity fetch limit
- `getActivity(limit)` now accepts a limit (clamped 1–200) instead of hardcoding 50.
- Dashboard Live Feed shows a **Load more** button when the feed hits the current limit, so you can pull older history without a reload.

### Projects: persist selected project in localStorage
- Switching projects now writes the selected project id to `localStorage` (key: `clawdos.project`).
- Fixes the project selector resetting back to the default project on refresh/reload.

### Agents sidebar: subtle “working/online” glow around active agents
- Mobile + desktop sidebar agent tiles now get a subtle ring/glow when an agent is **online** or **working**.
- Makes the left rail feel more “alive” without deleting/changing any major UI.

### Presence: normalize agent keys when bumping agent_status from activity writes
- When `createActivity()` writes directly to Supabase, presence updates now normalize actor keys like `agent:main:main:cron` → `agent:main:main`.
- Prevents presence rows from splitting into duplicate keys and keeps the sidebar/profile status accurate.

### AgentProfilePanel: standardize timestamps via shared datetime helpers
- Agent profile Timeline/Messages now uses `formatDateTime()` for consistent 12h month/day timestamps.
- Schedule tab “Next run” label now uses the same formatter when `nextRunAtMs` is available.

### Dashboard Live Feed: session items open the recipient agent
- Live Feed session entries now prefer the **recipient** agent (when present) for avatar tinting + click-through.
  - Example: a feed item showing `dashboard → Research` now opens **Research** instead of the sender.

### Datetime formatting: standardize on 12h “normal time” across UI
- Added `src/lib/datetime.ts` helpers (`formatDateTime`, `formatTime`) for consistent month/day + 12h timestamps.
- Cron page now uses the shared formatter for next-run + run history + “Updated” label.
- Notifications tooltip now uses the same 12h time formatting.

### TopBar: visually highlight Front Office (system) project
- When the selected project is tagged `system` (Front Office), the top bar now gets a subtle amber tint.
- Makes it obvious you’re editing the admin system itself (without deleting/changing any major UI).

### Presence: optional Supabase-only dashboard keepalive (agent_status)
- Dashboard can now *optionally* upsert presence directly to Supabase every 60s (for Supabase-only deployments where the Control API isn’t available).
- Opt-in via:
  - `VITE_DASHBOARD_PRESENCE_AGENT_KEY=agent:ui:dashboard` (or any agent key)
  - optional `VITE_DASHBOARD_PRESENCE_CREATE_AGENT=true` to also seed an `agents` roster row.

### AgentProfilePanel: open scheduled job in Cron manager
- Schedule tab now includes an **Open** button per matched cron job.
- Clicking it switches to **Manage → Cron**, auto-expands that job, and scrolls it into view.

### Dashboard: tint agent avatars in sidebar using theme color
- When an agent has a `color` (from Supabase `agents.color`), their avatar tile in the sidebar now gets a subtle tint + top stripe.
- Applies to both **desktop** (collapsed + expanded) and **mobile** agent lists.

### Dashboard: show agent “last active” in sidebar (desktop + mobile)
- Added a subtle `Last active …` line under each agent (when available) so presence is readable at a glance.
- Collapsed sidebar tooltips now include last active info.

### Supabase realtime: use the auth-aware client everywhere
- `src/lib/supabase.ts` now re-exports the generated `@/integrations/supabase/client` instance (instead of creating a separate env-based client).
- Fixes a subtle realtime bug where Dashboard realtime could be "disabled" (or unauthenticated) even though the rest of the app was using Supabase.

### TopBar: responsive notifications popover width
- Notifications bell popover now uses a responsive width (`min(24rem, 100vw - 2rem)`) so it doesn’t overflow on mobile.

### TopBar: global activity bell deep-links cron entries
- Clicking a `cron` / `cron_run_requested` notification now jumps straight to **Manage → Cron**.
- If the activity message includes a job id (e.g. `Requested cron run: <jobId>`), the Cron page auto-expands + scrolls to that job.

### Brain-doc sync: avoid echo loops + redundant writes
- `scripts/brain-doc-sync.mjs` now skips writing local brain docs when content is unchanged.
- The local polling watcher now initializes from existing file contents (avoids an immediate first-tick upsert).
- Added an in-memory `lastLocal` cache so remote updates don't immediately bounce back into Supabase as a redundant `local_file` upsert.

### Supabase: add per-agent brain_docs (SOUL/USER/MEMORY) + realtime subscription
- Added a `brain_docs` table migration with RLS + updated_at trigger (`supabase/migrations/20260203000001_add_brain_docs.sql`).
- Fixed Supabase-mode agent file reads/writes to scope by `agent_key` (was incorrectly shared across all agents in a project).
- Live project realtime subscription now listens to `brain_docs` changes so doc edits refresh immediately.

### Projects: centralize selected project persistence
- Added `src/lib/project.ts` with safe `getSelectedProjectId()` / `setSelectedProjectId()` helpers.
- Switched API layer, Zustand store init, TopBar persistence, and `supabase-data.ts` to use the shared helper.
  - Prevents subtle SSR/localStorage edge cases and keeps `x-clawdos-project` scoping consistent.

### Supabase-only builds: create projects via Supabase (no Control API required)
- `createProject()` now supports Supabase mode by upserting the `projects` row directly (workspace_path can be set later).
- TopBar “New project” now alerts on failure instead of silently reloading.

### Supabase-only builds: status fetch fails soft + restart disabled without Control API
- `getStatus()` now returns a **Supabase connectivity** status when Supabase is configured but `VITE_API_BASE_URL` is missing.
  - Prevents the UI from crashing in Supabase-first deployments.
- TopBar now **catches status errors** and renders `activeSessions` as `—` when unknown.
- Restart is automatically **disabled** when `VITE_API_BASE_URL` isn’t configured (with a helpful tooltip).

### AgentProfilePanel: Schedule tab shows cron jobs (with instructions)
- AgentProfilePanel now includes a **Schedule** tab that lists cron jobs that appear to belong to the agent.
- Shows schedule, enabled/disabled, next run, and lets you expand to view the job’s full instructions.
- v1 heuristic: matches jobs by scanning the job name/instructions for the agent key or display name.

### Agents sidebar: New Agent prompt includes theme color (suggested)
- Creating a new agent from the sidebar now asks for an optional **theme color** (hex).
- We suggest a deterministic color from a small palette based on the agent key, so new agents get a consistent visual identity by default.

### Dashboard Live Feed: click cron entries to open Cron page
- Clicking a Live Feed item for `cron` (or `cron_run_requested`) now switches to **Manage → Cron**.
  - Makes the feed actionable instead of a dead list.

### Tooling: log-build-update prefers service role key
- `scripts/log-build-update.mjs` now prefers `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` when present.
  - Makes build-update activity logging reliable even when RLS blocks anon inserts.
  - Still falls back to anon keys when service keys aren’t available.

### Dashboard Live Feed: relative timestamps + hover absolute
- Live Feed now shows a relative timestamp (e.g. "5m ago") for faster scanning.
- Hovering the time reveals the full absolute timestamp for precision.

### AgentProfilePanel: resolve current task title from tasks
- Presence section now shows the **task title** (when available in the dashboard task list) alongside the raw `current_task_id`.
- Falls back to displaying the raw task id when we don't have the task locally yet.

### Dashboard Live Feed: show agent avatars + type in subtitle
- Live Feed items attributed to a known agent now render the agent’s emoji in a tinted tile (uses agent `color` when present).
- Feed subtitle prefers the agent’s display name (instead of raw `actor_agent_key`) and also shows the activity `type` (monospace) for fast scanning.

### AgentProfilePanel: show agent theme color in profile header
- AgentProfilePanel now tints the avatar tile with the agent’s `color` (when present) and shows a small color dot next to the name.

### Agents sidebar: optional drag-to-reorder (custom sort mode)
- Agents sidebar now supports a per-project **Custom** ordering mode (toggle button).
- In custom mode, agent cards are draggable and the order persists in `localStorage` (`clawdos.agentOrder.<projectId>`).
- Default behavior remains status-priority sorting.

### AgentProfilePanel: Messages tab shows logged session notes
- AgentProfilePanel now renders a lightweight “Messages” tab by filtering `type=session` activity rows.
- Sending a message now encodes the recipient agent key in the activity message (`To agent:<name>:<kind>:`) so the per-agent inbox works without a dedicated messages table.

### Activity feed: display-friendly author labels
- Supabase-backed activity items now derive `authorLabel` as a human-friendly display name (e.g. `agent:main:main` → `main`).
- AgentProfilePanel timeline matching still works with both raw keys and legacy/looser author formats.

### Notifications: click global activity to switch projects
- Global activity items in the notification bell are now clickable.
- Clicking an item switches the selected project to that activity’s project and returns you to Dashboard view.

### Notifications: clear unread badge when you open the bell
- The global activity bell now keeps a `lastSeenAt` value in React state (not only `localStorage`).
- When the notifications popover opens, we update both `localStorage` *and* state so the unread badge clears immediately (no refresh required).

### Presence: upsert agent_status for *all* active agents from /api/sessions
- Control API `GET /api/sessions` now upserts Supabase `agent_status` for every inferred `agent:<name>:<kind>` key (not just `agent:main:main`).
  - Ensures multi-agent dashboards show accurate online/working + last_activity_at.
  - Still guarantees a default `agent:main:main` presence row even when no sessions are active.

### Activity feed: agent key parsing (click-through to profile)
- Fixed Dashboard Live Feed click-through to agent profiles when `actor_agent_key` uses colon-delimited keys (e.g. `agent:main:main`).
  - Feed now normalizes agent keys to `agent:<name>:<kind>` so `agentByKey` lookups succeed.

### Dashboard: subtle background gradient
- Added a very light vertical gradient to the Dashboard main scroll area so the page feels less flat (matches the “alive” UI direction without deleting any UI).

### Presence: sync agent_status from live sessions
- Control API `GET /api/sessions` now derives a base `agentKey` from each session key (e.g. `agent:main:cron:...` → `agent:main:main`) and uses it to best-effort upsert Supabase `agent_status`.
  - Keeps `last_activity_at` aligned with the most recently updated session.
  - Sets a lightweight `note` like `N active session(s)` so the profile panel has context.
- `/api/status` now also sets a similar note when it refreshes main-agent presence.

### Activity: fix agent key normalization for per-agent timelines
- Fixed a subtle Supabase activity parsing bug where `actor_agent_key` like `agent:main:main` was being truncated to `main`.
  - `getActivity()` now normalizes agent keys as `agent:<name>:<kind>` and strips only *extra* trailing segments (e.g. `agent:main:main:cron` → `agent:main:main`).
  - AgentProfilePanel uses the same normalization so the Timeline tab correctly filters activity for agents.

### TopBar: notification bell (global activity)
- Added a notification bell in the top bar that shows the most recent 10 Supabase `activities` across **all projects**.
  - Includes per-project labels, timestamps, and type-based icons.
  - Tracks a simple unread count using localStorage (marks all seen when you open the popover).
- Control API: added `GET /api/activity/global?limit=N` (service-role Supabase) to power the bell.

### Dashboard: switch timestamps to 12-hour time
- Dashboard clock and feed timestamps now use normal 12-hour time (with seconds) instead of 24h.
- Agent profile panel timestamps match for consistency.

### Agents sidebar: “New Agent” button (Supabase)
- Added a lightweight “+” button in the Agents sidebar to create a new agent roster entry (Supabase `agents`) and seed presence (`agent_status`).
- Uses simple prompts for now (key/name/emoji/role) to avoid heavy UI work while wiring is in progress.

### Activity UI: icons for new activity types
- Dashboard Live Feed and AgentProfilePanel now recognize:
  - `brain_doc_updated` → 🧠
  - `cron_run_requested` → ▶️
- Feed item typing is now `string` so new activity event types render without requiring a frontend update.

### Activity feed: log brain doc edits in Supabase mode
- When the dashboard saves SOUL/USER/MEMORY via Supabase `brain_docs`, we now best-effort insert an `activities` row (`type=brain_doc_updated`).
  - Keeps the Live Feed accurate even when bypassing the Control API.

### Dashboard: follow active project for realtime + refresh
- Dashboard now uses the shared store’s `selectedProjectId` for Supabase realtime subscriptions.
  - Fixes a subtle bug where switching projects would keep the dashboard subscribed to the old project until a full reload.

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
- Add a watchdog automation to prevent long idle gaps (alert if no commits in 60m).
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

### Dashboard feed: session messages target the recipient agent
- Dashboard live feed now parses `session` activity messages (e.g. `To agent:main:main: ...`) and treats the recipient as the clickable agent.
- This makes “Send message” entries open the right AgentProfilePanel even though the activity actor is `dashboard`.

### UI: icons for agent_created + project_created activities
- Activity icon mapping now includes:
  - `agent_created` → 🤖
  - `project_created` → 📁
- Applied across Dashboard Live Feed, AgentProfilePanel timelines, and TopBar notifications.

### Presence: bump agent_status on Supabase activity inserts
- When createActivity() writes to Supabase and the actor is a real agent key (starts with `agent:`), we now best-effort upsert `agent_status.last_activity_at`.
- This keeps dashboard presence accurate in Supabase-only builds where presence updates aren’t coming from the Control API.

### Presence: dashboard keepalive no longer requires Supabase Auth session
- Dashboard UI keepalive now attempts Supabase `agents` / `agent_status` upserts even when there is no active Supabase Auth session.
- This improves presence reliability for Supabase setups that allow anon presence writes (or use RLS policies keyed off the anon/service key).

### UI: subtle glow for working agents
- Agents marked as WORKING now get a gentle pulse/glow around their avatar in sidebars to make active work feel more alive without reworking layout.
