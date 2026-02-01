# changes

This file tracks what Trunks changed in the repo while the dashboard isn’t fully wired yet.

## 2026-02-01

### Control API now powers Skills/Cron/Status/Sessions
- `GET /api/status` now attempts to fetch the active session count via `clawdbot sessions --json`.
- `GET /api/sessions` now exposes the session store (`clawdbot sessions --json --active 10080`) to the UI.
- `GET /api/skills` now lists installed skills by scanning the local Clawdbot skills directory and parsing `SKILL.md`.
- `GET /api/cron` now reads `clawdbot cron list --json`.
- `POST /api/cron/:id/run` can run a cron job immediately.
- Frontend `getSkills()`, `getCronJobs()`, and `getSessions()` now call these endpoints when `VITE_API_BASE_URL` is set.


### Wired the UI to a real backend (optional)
- Updated `src/lib/api.ts` so it can run in two modes:
  - If `VITE_API_BASE_URL` is set, the UI fetches real data from a backend.
  - If it is not set, the UI continues to use local mock data (so the UI still works standalone).

### Added a minimal local Control API (v1)
- Added `server/index.mjs`.
- Runs a tiny HTTP server on `http://127.0.0.1:3737`.
- Exposes endpoints used by the UI:
  - `GET /api/status`
  - `GET /api/agents` (v1 returns only the primary agent profile)
  - `GET /api/agents/:id/files/:type` where type is `soul|user|memory_long|memory_today`
  - `POST /api/agents/:id/files/:type` to save file contents
    - Now also auto-commits edits into the workspace git repo and returns the commit hash.
  - `POST /api/restart` to restart the Clawdbot gateway (best effort)
- The Control API reads/writes the real agent “brain” files from the Clawdbot workspace:
  - `/Users/trunks/clawd/SOUL.md`
  - `/Users/trunks/clawd/USER.md`
  - `/Users/trunks/clawd/MEMORY.md`
  - `/Users/trunks/clawd/memory/YYYY-MM-DD.md` (today)

### Added environment and scripts
- Added `.env.example` with:
  - `VITE_API_BASE_URL=http://127.0.0.1:3737`
  - `CLAWD_WORKSPACE=/Users/trunks/clawd`
- Added npm scripts:
  - `dev:api` (runs the control API)
  - `dev:all` (starts API in background then starts Vite)
- Added `.gitignore` to keep `.env` out of git.

### Fixed a build warning
- Updated `src/index.css` so the Google Fonts `@import` comes before other CSS directives.

### Notes / known issues
- The background dev processes were started via the Clawdbot tool runner, but that environment can SIGKILL long-running processes after a short window. This does not affect the code itself; it just means we should run `npm run dev:api` and `npm run dev` normally on the Mac mini (or set them up as a proper service) during active development.

## Next planned work
- Add git-backed save history (partially done):
  - Server now auto-commits brain file edits to the workspace git repo and returns the commit hash.
  - Next: UI should display commit hash + add diff/rollback UI.
- Add real endpoints for:
  - sessions/sub-agents
  - cron jobs
  - installed skills
- Add safer “reload” behaviors (lightweight reload vs full gateway restart) with guardrails.
- UI polish: animations, empty states, error states, realtime updates.
