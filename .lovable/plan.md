

# Fix: Contain DM Chat Panels So They Don't Expand Infinitely

## Problem

When an agent sends a long message, the entire DM panel grows vertically instead of scrolling internally. This pushes the composer off-screen and defeats the purpose of having side-by-side chat panels where you can see recent messages from multiple agents at a glance.

## Root Cause

Two CSS issues in `DMPanel`:

1. The `ScrollArea` (messages area) has `className="flex-1 p-3"` but its flex parent lacks `min-h-0`. In CSS flexbox, flex children default to `min-height: auto`, which means they grow to fit content instead of shrinking and scrolling. Adding `min-h-0` on the flex column container lets `flex-1` actually constrain the height.

2. The auto-scroll ref targets the `ScrollArea` Root element, but Radix ScrollArea scrolls via its internal Viewport. The ref needs to target the Viewport for `scrollTop` to work.

## Changes

### File: `src/components/pages/DMsPage.tsx`

**Change 1 -- DMPanel root container (line 199)**

Add `min-h-0` to the panel's flex-col container so the ScrollArea is height-constrained:

```
// Before
<div className="h-full flex flex-col border-l border-border first:border-l-0">

// After
<div className="h-full flex flex-col min-h-0 border-l border-border first:border-l-0">
```

**Change 2 -- ScrollArea gets min-h-0 (line 216)**

Ensure the ScrollArea itself participates in the flex constraint:

```
// Before
<ScrollArea className="flex-1 p-3" ref={scrollRef}>

// After
<ScrollArea className="flex-1 min-h-0 p-3" ref={scrollRef}>
```

**Change 3 -- Fix auto-scroll to target Viewport**

The `scrollRef` currently points at the Radix `Root` element, but scrolling happens inside the `Viewport` child. Update the auto-scroll effect to find the viewport:

```
// Before
if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

// After
const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
if (viewport) viewport.scrollTop = viewport.scrollHeight;
```

**Change 4 -- DM panels container (line 340)**

Add `h-full` to ensure the panels container fills available space:

```
// Before
<div className="flex-1 overflow-hidden">

// After  
<div className="flex-1 overflow-hidden h-full">
```

### File: `changes.md`

Log: "DM panels: fixed infinite vertical expansion on long messages; panels now scroll internally with fixed header/composer."

## What This Achieves

- Each DM panel stays contained within its allocated space (header + scrollable messages + composer always visible)
- Long messages scroll within the individual panel, not the whole page
- Side-by-side panels remain equally visible so you can compare recent messages from multiple agents
- Auto-scroll to newest message actually works

## No Other Files Changed

This is purely a CSS/layout fix in `DMsPage.tsx`. No new components, no API changes, no database changes.

