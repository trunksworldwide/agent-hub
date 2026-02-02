# later.md

Future ideas / backlog for ClawdOS.

## UX / UI
- Drag-to-reorder agents in the left sidebar.
- Each agent has a unique emoji + color theme.
- Animations for agents actively working (subtle glowing beam/halo around the agent card).
- AgentProfilePanel (Dashboard): clicking an agent opens a right-side panel with profile + status + what they’re working on (agentprofilepanel.tsx).
- Subtle, “alive” animations (page transitions, hover states, status pulses).

## Chat inside ClawdOS
- Add a right-side chat panel to talk to Trunks directly (like iMessage).
- Ability to call agents/actions from the chat.

## Scheduling + transparency
- When viewing an agent, show all scheduled tasks for that agent.
- Expose the prompt/instructions behind each scheduled task.

## Shared context
- Add a global "Purpose" / "North Star" prompt that all agents reference.
- Add a global project status file (where we are + what’s next) for alignment.

## Agent lifecycle
- Add “+” button to spawn a new agent profile.
- Add delete/archive for agent profiles.
- New Project flow:
  - Clicking “New Project” creates a workspace from a template (README/STATUS/PURPOSE/agents/schedules pre-seeded).

## Skill learning / skill manager
- “Learn a skill” flow:
  - Paste a skill bundle (or prompt/markdown) and have the system structure it into a proper AgentSkill folder.
  - Install/enable it for a project or agent.
  - (Optional) run security audit before enabling.

## Efficiency audits
- Connect a model/API (e.g., ChatGPT/OpenAI) for periodic efficiency reviews:
  - find bottlenecks
  - suggest missing automations
  - highlight low-ROI work

## Sharing / marketplaces
- Ability to share an “agent army” (project templates + agent profiles + schedules + skills) with another person’s chief-of-staff Clawdbot.
  - Probably via exporting/importing a signed bundle.
  - Includes compatibility checks + redaction of secrets.

## Front Office project (meta)
- A special highlighted project used to build ClawdOS + improve Trunks.
- UI should show it differently (badge/color) so it’s obvious when you’re editing the admin system itself.

## Updates, safety, and reversibility
- Ability to update the Clawdbot instance from within ClawdOS (ideally without taking the whole system down).
- Undo/rollback for agent actions:
  - Represent each action as an event with enough metadata to revert.
  - Expose “undo” as a feed action when possible.
  - Some actions are inherently irreversible (external posts, deletes); UI should mark reversible vs irreversible.

## Notifications
- Notification bell that shows the most recent 10 activities across projects.
- Clicking an activity opens a detail/log view.
- Agents completing actions should emit activities that drive the bell.

## Documents
- Add a new Manage navbar page: Documents.
- Each project links to a living doc summary (Google Docs or markdown) that tracks changes and status.
- Add a Google Docs integration skill/workflow for per-project summaries.

## UX
- Dashboard should use normal time (not 24h).
- Add a very light textured gradient to the dashboard background.

## Agent creation intelligence
- When creating a new agent in a project:
  - ask for role and purpose
  - generate default soul/user/working context based on project purpose
  - seed agent_status + initial tasks

## Project creation intelligence
- New project flow should capture name + purpose/description.
- Creating a new project auto-creates a PM agent (project manager) that reports to Trunks.

## Task creation flow
- New task flow should feel like assigning an employee:
  - choose assignee agent
  - task prompt/description
  - one-shot vs scheduled
  - if scheduled: create cron job tied to the task

Notes
- Keep v1 minimal and stable; add these once the core wiring (files, tasks, activities, projects, and presence) is solid.
