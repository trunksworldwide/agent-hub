# Operations

## Always-on: brain docs sync

Purpose: keep Supabase `brain_docs` and the local Clawdbot workspace files in lockstep.

Files synced (Front Office by default):
- SOUL.md (doc_type `soul`)
- AGENTS.md (doc_type `agents`)
- USER.md (doc_type `user`)
- MEMORY.md (doc_type `memory_long`)

### How it works
- Supabase -> Files:
  - subscribes to realtime changes on `brain_docs` for the selected project
  - writes updates into the workspace files
- Files -> Supabase:
  - polls the workspace files and upserts updates into `brain_docs`

### Service
This runs as a launchd user agent:
- plist: `~/Library/LaunchAgents/com.trunks.clawdos.brain-doc-sync.plist`
- logs:
  - `~/Library/Logs/clawdos-brain-doc-sync.log`
  - `~/Library/Logs/clawdos-brain-doc-sync.error.log`

### Commands
Reload the service:
```bash
launchctl unload -w ~/Library/LaunchAgents/com.trunks.clawdos.brain-doc-sync.plist || true
launchctl load -w ~/Library/LaunchAgents/com.trunks.clawdos.brain-doc-sync.plist
```

Check status:
```bash
launchctl list | grep com.trunks.clawdos.brain-doc-sync
```

Tail logs:
```bash
tail -f ~/Library/Logs/clawdos-brain-doc-sync.log
```

Notes:
- Secrets live in `/Users/trunks/Projects/agent-hub/.env.local` (gitignored).
- We will later generalize this to support per-project sync processes.
