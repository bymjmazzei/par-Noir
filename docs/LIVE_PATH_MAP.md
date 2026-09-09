# Live path map + CLEANUP FREEZE

**Authority:** this file + [`LIVE_APPS_STATUS.md`](LIVE_APPS_STATUS.md) + [`NEEDS_USER_REVIEW.md`](NEEDS_USER_REVIEW.md).
**Deep walk:** [`scripts/ux-deep-flow-map.mjs`](../scripts/ux-deep-flow-map.mjs) → `.local/ux-playwright/deep-flow-report.json`.

---

## CLEANUP FREEZE

Do **not** delete without Playwright evidence + explicit user approval.

| App | URL | Deep walk |
|---|---|---|
| dashboard | https://pn.parnoir.com/ | unlocked=True flows=10 |
| browse | https://browse.parnoir.com/?view=feed | unlocked=True flows=11 |
| messaging | https://messaging.parnoir.com/ | unlocked=True flows=6 |
| prism | https://prism.parnoir.com/ | unlocked=True flows=4 |
| licensing | https://licensing.parnoir.com/ | unlocked=True flows=3 |
| developer | https://developers.parnoir.com/ | unlocked=True flows=9 |

### Canonical sources

| Surface | Source |
|---|---|
| Dashboard unlock | `UnlockGate.tsx`, `useAuthUnlockHandlers.ts` |
| Dashboard tabs | `AuthenticatedShell.tsx` |
| Browse rail | `FeedRail.tsx` |
| Browse feed | `FullScreenFeed.tsx` |
| Inbox | `Inbox.tsx`, `messageService.ts` |
| Prism | `apps/prism/src/App.tsx` |
| Licensing | `TrackLibraryPanel.tsx` |
| Developer routes | `apps/developer-portal/src/` |

### KEEP_SCAFFOLD

See [`NEEDS_USER_REVIEW.md`](NEEDS_USER_REVIEW.md) and [`SAFE_DELETE_CANDIDATES.md`](SAFE_DELETE_CANDIDATES.md).

---

## Per-flow results

### dashboard
- Unlock gate cleared — **LIVE_REAL**
- Privacy & Sharing — **LIVE_REAL**
- Verify / identity verification modal (open only) — **LIVE_UNFINISHED**
- Sub-pN — **LIVE_REAL**
- Delegation — **LIVE_REAL**
- Recovery Tool — **LIVE_REAL**
- Storage — **LIVE_REAL**
- Monetization — **LIVE_UNFINISHED**
- Export affordance visible — **BLOCKED**
- Lock control — **LIVE_REAL**

### browse
- Feed rail DISCOVER — **LIVE_REAL**
- Feed rail MEDIA — **LIVE_REAL**
- Feed rail THOUGHTS — **LIVE_REAL**
- Feed rail COLLECTIONS — **LIVE_REAL**
- Bottom nav Home — **LIVE_REAL**
- Bottom nav Search — **LIVE_UNFINISHED**
- Bottom nav Upload (open only) — **LIVE_REAL**
- Bottom nav Inbox — **LIVE_REAL**
- Bottom nav Me — **LIVE_REAL**
- Engagement sidebar / like affordance — **BLOCKED**
- Lock pN — **LIVE_REAL**

### messaging
- Messages — **LIVE_UNFINISHED**
- Notifications — **LIVE_UNFINISHED**
- Requests — **LIVE_UNFINISHED**
- Connections — **LIVE_REAL**
- New group modal (open only) — **BLOCKED**
- Lock pN — **LIVE_REAL**

### prism
- Prism shell after unlock — **LIVE_REAL**
- Apply / Ray application CTA — **BLOCKED**
- Queue / Approve / Deny chrome or empty — **LIVE_UNFINISHED**
- Admin seed demo (if visible) — **BLOCKED**

### licensing
- Licensing shell after unlock — **LIVE_REAL**
- Track library / Add track — **BLOCKED**
- Partner inquiry — **LIVE_REAL**

### developer
- Nav Home — **LIVE_REAL**
- Nav Credentials — **LIVE_REAL**
- Nav Data points — **LIVE_REAL**
- Nav Guides — **LIVE_REAL**
- Nav Layer 5 — **LIVE_REAL**
- Nav API reference — **LIVE_REAL**
- Nav Proposals — **LIVE_REAL**
- Platform operator routes (if gated open) — **BLOCKED**
- Session stack note (identity-sdk) — **NEEDS_USER_REVIEW**
