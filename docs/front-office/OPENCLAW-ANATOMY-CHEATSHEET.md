OpenClaw Anatomy (Cheat Sheet)

Purpose
A simple map of the “files and knobs” that make an OpenClaw agent predictable.

SOUL.md
- What it is: The agent’s personality + behavior + boundaries.
- What goes here: operating principles, approvals policy, tone, how to report progress.

IDENTITY.md
- What it is: The agent’s name/role/avatar identity.
- What goes here: short identity facts that should not drift.

USER.md
- What it is: Who the agent is helping (preferences, timezone, formatting).
- What goes here: operator preferences, style rules, constraints.

AGENTS.md
- What it is: The “company handbook” / operating instructions.
- What goes here: universal rules like “check TOOLS before saying you can’t,” where to store outcomes, what ‘done’ looks like.

TOOLS.md
- What it is: Environment-specific notes (apps, websites, APIs, device names).
- What goes here: local setup details, which tool owns what, where logins live, preferred voices.

MEMORY.md
- What it is: Durable long-term memory.
- What goes here: decisions, lessons learned, where things were saved, repeatable runbooks.

SKILLS.md
- What it is: A human-friendly “how to do things” guide.
- What goes here: playbooks per capability/tool (browser ops, drive upload, clip pipeline, etc.).

HEARTBEAT.md
- What it is: The periodic check-in instructions (what to do when nudged).
- What goes here: lightweight recurring checks (inbox, blockers, daily digests).

Cron jobs
- What it is: Scheduled “wake up and do X at time Y.”
- What goes here: recurring reminders and automated audits/digests.

Rules of thumb
- SOUL/USER = how to behave.
- AGENTS/TOOLS/SKILLS = how to operate.
- MEMORY = what we learned + where it lives.
- Heartbeat/cron = when to wake up.
