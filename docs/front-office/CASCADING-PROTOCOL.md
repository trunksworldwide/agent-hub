Cascading Protocol (Task Accuracy System)

Why this exists
LLMs make mistakes when:
- context drifts across multiple steps
- steps start without the required inputs being ready
- nobody validates outputs before the next step runs

Cascading Protocol fixes this by turning work into a gated pipeline:
- every task declares required inputs + expected outputs
- tasks can’t proceed until prior outputs are validated
- every task ends with a self-test + a validation signal

Important note (model safety)
We do NOT require agents to reveal chain-of-thought reasoning. We require:
- structured inputs
- structured outputs
- checks/validation


Core rules

1) Split into small tasks
- Each task should be 1 deliverable.
- If it’s bigger than ~30–90 minutes of work, split it.

2) Every task must declare:
- Required Inputs (what it needs)
- Expected Outputs (what it must produce)
- Self-Test (how it checks itself)

3) Gating
- Task N+1 must verify Task N outputs exist and match the expected shape.
- If missing/invalid: stop and post an UNBLOCK describing what’s missing.

4) Manager role
- PM agent is the “gating manager.”
- Specialists produce outputs; PM validates and starts the next step.


Standard task template (use in every task thread)

Task Header
- Goal:
- Required Inputs:
- Expected Outputs:
- Definition of Done:

Execution
- Work notes (brief):

Self-Test
- Checklist:
  - Output exists and is linked
  - Output matches expected format
  - Numbers/claims have sources
  - Edge cases called out

Validation Signal
- STATUS: READY (or) STATUS: UNBLOCK
- If READY: specify exactly what the next task can now assume.


How to implement in Mission Control (minimal)

Phase 1 (no schema changes)
- Put the template into task descriptions.
- Require completion comments include: Outputs + Self-Test + READY/UNBLOCK.
- PM enforces gating.

Phase 2 (light schema)
Add to tasks:
- required_inputs (text/json)
- expected_outputs (text/json)
- ready (boolean)
- validated_by (agent_key)

Then:
- UI shows a “READY” badge.
- Next tasks can block on ready=true.

Phase 3 (automation)
- When a task is marked complete, system checks:
  - did it attach expected outputs?
  - did it run self-test?
- PM gets a single notification: “Task ready for validation.”


Where this helps most
- Outbound infra (domains/inboxes/warmup/campaign setup)
- Data pipelines (lists → enrich → validate → load)
- Delivery runbooks (install steps + verification)
- Blog/content systems (outline → draft → edit → publish)
