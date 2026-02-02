# Supabase in ClawdOS

This doc explains how ClawdOS uses Supabase and how it connects to the Mac mini.

## The core idea
ClawdOS has two worlds that must stay consistent:

1) Live mission-control data (database)
- Tasks
- Agent roster and presence
- Activity feed
- (later) notifications, comments, documents

2) The agent “brain files” on the Mac mini
- SOUL.md, AGENTS.md, USER.md, MEMORY.md
- These are what Clawdbot actually reads at runtime.

Supabase is used for the database world. The Mac mini uses sync processes to keep brain files in lockstep with Supabase.

## Tables (current)

projects
- One row per project.
- project_id is the scope key used everywhere.

agents
- One row per agent per project.
- agent_key is the stable identity (session key style): agent:<role>:main

agent_status
- Presence and “what I’m doing” per agent.
- UI derives online/idle/running/offline from this.

tasks
- Kanban tasks. Each task belongs to a project.
- assignee_agent_key assigns the task to an agent.

activities
- Append-only feed for the whole project.
- Used for the live feed and for notifications.

brain_docs
- Canonical editable brain docs in the dashboard.
- doc_type values like soul, agents, user, memory_long.
- Edits here are synced to the Mac mini files.

## How the app chooses data sources

Frontend (Lovable / web UI)
- Reads and writes mission-control data directly via the Supabase anon key:
  - agents, agent_status, tasks, activities, brain_docs
- The UI is always scoped by the selected project.

Control API (Mac mini)
- Still exists for local operations:
  - cron list/edit/run
  - gateway restart
  - reading local skills
  - reading local sessions
  - writing local files when needed
- Control API also best-effort writes some activity events to Supabase so the feed stays truthful.

## Bidirectional brain-doc sync (Mac mini)

Goal
- If you edit SOUL/AGENTS/USER/MEMORY in the dashboard, Trunks and other agents immediately behave accordingly.
- If Trunks edits those files locally, the dashboard updates.

How
- `scripts/brain-doc-sync.mjs` runs 24/7 as a launchd service.
- Supabase -> files: realtime subscription to brain_docs writes to workspace files.
- files -> Supabase: periodic polling detects file changes and upserts brain_docs.

Service
- launchd: `~/Library/LaunchAgents/com.trunks.clawdos.brain-doc-sync.plist`
- logs: `~/Library/Logs/clawdos-brain-doc-sync.log`

## Tasks vs cron (conceptual)

Tasks
- Human work units (like assigning an employee)
- Stored in Supabase tasks table
- Have assignee, status, description, etc.

Cron
- Scheduled wakeups or recurring jobs
- Runs through Clawdbot cron system
- Should reference tasks by id (or query tasks) and write activities as work progresses

Principle
- Cron triggers work.
- Tasks are the record of what work exists.
- Activities are the record of what happened.

