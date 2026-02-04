

# Fix Light Theme: Remove Dark Mode Override

## Problem Summary

The light theme CSS variables are correctly configured in `src/index.css`, but the app is still showing dark mode because:

1. **`index.html` has `class="dark"` on the HTML element** - This activates the `.dark` CSS override
2. The theme-color meta tag is set to a dark color `#0a0c10`

## Changes Required

### 1. Update `index.html`

Remove `class="dark"` from the `<html>` tag and update the theme-color:

```html
<!-- Before -->
<html lang="en" class="dark">
  <meta name="theme-color" content="#0a0c10" />

<!-- After -->
<html lang="en">
  <meta name="theme-color" content="#ffffff" />
```

### 2. Polish the Sidebar Styling

The sidebar `bg-sidebar` will now correctly use `--sidebar-background: 0 0% 98%` (light gray). However, to match the reference screenshot's cleaner look, we should make a few refinements:

**In `src/components/layout/AppSidebar.tsx`:**
- Change `bg-sidebar` to `bg-white` for a cleaner, pure white sidebar (matching the reference screenshot)
- Add a subtle shadow instead of heavy border for more modern feel

**In `src/components/layout/AppTopBar.tsx`:**
- Ensure the top bar uses `bg-white` for consistency
- Update the project dropdown to use white background with subtle border

### 3. Refine CSS Variables (Optional Polish)

**In `src/index.css`:**
- Consider making `--sidebar-background` pure white (`0 0% 100%`) instead of 98%
- Ensure all light mode variables are optimized for the clean look

## Files to Modify

| File | Changes |
|------|---------|
| `index.html` | Remove `class="dark"`, update theme-color to light |
| `src/components/layout/AppSidebar.tsx` | Use white background, refine styling |
| `src/components/layout/AppTopBar.tsx` | Ensure white background, polish dropdown |
| `src/index.css` | Optional: tweak sidebar-background to pure white |

## Result

After these changes:
- App will display in light mode with white/light gray backgrounds
- Sidebar will be clean white (or very light gray)
- Top bar will match
- All the existing functionality remains intact

