

# Plan: Multiple-Choice Reply Buttons for NEEDS ATTENTION

## Overview

When an agent posts a comment containing "STATUS: NEEDS ATTENTION" followed by lines like `A) ...`, `B) ...`, `C) ...`, the timeline renders clickable buttons instead of raw text. One click posts a reply comment in the same thread. No schema changes.

---

## Detection logic

A pure function `parseNeedsAttentionOptions(content: string)` that returns:
- `null` if the message doesn't match
- `{ preamble: string, options: { label: string, text: string }[] }` if it does

Pattern: content includes "NEEDS ATTENTION" (case-insensitive), then scan for lines matching `/^([A-Z])\)\s*(.+)/` — extract letter + text. Must find at least 2 options.

---

## Changes

### `src/components/tasks/TaskTimeline.tsx`

**1. Add `parseNeedsAttentionOptions` helper** (top of file, pure function):

```ts
function parseNeedsAttentionOptions(content: string | null) {
  if (!content || !/needs attention/i.test(content)) return null;
  const lines = content.split('\n');
  const options: { label: string; text: string }[] = [];
  const preambleLines: string[] = [];
  let foundOptions = false;
  for (const line of lines) {
    const match = line.match(/^([A-Z])\)\s*(.+)/);
    if (match) {
      foundOptions = true;
      options.push({ label: match[1], text: match[2].trim() });
    } else if (!foundOptions) {
      preambleLines.push(line);
    }
  }
  if (options.length < 2) return null;
  return { preamble: preambleLines.join('\n').trim(), options };
}
```

**2. Add `onQuickReply` callback prop to `TimelineEntry`**

Pass it down from `TaskTimeline`. The callback:
- Takes `(questionItemId: string, answerText: string)`
- Calls `createTaskEvent({ taskId, eventType: 'comment', content: answerText })` 
- Shows toast on success/failure

**3. Track answered state**

In `TaskTimeline`, derive which NEEDS ATTENTION items have already been answered by scanning the timeline for comments that start with `"Answer:"` and whose `metadata?.reply_to` matches the question's item ID. Also track a local `answeredIds` Set for optimistic UI.

**4. Modify default comment rendering in `TimelineEntry`**

In the default comment branch (line 474), check `parseNeedsAttentionOptions(item.content)`:

- If it returns options, render:
  - The preamble text in an amber-bordered card (similar to approval_request styling)
  - An `AlertTriangle` icon + "Needs Attention" label
  - One `Button` per option: label = `"A"`, tooltip/text = option text. Truncate long text to ~60 chars.
  - A "Custom..." button that toggles a small inline textarea + send button
  - If already answered: show all buttons disabled with an "Answered" badge

- If it returns null, render the normal comment bubble (existing code, unchanged)

**5. Quick reply action**

When an option button is clicked:
- Disable all buttons (set local `sendingId`)
- Post: `createTaskEvent({ taskId, eventType: 'comment', content: 'Answer: {label} — {text}', metadata: { reply_to: item.id } })`
- On success: toast "Reply sent", add to local `answeredIds`
- On failure: toast error, re-enable buttons

Custom reply posts: `Answer: Custom — {typed text}`

---

## UX details

- Buttons are `size="sm"` `variant="outline"`, arranged in a vertical stack (options can be long)
- Each button shows: `A) option text` (truncated)
- "Custom..." opens a 1-line textarea inline, with a small Send button
- After answering, buttons are replaced with a compact "Answered: A — option text" badge
- The answer also appears as a normal comment in the timeline (via realtime subscription)

## What this does NOT change

- No database schema changes
- No changes to `api.ts` — uses existing `createTaskEvent`
- No changes to War Room (task timeline only, as requested)
- No changes to approval flow or any other timeline entry types
- Author on replies uses `'ui'` (existing convention for dashboard user)

## Files touched

| File | Change |
|------|--------|
| `src/components/tasks/TaskTimeline.tsx` | Add parser, quick-reply callback, answered detection, render option buttons in comment entries |
| `changes.md` | Log the feature |

