Tool Attach Checklist (Front Office)

Purpose
Add a new paid tool / SaaS UI (CRM, Lovable, Higgs Field, etc.) to an existing project or agent AFTER provisioning.

This avoids guessing tools during provisioning while keeping setup consistent and safe.

When to use
- Zack says: “Have agent X operate <tool>”
- A task requires a tool UI login
- The agent is blocked because it cannot access a required system

Inputs (fill fast)
- Tool name:
- Tool URL(s):
- Which project:
- Which agent(s) will operate it (usually 1 owner):
- What the agent should do in the tool (top 3 workflows):
- Approval boundary (what requires Zack approval):
- Login method: email/pass | Google OAuth | magic link | SSO
- 2FA: none | SMS | authenticator | email
- Account/seat notes (which user/seat):

Step 1 — Decide integration mode (pick one)
A) API-first (preferred)
- If the tool has a usable API: use it.
- Pros: stable, fast, less brittle.
- Output: record API creds location + endpoints + limits.

B) UI-operator (agent-browser)
- If API is missing/limited: agent operates web UI.
- Pros: works with almost anything.
- Cons: can break with UI changes; needs persistent login.

Step 2 — Assign an “operator owner” agent
- One agent should own one tool whenever possible.
- Avoid multiple agents clicking in the same tool session.

Step 3 — Create/confirm persistent session
- Use a persistent browser profile for the operator agent.
- One-time operator action: Zack completes any interactive login / 2FA.
- Verification: close + reopen the browser session and confirm still logged in.

Step 4 — Add an Operator Playbook to the agent docs (SOUL/USER)
Add a section:
- Tool: <name>
- Allowed actions (safe):
- Requires approval (external side effects):
- Common workflows (step list, short):
- Data handling rules (what not to copy/paste):
- When logged out: post UNBLOCK asking Zack to re-auth.

Step 5 — Add project-level docs if needed (shared)
- If there are shared SOPs, sequences, schemas:
  - store as project Knowledge docs
  - pin only the few canonical ones

Step 6 — Smoke test (must pass)
Pick 1–2 tiny tests:
- “Create a test record” / “Update one field”
- “Export a small list”
- “Find X and confirm Y”
Log evidence in the task thread (screenshot if helpful).

Step 7 — Ongoing maintenance
- If UI changes break automation: open an Incident task + update playbook.
- If the tool session expires: ask Zack to re-auth; do not bypass.

Done criteria
- Agent can access the tool
- Persistent login verified
- Operator playbook exists in agent docs
- One successful smoke test logged in the task timeline
