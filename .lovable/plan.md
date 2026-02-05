

# Activity Page Rework: Clean, AI-Summarized Activity Feed

## Overview

Rework the Activity page to show quick, clean, non-technical summaries of completed work. Each activity will display:
- **What** happened (human-friendly summary)
- **When** it happened (relative time)
- **Who** did it (agent name with emoji)

AI summaries will be generated via OpenAI's API through a Supabase edge function, and the API key will be stored securely as a Supabase secret for platform-wide use.

---

## Changes Summary

### 1. Store OpenAI API Key as Supabase Secret

The OpenAI API key will be stored as a Supabase secret named `OPENAI_API_KEY`. This makes it:
- Secure (not in codebase)
- Available to all edge functions
- Reusable across the platform for text generation, summarization, and other AI features

### 2. Create Edge Function: `summarize-activity`

A new edge function that takes raw activity messages and returns human-friendly summaries using OpenAI's API.

**Location:** `supabase/functions/summarize-activity/index.ts`

**Behavior:**
- Accepts an array of activity items (id, type, message, actor)
- Sends them to OpenAI with a prompt asking for simple, non-technical summaries
- Returns the summaries keyed by activity ID
- Handles rate limits (429) and payment errors (402) gracefully

**Prompt Strategy:**
```
You are summarizing system activity for a non-technical user.
Convert technical activity logs into simple, friendly summaries.
Examples:
- "task_moved: Moved 'Fix login bug' → in_progress" → "Started working on 'Fix login bug'"
- "cron_run_requested: Requested cron run: daily-summary" → "Ran the daily summary job"
- "agent_created: Created agent researcher" → "Added a new team member: Researcher"
Keep summaries under 15 words. Be casual and clear.
```

### 3. Simplify ActivityPage UI

**File:** `src/components/pages/ActivityPage.tsx`

**Changes:**
- Remove the type filter dropdown and type badge (too technical)
- Remove the "Show details" expandable section (not needed for clean view)
- Keep only: summary, agent name/emoji, and relative time
- Add AI summary generation on load (batch unsummarized items)
- Cache generated summaries locally to avoid re-generating

**New UI Layout (per activity card):**
```
+-----------------------------------------------+
| Started working on "Fix login bug"      2m ago |
| 🤖 Trunks                                      |
+-----------------------------------------------+
```

### 4. Agent Name Resolution

Activities show `actor_agent_key` like `agent:main:main`. We need to resolve this to the agent's display name and emoji.

**Approach:**
- Fetch agents list on page load
- Build a lookup map: `agent_key → { name, emoji }`
- Display: `{emoji} {name}` for each activity's author

### 5. Optional: Persist AI Summaries to Database

For efficiency, after generating summaries, we could update the `activities.summary` column in the database. This avoids regenerating summaries on every page load.

**Implementation:**
- After AI generates summaries, upsert them to the `activities` table
- On next load, activities with `summary` column populated skip AI generation

---

## Technical Implementation

### Phase 1: API Key Setup

Store the OpenAI API key as a Supabase secret:
- Secret name: `OPENAI_API_KEY`
- Value: The key provided by the user

### Phase 2: Edge Function

**File:** `supabase/functions/summarize-activity/index.ts`

```typescript
// Accepts: { activities: [{ id, type, message, actor }] }
// Returns: { summaries: { [id]: "Human-friendly summary" } }

// Uses OPENAI_API_KEY from environment
// Model: gpt-4o-mini (fast, cheap, good for summarization)
// Batches up to 20 activities per request
```

### Phase 3: Frontend Changes

**File:** `src/components/pages/ActivityPage.tsx`

1. Add state for agents map (for name/emoji lookup)
2. Add state for AI-generated summaries
3. On load, fetch activities and agents in parallel
4. Identify activities without summaries
5. Call edge function to generate summaries (batched)
6. Render clean cards with summary, time, and agent info

**New Card Structure:**
```tsx
<div className="p-3 rounded-lg border bg-card">
  <div className="flex items-start justify-between">
    <div className="text-sm">{summary}</div>
    <div className="text-xs text-muted-foreground">{relativeTime}</div>
  </div>
  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
    <span>{agentEmoji}</span>
    <span>{agentName}</span>
  </div>
</div>
```

### Phase 4: Summary Persistence (Optional Enhancement)

After generating summaries, update the database:
```typescript
// In edge function or client-side
await supabase
  .from('activities')
  .update({ summary: generatedSummary })
  .eq('id', activityId);
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| (Supabase Secret) | Add | `OPENAI_API_KEY` secret |
| `supabase/functions/summarize-activity/index.ts` | Create | Edge function for AI summarization |
| `src/components/pages/ActivityPage.tsx` | Edit | Simplify UI, add agent resolution, call AI summaries |
| `src/lib/activity-summary.ts` | Edit | Add fallback templates for when AI is unavailable |
| `supabase/config.toml` | Edit | Register new edge function |

---

## UI Before vs After

**Before:**
- Shows technical type badges (task_moved, cron_run_requested)
- Shows raw messages with expandable details
- Complex filter dropdowns
- Author shown as technical key (main, ui)

**After:**
- Clean, simple summaries ("Started working on 'Fix login bug'")
- Agent shown with emoji and name (🤖 Trunks)
- Just a search box for filtering
- Relative time (2m ago, 1h ago)
- No technical jargon visible

---

## Edge Cases Handled

1. **AI unavailable:** Fall back to existing template-based summaries
2. **Rate limits (429):** Show toast, use fallback summaries
3. **No agents configured:** Show "Unknown" for author
4. **Empty activity feed:** Show "No activity yet" message
5. **Loading state:** Show skeleton cards while fetching

---

## Security Notes

- OpenAI API key stored as Supabase secret (never exposed to client)
- Edge function authenticates with Supabase's built-in auth
- Activity data stays within the project scope (RLS enforced)

