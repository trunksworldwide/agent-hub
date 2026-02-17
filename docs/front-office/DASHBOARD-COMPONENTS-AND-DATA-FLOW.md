Dashboard Components + Data Flow (Agent Hub / Mission Control)

Purpose
A plain-English inventory of the main dashboard components and the data flow between:
- Dashboard (control plane)
- Supabase (storage + realtime)
- Mac mini (executor runtime)
- Agents (workers)

Mental model (one paragraph)
The dashboard is the “brain + ledger” where projects, tasks, docs, and chat live.
The Mac mini runs OpenClaw (the hands) and background workers that deliver messages, mirror cron state, and upload artifacts.
Agents do work and report back by writing task events, activities, and chat messages.

Main pages/components (what they do)

1) Projects
- Purpose: choose a project context.
- Reads/writes: projects table + project_settings.
- Side effects: can kick off Drive init + default docs/agents.

2) Knowledge (Documents)
- Purpose: store and search project context.
- Includes:
  - Project Mission + Project Overview cards
  - Knowledge search bar (vector search)
  - Document list (notes/files)
  - Context Pack Preview dialog
- Reads/writes:
  - brain_docs for mission/overview
  - project_documents for notes/files
  - knowledge_chunks/sources for vector search

3) War Room (Project Chat)
- Purpose: the shared communication stream.
- Reads/writes:
  - chat/messages table (project-scoped)
  - delivery queue when runtime offline

4) Tasks + Timeline
- Purpose: canonical progress tracking.
- Reads/writes:
  - tasks
  - task_events (timeline)
- Rules:
  - agents post progress here, not in local files
  - completion should create an outcome summary + artifact links

5) Agents
- Purpose: manage agent roster + provisioning status.
- Reads/writes:
  - agents table
  - agent_provision_requests queue (offline provisioning)
  - brain_docs for each agent (SOUL/USER/MEMORY)

6) Cron / Schedules
- Purpose: scheduled heartbeats + system jobs.
- Reads/writes:
  - cron_* request tables (queue)
  - cron_mirror state
- Shows staleness warnings when mirrors drift.

7) Activity Feed
- Purpose: the “what happened” stream across the project.
- Reads/writes:
  - activities table
- Should surface:
  - task completions
  - drive uploads
  - agent provisioning
  - incidents/drift warnings


Key workers (Mac mini)
1) Control API
- Runs on the Mac mini.
- Executes privileged actions and provides fast path endpoints.

2) Cron mirror worker
- Keeps OpenClaw cron state mirrored into Supabase.

3) Chat delivery worker
- Delivers queued messages from Supabase to agents/runtime.

4) Brain doc sync (optional)
- Keeps SOUL/USER/MEMORY in sync between disk and dashboard edits.


Key data-flow loops

A) Task loop
- Operator creates task -> agent runs -> agent posts task_events -> activity logs -> operator sees status.

B) Knowledge loop
- Operator adds doc -> knowledge ingests/chunks -> agent searches -> relevant snippets injected into context pack.

C) Chat loop
- Operator posts -> realtime -> agents respond -> delivery worker ensures reliability.

D) Schedule loop
- Dashboard requests cron changes -> worker applies -> mirror reports actual state.


What to copy if you’re building your own
- Tasks + task_events as canonical.
- War Room as readable layer.
- Knowledge as searchable memory.
- A delivery queue so clients don’t need VPN.
- A small set of pinned docs + per-task retrieval.
