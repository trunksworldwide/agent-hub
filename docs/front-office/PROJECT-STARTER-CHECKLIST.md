Project Starter Checklist (Front Office)

Goal
- When Zack says “start a new project,” Trunks runs this checklist top-to-bottom so the project is operational within minutes.
- Outcome: project exists, docs exist, agents are provisioned and know how to operate Mission Control, first tasks exist, and the system begins work with safe approvals.

Inputs (ask Zack only if missing)
- Project name:
- One-line mission:
- Success criteria (1–3 bullets):
- Scope: in / out:
- Constraints: timeline, budget, required tools, compliance:
- Approval policy: what requires explicit approval (default: anything external).
- Source material: links/files/Drive folder:

Step 1 — Create project (dashboard)
- Create project record
- Ensure project workspace exists
- Initialize Drive spine
  - Create folders
  - Create README_SPINE
  - Create CAPABILITIES

Step 2 — Set the two “north star” fields (dashboard)
- Set Project Mission (short)
- Set Project Overview (long)
  - What we are doing
  - Why now
  - Success criteria
  - Scope boundaries
  - Risks
  - How we’ll work (tasks, artifacts, approvals)

Step 3 — Seed the starter docs (minimum set)
Create these first (don’t over-document):
1) PROJECT_OVERVIEW (if not already in the overview field)
2) REQUIREMENTS / SPEC (what must be true)
3) DECISIONS (tiny running log)
4) RUNBOOK (how to run, how to recover)
5) PROJECT_SETUP_REPORT (this is the “meta layer” output; see Step 4C)

Doc prompt to self: “What docs are needed here?”
- If the project is sales/outreach:
  - ICP + positioning
  - Outreach sequences
  - Lead list criteria + sources
- If the project is build/engineering:
  - Architecture sketch
  - API contract
  - Test plan
- If the project is research:
  - Research questions
  - Source list
  - Output format requirements

Step 4 — Configure Knowledge + Skills + Project Design Pass (so the project adapts)

4A) Knowledge (so agents can search)
- Create initial Knowledge items:
  - Paste key context as a note
  - Add top 3–10 URLs
  - Upload any seed files
- Confirm indexing is working:
  - Ingest one short note
  - Search for a keyword from it and verify it returns results

4B) Skills (project-specific tool planning)
- Default assumption: use existing skills first (agent-browser, Drive upload, knowledge ingest/search).
- Create ONE task assigned to the Research agent:
  - “Skills + Specialization Scan (required)”
- Output must be a short, decisive list:
  - Recommended skills/tools (max 3)
  - What each unlocks
  - Setup steps (logins/permissions)
  - Risks/approvals needed
- Trunks is the installer/operator:
  - Research agent recommends.
  - Trunks installs/configures.

4C) Project Design Pass (AI-assisted, async, non-blocking)
Purpose
- This is the “default intelligence layer.” It prevents the template from being too rigid.
- It decides what special agents, skills, and starter docs this specific project needs.

How it runs
- Phase A (must succeed): create project + baseline docs + default agents + first tasks.
- Phase B (best-effort): generate a PROJECT_SETUP_REPORT from the overview.

PROJECT_SETUP_REPORT must include
- Project type profile: Consulting outreach | E-commerce | Content/YouTube | SaaS/Engineering | Personal/CRM
- Agent roster:
  - defaults (Research + PM)
  - execution agents (Builder/QA/Outreach)
  - specializations (e.g., Shopify Operator, Social Researcher)
- Skills/tools recommendations (max 3)
- First 10 tasks (setup/execution/verification)
- Approval policy reminders (external actions)
- System map (text): agent org chart + what each agent owns

Failure behavior
- If any AI/API step fails: project still gets created and runs in “basic mode.”
- Create a task: “Finish Project Design Pass” assigned to the PM agent.

Step 5 — Spawn agents (defaults + specializations)

5A) Default agents (create these for EVERY project)
- Research agent (required): ingests sources, builds context, drafts findings.
- Project Manager agent (recommended default): maintains task hygiene, coordinates agents, runs check-ins, escalates blockers to Trunks.

