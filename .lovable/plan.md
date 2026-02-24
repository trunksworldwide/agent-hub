

# Two Tweaks: Default Assignee + Watchdog Language

## Tweak 1: Default assignee on "Suggest Task"

**Current behavior:** `defaultAssignee` is set to `msg.targetAgentKey` — the agent the message was *sent to*, which is often null.

**New behavior:** Smart default based on message author:
- If `msg.author` matches an agent key in the agents list → default assignee = that agent (the agent proposed the idea, so they own the work)
- Otherwise (author is "user" or unknown) → default assignee = first agent with role containing "PM", or fallback to the first agent in the list

**File: `src/components/pages/ChatPage.tsx`** (line ~527)

Change the `defaultAssignee` prop on `NewTaskDialog`:
```tsx
defaultAssignee={
  taskFromMessage
    ? agents.find(a => a.id === taskFromMessage.author)
      ? taskFromMessage.author                          // author is an agent
      : (agents.find(a => a.role?.toLowerCase().includes('pm'))?.id || agents[0]?.id || undefined)  // fallback to PM or first agent
    : undefined
}
```

This is a single-line logic change. No new props or state needed.

---

## Tweak 2: Watchdog language — "NEEDS ATTENTION" + escalation to PM

**Current behavior:** The watchdog already uses "NEEDS ATTENTION" language (confirmed in the code). Two small refinements:

**File: `src/hooks/useStaleTaskWatchdog.ts`**

1. **Task thread comment** (line 53): Update message to match exact requested wording:
   - From: `⚠️ NEEDS ATTENTION: No agent activity in 30 minutes`
   - To: `⚠️ STATUS: NEEDS ATTENTION — no activity in 30m. Either reassign or clarify.`

2. **War Room notification** (line 59): Change from notifying the assigned agent to notifying PM (the operator). Remove `targetAgentKey` so the message goes to the general War Room channel visible to the PM, not directed at a specific agent:
   - From: `sendChatMessage({ message: '...', targetAgentKey: task.assigneeAgentKey || undefined })`
   - To: `sendChatMessage({ message: '⚠️ Stale task: "{title}" (assigned to {agent name}) — no activity in 30m. Reassign or clarify.' })` — no `targetAgentKey`, so it surfaces in War Room for the PM.

---

## Files touched

| File | Change |
|------|--------|
| `src/components/pages/ChatPage.tsx` | Smart default assignee logic (1 line) |
| `src/hooks/useStaleTaskWatchdog.ts` | Updated comment wording + War Room notification targets PM |
| `changes.md` | Log the tweaks |

## What stays the same
- 5-minute poll interval, 30-minute threshold — unchanged
- "Started" event fires immediately on entering in_progress — already implemented
- No schema changes
- All existing flows preserved

