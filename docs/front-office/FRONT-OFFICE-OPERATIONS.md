Mission Control (Front Office) — Operations Map + Command Reference

Purpose
- This is the operator playbook for how you (Zack) and me (Trunks) run the whole system.
- Front Office is the “home project.” Operational docs live here so we don’t lose the plot across many client projects.

Current architecture (plain-English process map)
1) You text me (iMessage)
- You can say: “Create project …”, “Spawn agents …”, “Create task …”, “Upload this …”, “Summarize …”, etc.

2) I (Trunks) translate that into actions
- I create/update Projects, Agents, Tasks, Docs.
- I keep the system safe: I ask before risky/external actions (sending outreach, publishing, spending money).

3) Dashboard (Supabase) is the control plane
- Stores: projects, agents, tasks, task_events timeline, chat (war room), docs, delivery queues, schedules.
- Shows realtime state.

4) Mac mini (Executor) is the runtime
- Control API runs locally (fast path) and executes privileged actions.
- Workers run (cron-mirror, chat-delivery, doc sync) and keep Supabase mirrored/healthy.
- Drive spine is managed here (uploads + project folder structure).

5) Agents do work and report back
- Agents read a Context Pack.
- Agents post progress to the task timeline and war room.
- Agents upload artifacts to Drive.
- Agents ask for approval for risky/external actions.

Live vs Backup behavior
- Live mode: Control API reachable → immediate actions.
- Backup mode: Control API unreachable → dashboard queues requests in Supabase; executor/workers apply them when it’s back.

Non-negotiable operating rules
- Tasks: all progress goes to the task timeline (task_events). No “invisible work.”
- Artifacts: anything important gets uploaded to Drive and linked in the task.
- Knowledge: save sources (notes/URLs/files) so agents can search later.
- Approvals: anything external (outreach, posting, spending, account changes) requires explicit approval.

What I can do for you entirely via text
- Create a new project + initialize Drive spine
- Spawn agents with roles, provision them, and ensure they have the correct “how to operate Mission Control” instructions
- Create tasks, assign tasks, stop tasks, soft-delete tasks
- Post war-room updates and task comments
- Upload artifacts to Drive (specs, ops notes, exports)
- Save knowledge items and search knowledge
- Run health checks and report drift

Command reference (what Trunks/agents can run)

A) Control API endpoints (project-scoped)
- All require header: x-clawdos-project: <projectId>

Knowledge
- POST /api/knowledge/ingest
  Body: { title?, source_url?, source_type?, text? }
- POST /api/knowledge/search
  Body: { query, limit? }

Tasks
- POST /api/tasks/propose
  Body: { author, title, description?, assignee_agent_key? }
- POST /api/tasks/:taskId/events
  Body: { event_type: "comment", content, metadata?, author }
- POST /api/tasks/:taskId/status
  Body: { status, author }
- POST /api/tasks/:taskId/assign
  Body: { assignee_agent_key, author }
- POST /api/tasks/:taskId/stop
  Body: { author, reason? }
- POST /api/tasks/:taskId/delete
  Body: { author, reason? }

Chat
- POST /api/chat/post
  Body: { message, thread_id?, author, message_type?, metadata? }

Drive
- POST /api/drive/upload
  Body: { category: inbox|specs|ops|assets|exports, name, content, author, convertTo? }
- POST /api/projects/:projectId/drive/init
- GET  /api/projects/:projectId/drive/verify

Health + drift
- POST /api/health/report
- GET  /api/cron/consistency

B) OpenClaw CLI (on the Mac mini)
- openclaw status
- openclaw gateway status
- openclaw gateway restart
- openclaw cron list --json
- openclaw agents list --json

C) “How agents should operate” (the default contract)
- Always search knowledge first for the task topic
- Post updates via /api/tasks/:taskId/events
- Upload artifacts via /api/drive/upload and link them in the task timeline
- Ask for approval before any external side-effect

Logins / operating external tools (Lovable, etc.)
- For tools with a web UI (Lovable, email dashboards, CRMs): agents should use the browser automation skill (agent-browser).
- If login requires interactive OAuth/2FA, the agent must ask you to complete the login step (we do not bypass security).
- Once logged in, agents can continue operating within that authenticated session.

Recovery checklist (when something feels broken)
1) Check executor health
- GET /api/executor-check
2) If needed, restart gateway
- openclaw gateway restart
3) Check cron consistency
- GET /api/cron/consistency
4) Verify Drive wiring
- GET /api/projects/front-office/drive/verify
5) If still weird, I’ll capture:
- last 100 lines of worker logs
- last control api health response
- and open a task called “Incident: <summary>” with next steps.
