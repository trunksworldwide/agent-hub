Skills Catalog (Front Office)

Purpose
A simple, human-readable list of what skills/capabilities our OpenClaw setup supports, what each one is good for, and when to use it.

This is not the source of truth for what’s installed.
- Source of truth: `openclaw skills list --json` (and the dashboard Skills view).
- This doc is the “operator + agent cheat sheet.”

How to use this
- When starting a project: assume the Default Skills are available.
- When a task needs something special: consult Optional Skills.
- If a tool isn’t listed: create a “Tool Attach” or “Skill Request” task.


Default Skills (assume for every project)

1) agent-browser (web UI automation)
What it does
- Operates web apps like a human: open pages, click buttons, fill forms, read page text, take screenshots.

When to use
- Lovable builds, CRMs, admin dashboards, web research that needs clicking.

Best practice
- Use persistent browser profiles for “operator agents” so logins persist.
- Use screenshots + iteration loops for design tasks.


2) Knowledge (ingest + search)
What it does
- Stores project notes/sources and makes them searchable for agents.

When to use
- Any time an agent needs context, prior decisions, or source material.

Best practice
- Keep a small set of pinned “canonical” docs.
- Everything else should be retrieved per task (don’t bloat context packs).


3) Drive spine (artifact storage)
What it does
- Uploads artifacts (docs/exports/specs) to the project’s Google Drive folder spine.

When to use
- Any output that matters: specs, scripts, lists, reports, screenshots.

Best practice
- Always link the Drive artifact back into the task timeline.


4) Mission Control bridges (Control API endpoints)
What it does
- Lets agents operate the dashboard without having Supabase keys.

When to use
- Posting progress (task events), proposing tasks, posting to war room, uploading artifacts.

Best practice
- Tasks are canonical progress; war room is for readable updates.


Optional Skills (project-dependent)

5) peekaboo (macOS screen + app automation)
What it does
- Sees the macOS screen and can click/type in native apps.

When to use
- Claude Desktop, native Mac apps, anything not in a browser.

Requirements
- macOS permissions: Screen Recording + Accessibility.

Operating model
- Usually one “Desktop Operator” agent owns the desktop to avoid mouse fights.


6) openai-whisper / openai-whisper-api (speech-to-text)
What it does
- Transcribes audio to text.

When to use
- Podcasts, voice notes, meeting clips.


7) video-frames (ffmpeg helpers)
What it does
- Extracts frames/clips from video.

When to use
- Clipping farm workflows.


8) sag (ElevenLabs voice)
What it does
- Produces MP3 voice output.

When to use
- Voice-only briefings (when requested), audio summaries.


9) github (gh)
What it does
- Operates GitHub issues/PRs/runs.

When to use
- Repo maintenance, CI checks, PR hygiene.


10) things-mac / apple-reminders / apple-notes (personal productivity)
What it does
- Writes to your personal task/note systems.

When to use
- Personal OS workflows (optional; only if you want it integrated).


What if a skill is missing?
- Create a task: “Skill request: <name>” with what it unlocks + what tool it targets.
- Trunks installs/configures it on the Mac mini.
- Then we add it to this catalog.
