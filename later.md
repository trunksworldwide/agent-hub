# later.md

Future ideas / backlog for ClawdOS.

## UX / UI
- Drag-to-reorder agents in the left sidebar.
- Each agent has a unique emoji + color theme.
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

## Efficiency audits
- Connect a model/API (e.g., ChatGPT/OpenAI) for periodic efficiency reviews:
  - find bottlenecks
  - suggest missing automations
  - highlight low-ROI work

Notes
- Keep v1 minimal and stable; add these once the core wiring (files, sessions, cron, skills, restart/reload) is solid.
