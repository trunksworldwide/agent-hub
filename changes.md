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

### Supabase admin script can now log activities
- `scripts/supabase-admin.mjs` now accepts `--activity "..."` to insert an `activities` row.
- Supports `--type` (default `build_update`) and `--actor` (default `agent:main:main`).
- Intended for quickly recording build updates directly into Supabase while wiring is in progress.
- Also loads `.env.local` (in addition to `.env`) so service role keys don’t have to live in `.env`.

### Cron: enable/disable wired (Control API)
- Added `POST /api/cron/:id/toggle` (plus `/enable` and `/disable`) to the Control API.
- `toggleCronJob()` now hits the Control API so the Cron UI switch actually enables/disables real jobs.

## Next planned work
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
