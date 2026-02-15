Front Office — Mission + Overview

Mission (short)
- Run Mission Control: build, operate, and continuously improve an OpenClaw-based agent system that can spin up and run many business projects safely, fast, and transparently.

Overview (long)
This “Front Office” project is the home base for operations between Zack and Trunks.

What we use it for
- The operating playbooks (how projects get created, how agents work, how approvals work)
- The system map (what services exist, how data flows)
- The templates (project setup, agent briefs, task assignment)
- The standards (what “done” means, where outputs go, how we log failures)

What success looks like
- Zack can text Trunks to:
  - create a project
  - provision agents
  - create/assign tasks
  - ingest/search knowledge
  - upload artifacts
  - and get back clear status updates
- Agents reliably:
  - search knowledge before acting
  - post progress to task threads
  - upload artifacts to Drive and link them
  - ask for approval before external actions
- The dashboard is trustworthy:
  - Live mode when Control API is reachable
  - Backup mode when offline, with clear staleness warnings
  - Drift is detected and reported

Non-negotiable policies
- External side effects require explicit approval (outreach sending, publishing, spending money, account changes, sensitive logins).
- Work must be visible: if it matters, it lives in task threads + Drive links.
- Prefer small agent teams and scale only when coordination is stable.

Where to look
- FRONT-OFFICE-OPERATIONS.md — process map + command reference
- PROJECT-STARTER-CHECKLIST.md — runbook for new projects
- PROJECT-SETUP-REPORT-TEMPLATE.md — adaptive “meta layer” per project
- BUSINESS-PROFILES.md — how we optimize per business type
- AGENT-BRIEF-TEMPLATE.md and TASK-ASSIGNMENT-TEMPLATE.md — consistent agent tasking
