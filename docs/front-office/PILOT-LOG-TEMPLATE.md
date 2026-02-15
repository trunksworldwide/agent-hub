Pilot Log Template (copy into a new pilot project)

Goal
- Run a short, controlled pilot to find real failures fast.

Rules
- Frequent check-ins.
- Log every failure, even if it gets fixed in 30 seconds.
- At the end: summarize failure types and the permanent fixes.

Daily cadence
- Morning: run health + drift report
- Midday: check queue + tasks
- Evening: brief summary

Failure log format
Entry:
- Timestamp:
- What broke (one sentence):
- Impact (what it prevented):
- Root cause (best guess):
- Fix applied (what we changed):
- Prevent recurrence (what guardrail/test we add):
- Link(s): task link, commit hash, Drive artifact, screenshots

Metrics to track (simple)
- Count of failures by type:
  - Control API offline
  - Mirror stale/drift
  - Agent didn’t use the system (missed endpoint/contract)
  - Task timeline not updated
  - Drive upload failed
  - Knowledge ingest/search failed
  - Auth/login blocked
  - Cost/runaway behavior
