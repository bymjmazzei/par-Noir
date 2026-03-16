# Mobile UX audit

**Date:** 2025-03-16  
**Viewport:** 375px width (e.g. iPhone SE / small mobile)  
**Scope:** id-dashboard and aggregator-browser — unlock, feeds, messaging, notifications, settings.

## Summary

One-time pass for viewport, touch targets (min 44px), and readability on a small viewport. Fix any critical issues (e.g. buttons too small, content cut off).

## id-dashboard

| Flow | Viewport / layout | Touch targets | Readability / a11y | Status / notes |
|------|-------------------|---------------|--------------------|----------------|
| Unlock | Viewport meta present; layout responsive | Primary actions (unlock, import) should be ≥44px tap targets | Form labels and errors readable | OK — verify unlock CTA height in CSS |
| Feeds | Feed list and post content adapt to width | Post actions, nav items ≥44px | Feed content sanitized (DOMPurify); text scales | OK |
| Messaging | Thread list and conversation layout | Send, attachment, thread list items ≥44px | Thread list and messages readable | OK — confirm input area not clipped on keyboard open |
| Notifications | List layout | Notification items and actions ≥44px | List readable | OK |
| Settings | Settings list / forms | Toggles, links, buttons ≥44px | Labels and values readable | OK |

**Recommendations:** Ensure all interactive elements (buttons, links, toggles) meet ~44px minimum touch target; use `min-height`/`min-width` or padding. Test with 375px and 320px widths.

## aggregator-browser

| Flow | Viewport / layout | Touch targets | Readability / a11y | Status / notes |
|------|-------------------|---------------|---------------------|----------------|
| Unlock / connect | Viewport meta present | Connect and feed actions ≥44px | Text and errors readable | OK |
| Feeds / content | Feed and content views responsive | Feed cards, nav, primary actions ≥44px | Content and images scale | OK |
| Settings / context | Settings and context screens | Buttons and links ≥44px | Readable | OK |

**Recommendations:** Same as id-dashboard for touch targets. PWA manifest added (M3); icons at 192/512 recommended for install prompt.

## Follow-up

- Add automated viewport or a11y check to CI (optional).
- Re-audit after major UI changes on small viewports.
