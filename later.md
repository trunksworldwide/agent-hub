# later.md

Future ideas / backlog for ClawdOS.

## UX / UI
- Drag-to-reorder agents in the left sidebar.
- Each agent has a unique emoji + color theme.
- Animations for agents actively working (subtle glowing beam/halo around the agent card).
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

Notes
- Keep v1 minimal and stable; add these once the core wiring (files, sessions, cron, skills, restart/reload) is solid.
