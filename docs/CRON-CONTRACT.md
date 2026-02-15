# Cron data sources contract (Control API vs Supabase mirror)

Goal: keep the dashboard accurate and usable even if the Mac mini (Control API) is temporarily unreachable.

## Source of truth

1) Primary (when reachable): Control API → OpenClaw gateway
- Used for immediate, realtime actions and the most up-to-date job state.
- Endpoints: Control API calls that execute `openclaw cron ...`.

2) Backup / mirror (always available): Supabase tables
- Used when Control API is unreachable.
- Used to show “last known state” and to queue requests for the Mac mini workers.

## Rules

- If Control API is reachable: the UI should prefer it for cron listing + job details.
- If Control API is not reachable: the UI should fall back to Supabase mirror.
- Mirror staleness matters: if the mirror hasn’t updated recently, show a warning.
- Disagreement is expected briefly; persistent disagreement means a worker is stuck.

## Drift detection

A “drift” situation is any of:
- Control API job count differs from mirror job count for > N minutes
- Mirror’s last successful sync is older than N minutes

Suggested N (default): 10 minutes

## What to do when drift is detected

- Show a warning in the UI (Cron page) with:
  - Control API reachable? yes/no
  - mirror last sync time
  - job counts (control vs mirror)
- Link to diagnostics:
  - /api/executor-check
  - /api/cron
  - /api/cron/consistency

