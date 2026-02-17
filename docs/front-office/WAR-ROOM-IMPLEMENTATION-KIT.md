War Room Implementation Kit (Agent Hub / Mission Control)

Purpose
This doc explains the “War Room” (project chat) architecture in plain English and gives a blueprint you can copy into another dashboard.

High-level concept
War Room is the project’s shared communication stream.
- Humans post messages (operator updates, questions, approvals).
- Agents post progress + questions + completion summaries.
- The dashboard is the control plane (stores the truth + shows it in realtime).
- The executor/runtime is the action plane (agents run, tools operate, then report back).

Core requirements (what makes it work)
1) A durable message store (DB)
- Every message is a row. No hidden state.
- Messages can be filtered by project and optionally by thread.

2) Realtime updates (pub/sub)
- Clients subscribe to message inserts/updates so the chat feels live.

3) Delivery semantics (online/offline)
- If your executor/runtime is reachable, you can deliver agent replies immediately.
- If it’s not reachable, queue delivery and retry later.

4) Provenance + safety
- Every message has an author identity (operator vs agent vs system).
- Risky actions still go through approvals (chat is not permission).


Data model (minimal)
You can implement War Room with a single table plus optional threads.

A) messages table (project-scoped)
Required fields
- id (uuid)
- project_id (text)
- created_at (timestamp)
- author (text)  // e.g., 'zack' or 'agent:pm:acme'
- author_type (enum: operator|agent|system)
- message (text)

Recommended fields
- thread_id (uuid|null)  // for threads/replies
- message_type (text)    // 'chat'|'status'|'approval_request'|'completion'
- metadata (json)        // links, attachments, task_id, etc.

B) threads (optional)
- threads(id, project_id, title, created_at)


Realtime setup
- Subscribe to inserts on messages where project_id = current project.
- Also subscribe to updates if you support edits/reactions.


Agent communication pattern (how agents should behave)
Agents should not “just chat.” They should:
- Post a short kickoff message when they start a task.
- Post updates only at milestones / blockers / completion.
- When done: post a completion summary + links to artifacts.

We treat tasks as canonical progress, and War Room as the human-readable summary stream.


Offline delivery pattern (critical for reliability)
To avoid requiring VPN/direct access:
- Dashboard writes a “delivery request” row (queue) when a message needs to reach an agent.
- A worker on the executor polls that table, delivers via the runtime, then writes back success/failure.

This gives you:
- no client VPN requirement
- resilient retries
- audit trail of delivery


Endpoints (conceptual)
If you use a control API layer (recommended), your UI never needs service keys.

- POST /api/chat/post
  { project_id, author, message, thread_id?, message_type?, metadata? }

- (optional) POST /api/chat/deliver
  { project_id, target_agent_key, message }
  -> if offline, enqueue


Component inventory (what your dashboard needs)
1) War Room page
- message list (realtime)
- composer
- thread viewer (optional)

2) Mention / routing helpers (optional)
- @agent:pm style tags
- “Send to agent” control (if you support it)

3) Delivery worker status
- show queue backlog + failures (so you can trust it)


Integration with Tasks (recommended)
Best practice:
- War Room messages link to a task_id when relevant.
- Task completion posts to War Room automatically (summary + artifacts).


What to copy exactly (if you want agent-hub parity)
- One project-level chat stream (“War Room”).
- Reliable delivery queue when runtime offline.
- Canonical progress in task timelines; War Room is the readable layer.


Common failure modes + fixes
- Messages feel delayed -> delivery queue worker isn’t running or runtime unreachable.
- Agents spam chat -> enforce “milestone-only” rule + make task updates canonical.
- Hard to find context -> pin 3–7 canonical docs + per-task retrieval.


If you want to build a minimal v1
- Implement messages table + realtime subscription + a composer.
- Add delivery queue only once you need offline support.
- Add threads later.
