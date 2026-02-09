# ClawdOS (agent-hub)

ClawdOS is a mobile-friendly "control plane" dashboard for [OpenClaw](https://docs.openclaw.ai/) agents running on a Mac mini.

It's meant to make an agent system readable and editable:
- instructions (Soul)
- user config
- memory (daily + long-term)
- skills
- tools
- sessions
- schedules (cron)
- activity

Docs:
- `docs/OVERVIEW.md` (how it works, architecture, API contract)
- `changes.md` (running log of changes made during build-out)
- `later.md` (backlog / future features)

## Repo layout
- `src/` frontend (Vite + React + TypeScript + shadcn/ui)
- `server/` minimal local Control API that connects the UI to the OpenClaw workspace

## Run locally

Install:
```bash
npm install
```

Start the Control API:
```bash
npm run dev:api
```

Start the UI (in another terminal):
```bash
# point the UI at the local API
export VITE_API_BASE_URL=http://127.0.0.1:3737
npm run dev
```

Or run both:
```bash
npm run dev:all
```

Open:
- UI: http://localhost:8080
- API: http://127.0.0.1:3737

## Notes
- The Control API is intentionally an adapter layer (stability + security + easy future auth).
- Edits to the agent brain files are auto-committed to git for audit/rollback.
- The server uses a compatibility wrapper (`server/executor.mjs`) that prefers `openclaw` but falls back to `clawdbot`. Set `EXECUTOR_BIN` for explicit control.

