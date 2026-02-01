# toolstoadd.md

Tools we may want ClawdOS to control (beyond current basics).

## Execution + automation
- Always-on task runner service (launchd) for the Control API + UI
- Webhooks intake (GitHub, Stripe, Zapier)
- Background job queue (with retries, dead-letter queue)

## UI/observability
- Activity/event log as a first-class stream (every action recorded)
- Revert/undo system for reversible actions
- Per-project dashboards (KPIs, spend, tasks)

## Finance controls
- Budget caps per project
- Approvals workflow for irreversible / expensive actions

## Distribution
- Deploy ClawdOS so it’s reachable from phone/laptop (Tailscale / Cloudflare Tunnel)

Notes
- This file is about platform-level tools. `skillstodo.md` is about 3rd-party skills/integrations.
