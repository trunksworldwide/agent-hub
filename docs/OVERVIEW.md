# ClawdOS (agent-hub)

ClawdOS is a mobile-friendly “control plane” UI for Clawdbot running on a Mac mini.

It’s designed to make an AI agent system understandable and editable from a single place:
- agents and their instruction sets ("Soul")
- user configuration
- memory (daily + long-term)
- installed skills
- tools and capabilities
- sessions (sub-agent runs / conversations)
- schedules (cron jobs)
- activity history

The goal is not just a pretty dashboard. The goal is operational control: a modern interface where every component does something real, is auditable, and can be rolled back.

## Why this exists
Most agent setups are opaque. You can’t easily see:
- what the agent believes (instructions)
- what it remembers
- what it can do (skills/tools)
- what it has been doing recently
- what’s scheduled to happen next

ClawdOS turns this into an OS-like interface.

## Architecture
ClawdOS is split into two parts:

1) Frontend (this repo)
- Vite + React + TypeScript
- shadcn/ui + Tailwind
- Mobile-first layout

2) Control API (included in this repo under `server/`)
- A minimal Node HTTP server that runs locally on the Mac mini.
- Exposes a safe, stable API contract that the UI can call.
- Reads/writes files in the Clawdbot workspace.
- Calls Clawdbot CLI commands to fetch sessions, cron jobs, etc.

This is intentionally an “adapter layer.” It prevents the UI from being tightly coupled to Clawdbot internals, and it gives us a single place to add:
- authentication
- rate limiting
- logging
- auditing
- rollback

## Data sources
ClawdOS pulls from:

- Clawdbot workspace files (the agent’s “brain”):
  - `SOUL.md` (behavior)
  - `USER.md` (user preferences/config)
  - `MEMORY.md` (long-term)
  - `memory/YYYY-MM-DD.md` (daily)

- Clawdbot session store:
  - `clawdbot sessions --json`

- Clawdbot scheduler:
  - `clawdbot cron list --json`

- Installed skills:
  - local Clawdbot skills folder (reads `SKILL.md`)

- Activity feed:
  - git commit history from the workspace repo

## Key principle: edits must be auditable
Editing the agent’s instructions without history is dangerous.

So the Control API commits changes to git when you edit core brain files.
This enables:
- viewing diffs
- tracking who/what changed behavior
- rollback

UI support for diff/rollback is planned (backend commits already happen).

## Running locally

### Prereqs
- Node.js + npm
- Clawdbot installed and running on the same machine

### Start the Control API
```bash
npm run dev:api
```

### Start the UI
```bash
# point UI at the API
export VITE_API_BASE_URL=http://127.0.0.1:3737
npm run dev
```

Or run both:
```bash
npm run dev:all
```

## API contract (current)
- `GET /api/status`
- `GET /api/agents`
- `GET /api/agents/:id/files/:type` (soul|user|memory_long|memory_today)
- `POST /api/agents/:id/files/:type` (writes file; auto-commits; returns commit hash)
- `GET /api/sessions`
- `GET /api/skills`
- `GET /api/cron`
- `POST /api/cron/:id/run`
- `GET /api/activity` (recent git commits)
- `POST /api/restart` (restarts the gateway)

## Mobile-first behavior
ClawdOS is designed so you can check it quickly on a phone:
- agent lists collapse into drawers
- dense tables avoided
- touch targets and spacing optimized
- key views become scrollable rather than squeezed

## Roadmap (high level)
- Diff + rollback UI
- Cron enable/disable/edit endpoints
- Real task layer (agent jobs as first-class objects)
- Chat sidebar inside ClawdOS
- Agent profile creation/deletion/reorder
- Remote access (Tailscale/Cloudflare Tunnel)
- Authentication (API key + optional SSO)