5B) Execution agents (choose 1–2 based on project type)
- Builder agent: produces artifacts/experiments, ships code/copy.
- QA/Verifier agent: checks outputs, runs smoke tests, catches regressions.

5C) Specialized agents (add only if the project needs it)
Use these examples as a decision tree:
- E-commerce / Shopify
  - Shopify Operator agent: can operate Shopify admin + theme editor + apps via browser automation.
  - Product Research agent: pricing/competitors/positioning reviews, SKU research.
- Consulting / AI services
  - Outreach agent: drafts sequences + target lists. Does NOT send anything without approval.
  - Case Study agent: assembles proof, writes case studies, turns outcomes into collateral.
- SaaS / Engineering-heavy
  - DevOps agent: deploy/runbook/monitoring tasks.
  - Security/Review agent: permissioning, endpoint safety, “what could go wrong” pass.

Team size rule
- Start with: Research + PM + (Builder OR Outreach) as the minimum.
- Don’t exceed 5 agents per project until the pilot proves coordination is stable.

Provisioning rules
- Every agent must have:
  - Role (short)
  - Purpose (long)
  - “How to Operate Mission Control” section in SOUL
  - Explicit approval rules

Step 6 — Generate agent docs + verify they can operate Mission Control
- Trigger agent doc generation (SOUL/USER/MEMORY templates)
- Verify SOUL contains:
  - “How to Operate Mission Control” (endpoints)
  - Approval rules (no external side-effects without approval)
  - “Search knowledge first” behavior
- Verify CAPABILITIES links are present (Drive URLs)
- Verify each agent can post one test comment to a task thread (smoke):
  - create a small task “Agent comms smoke”
  - have each agent post one timeline comment

PM agent operating loop (default)
- Every 60–120 minutes (or on demand):
  - scan tasks by status
  - ensure every active task has a fresh update
  - stop/flag tasks that are stuck or low-value
  - post one short war-room summary
- PM escalates to Trunks if:
  - an external action is needed
  - an auth/login step is blocked
  - knowledge/search/drive/upload is failing

Step 7 — Create the first task stack (10 tasks)
Create tasks in three buckets:
A) Setup tasks (3)
- Verify Drive spine
- Verify knowledge search
- Verify agent posting to task timeline

B) Execution tasks (5)
- The real work: research, outreach drafts, landing page draft, etc.

C) Verification tasks (2)
- Run smoke test
- Review approvals + external-action policy

Every task should include
- Definition of done
- Expected artifacts (what gets uploaded to Drive)
- Owner (assignee agent)
- Approval needed? yes/no

Step 8 — Start the collaboration loop (safe autonomy)

8A) Heartbeat/tick policy (default)
- PM agent: tick every 15 minutes.
- Research/Builder/QA agents: tick every 30 minutes.
- Anti-spam: each tick can post at most 0–2 war-room messages and must prefer task thread updates.

8B) Completion policy (applies to EVERY agent)
When an agent finishes a task:
- Set task status to done.
- Post one final timeline comment:
  - what changed
  - what’s next (if anything)
  - links to Drive artifacts
- If an artifact was produced, upload it to Drive and include the link.
- This should generate an Activity feed entry so Zack can click it without opening the task.

8C) Kickoff message
- Post a War Room kickoff message:
  - Mission
  - Success criteria
  - Who is doing what
  - What needs approval
- Ask agents to:
  - Search knowledge first
  - Comment in their assigned tasks
  - Upload artifacts to Drive and link them

Step 9 — Check-in cadence + logging
- Create a PILOT_LOG doc for the project (copy template)
- Set check-ins:
  - First check-in at +30 minutes
  - Then every 2–4 hours on day 1
- Log every failure:
  - What broke
  - Impact
  - Fix
  - Guardrail/test to prevent recurrence

Optional (when Nano Banana Pro is working)
- Generate a process map diagram for the project
- Generate:
  - business plan outline
  - system map
  - onboarding one-pager

Done criteria (project is “ready”)
- Project mission + overview set
- Drive spine initialized + verified
- Knowledge ingest + search verified
- 3 agents provisioned with correct docs
- First 10 tasks created and assigned
- Agents have posted at least 1 update each in task threads
- Approval policy reiterated in War Room
