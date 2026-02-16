Zoomed-Out System Model (Front Office)

Purpose
This doc explains the system one layer above the dashboard: what we’re actually running when we “manage agents.”

The big idea
We’re building an operating system for running many projects in parallel.
- The dashboard is the control plane (intent + record).
- OpenClaw on the Mac mini is the execution plane (action + runtime).
- Workers/bridges keep the two consistent.
- Agents are specialized workers that do tasks and report back.

Layer 1: Mission Control OS (what you interact with)
1) Control Plane (Dashboard)
- What it is: the command center + database of record.
- What it does:
  - Stores projects, agents, tasks, docs/knowledge, approvals.
  - Shows live state + history (“what happened, by who, when”).
  - Queues requests when the executor isn’t reachable.
- Mental model: air-traffic control + a ledger.

2) Execution Plane (OpenClaw on the Mac mini)
- What it is: the runtime that actually runs agent sessions and skills.
- What it does:
  - Runs agents and their heartbeats/cron.
  - Runs skills (browser automation, drive uploads, etc.).
  - Executes privileged actions.
- Mental model: the factory floor.

3) Transport + Reconciliation (Workers/Bridges)
- What it is: reliability plumbing between control and execution.
- What it does:
  - Delivers queued actions.
  - Mirrors state (cron, chat delivery, doc sync).
  - Detects drift (“dashboard thinks X, executor has Y”).
  - Retries on timeouts/network blips.
- Mental model: shipping + accounting reconciliation.

4) Agents (Workers)
- What they are: specialized workers.
- What they do:
  - Receive a Context Pack (small stable backbone + retrieved snippets).
  - Execute work (skills/UI/API).
  - Post updates to task timeline + activity feed.
  - Ask for approval before external side effects.
- Mental model: employees with strict reporting rules.

What “managing agents” actually means
At this level you’re not micromanaging prompts — you’re operating a workflow system:
- Define intent: mission + tasks
- Route work: assignments + approvals
- Ensure visibility: timeline + artifacts
- Ensure reliability: queues + drift checks

Layer 2 (one layer ABOVE all of this): Portfolio/Studio OS
This system is really a portfolio operating system for running multiple businesses/projects.

At the portfolio layer, your primitives are:
- Projects = business threads (each with its own mission, knowledge, agents, runbooks)
- Operators = you + Trunks (human governance)
- Policies = approvals, budgets, guardrails, quality bars
- Throughput = how many projects can run without chaos
- Outcomes = shipped artifacts, revenue actions, decisions, learning captured

What changes at the portfolio layer
- You care less about “did the agent click the right button” and more about:
  - What are we shipping this week?
  - Which projects are blocked?
  - What’s the ROI per project?
  - Where are the failure patterns (so we harden the OS)?

How we’ll make the portfolio layer real (future UI ideas)
- A cross-project dashboard: “Mission Control for Mission Control”
  - Active projects, risk flags, approvals pending
  - Weekly objectives, shipped artifacts, operator inbox
  - Reliability metrics (drift, failures, retries)

Key rule
The dashboard is the memory and the source of truth.
OpenClaw is the runtime.
Agents do work only if it becomes visible back in the dashboard.
