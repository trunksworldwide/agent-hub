

# Upgrade Skills Page into a Capabilities Manager

## What changes

Transform the Skills tab from a plain list with broken buttons into an interactive capabilities dashboard with rich metadata, a working detail drawer, and a quick "Add Skill" flow.

## Part 1: Expand the Skill data model

The current `Skill` interface is too thin. OpenClaw's `skills list --json` returns much richer metadata (emoji, eligible, missing requirements, source, etc.) that we're currently discarding.

**Expand the `Skill` interface** in `src/lib/api.ts`:

| New field | Type | Purpose |
|-----------|------|---------|
| emoji | string (optional) | Skill icon from SKILL.md frontmatter, fallback to category-based icons |
| eligible | boolean (optional) | Whether all requirements are met |
| disabled | boolean (optional) | Explicitly disabled by config |
| blockedByAllowlist | boolean (optional) | Blocked by skill allowlist |
| missing | object (optional) | `{ bins: string[], env: string[], config: string[], os: string[] }` |
| source | string (optional) | "bundled", "installed", "local" |
| homepage | string (optional) | Link to docs/repo |

**Update the server endpoint** (`server/index.mjs` `/api/skills`) to pass through these fields from the CLI output instead of discarding them.

**Update the mirror table** helpers to store/retrieve the extra fields (add an `extra_json` column or expand individual columns on `skills_mirror`).

---

## Part 2: Redesign Skills list cards

Replace the current uniform cards with status-aware skill cards.

**New card layout per skill:**
- Left: emoji from metadata (fallback: category icon from Lucide, not a generic wrench)
- Center: name, one-line description, source badge ("bundled" / "installed")
- Right: status pill + action button

**Status pills:**
- "Ready" (green) -- eligible and not disabled
- "Needs setup" (amber) -- not eligible, has missing requirements
- "Blocked" (red) -- blocked by allowlist
- "Disabled" (muted) -- explicitly disabled

**Sorting:** Ready first, then Needs setup, then Blocked/Disabled. Alphabetical within each group.

**Timestamps:** Use relative format ("2h ago") via the existing `date-fns` `formatDistanceToNow`.

---

## Part 3: Skill Detail Drawer (make "View" work)

Create a new component `src/components/settings/SkillDetailDrawer.tsx` using the existing `Sheet` component (consistent with how agent details work).

**Drawer contents:**
- **Header:** emoji + skill name + status pill
- **Description section:** full description text
- **Readiness section** (only if not eligible):
  - Missing binaries with suggested install commands in copyable code blocks (e.g. `brew install op`)
  - Missing environment variables with `export VAR=value` snippets
  - Missing config items
  - OS compatibility notes
- **Info section:** source, version, last updated (relative)
- **Footer:** Close button. If not eligible, a "Setup help" link that scrolls to the readiness section.

No "Enable/Disable" or "Remove" buttons unless the backend supports it. Honest UI -- don't promise what isn't wired.

---

## Part 4: Add Skill flow

Add an "Add Skill" button in the Skills page header.

**Add Skill dialog** (`src/components/settings/AddSkillDialog.tsx`):
- Single text input: "Paste a skill name, ClawdHub slug, or git URL"
- Examples shown as placeholder/helper text
- Submit creates a skill install request

**Backend:**
- Add `POST /api/skills/install` to `server/index.mjs`
- Runs `openclaw skill install <identifier>` via `execExecutor`
- Returns success/failure + refreshes the skill list
- If the Control API is unavailable, store the request in a `skill_requests` Supabase table (request queue pattern) for the executor to pick up later

**UI after submit:**
- Shows a brief loading state
- On success: refreshes the skills list, shows a toast
- On failure: shows the error message from the CLI

---

## Part 5: Database changes

**Migration:** Add an `extra_json` JSONB column to `skills_mirror` to store the rich metadata (emoji, eligible, missing, source, etc.) without needing many new columns.

**New table: `skill_requests`** (follows request-queue pattern):

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | text | not null |
| identifier | text | not null (what the user pasted) |
| status | text | "pending" / "running" / "done" / "failed" |
| result_message | text | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

RLS: authenticated users can read/insert for their project.

---

## File summary

| File | Action |
|------|--------|
| `supabase/migrations/...` | Add `extra_json` to `skills_mirror`, create `skill_requests` table |
| `src/lib/api.ts` | Expand `Skill` interface, update mirror helpers, add `installSkill()` function |
| `server/index.mjs` | Pass through rich metadata in `/api/skills`, add `POST /api/skills/install` |
| `src/components/pages/SkillsPage.tsx` | Redesign cards, add sorting, wire View + Add Skill |
| `src/components/settings/SkillDetailDrawer.tsx` | New -- detail drawer with readiness info |
| `src/components/settings/AddSkillDialog.tsx` | New -- paste-to-add dialog |
| `src/integrations/supabase/types.ts` | Update generated types |
| `changes.md` | Log changes |

## What this does NOT change

- Channels page (separate effort)
- Existing Control API fallback logic
- Other server endpoints
- Agent or task flows

