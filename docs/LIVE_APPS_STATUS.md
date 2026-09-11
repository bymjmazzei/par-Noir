# Live apps status (deep flow map)

Generated 2026-09-09 from Playwright deep walk (`.local/ux-playwright/deep-flow-report.json` + code correlation).
Harness: [`apps/aggregator-browser/scripts/ux-deep-flow-map.mjs`](../apps/aggregator-browser/scripts/ux-deep-flow-map.mjs)

Labels: `LIVE_REAL` | `LIVE_MOCK` | `LIVE_UNFINISHED` | `BLOCKED` | `NEEDS_USER_REVIEW` | `KEEP_SCAFFOLD`
Evidence: **OBSERVED** (this pass) vs **INFERRED** (imports/package).

**No deletes in this pass.** Ambiguous items → [`NEEDS_USER_REVIEW.md`](NEEDS_USER_REVIEW.md).

---

## Summary by app

| App | Unlocked | Flows walked | Labels |
|---|---|---|---|
| dashboard | yes | 10 | BLOCKED:1, LIVE_REAL:7, LIVE_UNFINISHED:2 |
| browse | yes | 11 | BLOCKED:1, LIVE_REAL:9, LIVE_UNFINISHED:1 |
| messaging | yes | 6 | BLOCKED:1, LIVE_REAL:2, LIVE_UNFINISHED:3 |
| prism | yes | 4 | BLOCKED:2, LIVE_REAL:1, LIVE_UNFINISHED:1 |
| licensing | yes | 3 | BLOCKED:1, LIVE_REAL:2 |
| developer | yes | 9 | BLOCKED:1, LIVE_REAL:7, NEEDS_USER_REVIEW:1 |

---

## dashboard (`https://pn.parnoir.com/`)

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Unlock gate cleared | LIVE_REAL | OBSERVED | POST /oauth/authorize/authenticate (200) | App/UnlockGate.tsx, hooks/useAuthUnlockHandlers.ts | — |
| Privacy & Sharing | LIVE_REAL | OBSERVED | GET /api/devices/pn-87f49f0fb345/registry (200), GET /api/recovery/pn-87f49f0fb345/failsafe (200), GET /api/storage/pn-87f49f0fb345/layout/status (200) +2 more | AuthenticatedShell.tsx → PrivacyDataPointsPanel | — |
| Verify / identity verification modal (open only) | LIVE_UNFINISHED | OBSERVED | GET /api/storage/credentials/pn-87f49f0fb345 (200) | IdentityVerificationModal.tsx | — |
| Sub-pN | LIVE_REAL | OBSERVED | GET /api/storage/cloud-vault/pn-87f49f0fb345 (200), PUT /api/storage/cloud-vault/pn-87f49f0fb345 (200), GET /api/storage/pn-87f49f0fb345/layout/status (200) +3 more | components/subpn/SubPnTab.tsx | — |
| Delegation | LIVE_REAL | OBSERVED | GET /api/storage/accounts/pn-87f49f0fb345 (200), GET /api/storage/accounts/pn-87f49f0fb345 (200), GET /api/storage/pn-87f49f0fb345/layout/status (200) +2 more | DelegationModal / AuthenticatedShell | — |
| Recovery Tool | LIVE_REAL | OBSERVED | — | components/recovery/RecoveryTab.tsx | — |
| Storage | LIVE_REAL | OBSERVED | GET /api/users/pn-87f49f0fb345/data-point-requests (200) | components/storage/FileStorageAggregator.tsx | — |
| Monetization | LIVE_UNFINISHED | OBSERVED | — | components/monetization/MonetizationTab.tsx | — |
| Export affordance visible | BLOCKED | OBSERVED | — | ExportAuthModal / Header export | entry control not found or not clickable |
| Lock control | LIVE_REAL | OBSERVED | — | AuthenticatedShell / Header | — |

---

## browse (`https://browse.parnoir.com/?view=feed`)

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Feed rail DISCOVER | LIVE_REAL | OBSERVED | — | components/FeedRail.tsx | — |
| Feed rail MEDIA | LIVE_REAL | OBSERVED | GET /api/users/pn-87f49f0fb345/tag-preferences (200) | components/FeedRail.tsx | — |
| Feed rail THOUGHTS | LIVE_REAL | OBSERVED | POST /api/profile/ml-kem-public-key (200) | components/FeedRail.tsx | — |
| Feed rail COLLECTIONS | LIVE_REAL | OBSERVED | — | components/FeedRail.tsx | — |
| Bottom nav Home | LIVE_REAL | OBSERVED | — | BottomNav.tsx | — |
| Bottom nav Search | LIVE_UNFINISHED | OBSERVED | — | SearchPage.tsx | — |
| Bottom nav Upload (open only) | LIVE_REAL | OBSERVED | GET /api/v1/music/registry/catalog (200) | UploadPage.tsx / UploadModal.tsx | — |
| Bottom nav Inbox | LIVE_REAL | OBSERVED | GET /api/storage/pn-87f49f0fb345/layout/status (200), GET /api/drive/files (200), GET /api/storage/pn-87f49f0fb345/layout/status (200) | MessagesPage.tsx / Inbox.tsx | — |
| Bottom nav Me | LIVE_REAL | OBSERVED | GET /api/aggregator/metadata-index/1D_Ey5ESOD2OsX9f35dy9O7mS_THLrmyb (404), GET /api/aggregator/metadata-index/1mgUxk0dOrkBndHg2NjWcLsJv8Q8hvkbc (404) | MePage.tsx | — |
| Engagement sidebar / like affordance | LIVE_UNFINISHED | OBSERVED | — | FeedEngagementSidebar / ProfileActionMenu | DISCOVER empty (“no public files”); Me `?creator=` empty profile **has** engagement chrome + Connect in Profile actions |
| Profile Connect via `?creator=` | LIVE_REAL | OBSERVED | POST /api/connections/request (200); toast “Connection request sent!” | MePage empty + ProfileActionMenu | test-pn → test-pn-2; no public post required if pn id known |
| Lock pN | LIVE_REAL | OBSERVED | — | LockButtonWithContext.tsx | — |

---

## messaging (`https://messaging.parnoir.com/`)

**Follow-up QA (2026-09-09 evening + post-implement harness):** dual-pN via known `?creator=` URL.  
Harness / report: [`apps/aggregator-browser/scripts/ux-messaging-qa.mjs`](../apps/aggregator-browser/scripts/ux-messaging-qa.mjs) → `.local/ux-playwright/messaging-qa/messaging-qa-report.json`

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Unlock + OAuth session | LIVE_REAL | OBSERVED (2026-09-10) | POST /oauth/token (200), GET /oauth/userinfo (200) | OAuth consent + pnOAuthService | both fixtures; headed dual-window |
| Cloud signed-in on messaging origin | LIVE_REAL | OBSERVED (2026-09-10 dual-DM deploy) | Unlock → no linkedInactive banner; `X-PN-Cloud-Access-Token` on API; gate `LIVE_REAL` for A+B | ConnectionHealthBanner / vault hydrate | Prior reCAPTCHA/429 path cleared for these fixtures in headed run |
| Messages / Requests / Connections tabs | LIVE_REAL | OBSERVED | conversations/requests/pending/connections often 200 after bootstrap | Inbox / RequestsList / ConnectionsPanel | Drain-on-open shipped |
| Notifications | LIVE_UNFINISHED | OBSERVED | Notifications tab sometimes never hits `/api/notifications` in silo harness (non-blocking for dual-DM) | notificationService | Softened harness gate; not dual-DM blocker |
| A→B connection request (`?creator=`) | LIVE_REAL | OBSERVED | POST /api/connections/request **200** when fresh; stale **Pending** UI without re-POST is a false green | ProfileActionMenu Connect | Harness now cancels pending_sent then re-POSTs |
| B accept pending | LIVE_REAL | OBSERVED (post-mailbox fix) | Accept `POST 200` after soft drain; Case A mailbox now lists `connection_request` when `messages.read` | RequestsList + mailboxRoutes | Prior Case A capability gap fixed in `9ff4338b` |
| Compose / send / offline outbox | BLOCKED | OBSERVED | A's Messages empty after Accept; `apply-inbound connection_accept` **400** (`connectionId` missing — job only had `requestId`) and apply never materializes requester inbox/conversation | connectionRoutes apply-inbound | **Fix ready locally** (enqueue `connectionId` + requester inbox on apply); needs API deploy then re-QA |
| dual_dm_success (A send + B receive marker) | BLOCKED | OBSERVED | Accept works; compose not found until requester half of Accept lands in A's Drive | ux-messaging-qa.mjs | Persistent Chromium CDP reuse OK; blocked on API ship |

**Offline queues:** not exercised — blocked on A compose after Accept.

**Dual-DM path (2026-09-11):** Accept proven LIVE_REAL. Remaining product bug: `connection_accept` mailbox job omitted `connectionId` in payload (only `requestId`) → apply 400; even with id, apply did not create requester conversation/inbox (comment claimed device would; handler never did). Local fix in `connectionRoutes.ts` + harness DM open via Messages threads. **Ship API to Railway, then headed `PN_QA_HEADLESS=0` reuse run.**

---

## prism (`https://prism.parnoir.com/`)

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Prism shell after unlock | LIVE_REAL | OBSERVED | — | apps/prism/src/App.tsx | — |
| Apply / Ray application CTA | BLOCKED | OBSERVED | — | useRayApply.ts | entry control not found or not clickable |
| Queue / Approve / Deny chrome or empty | LIVE_UNFINISHED | OBSERVED | — | RayView.tsx | — |
| Admin seed demo (if visible) | BLOCKED | OBSERVED | — | App.tsx seedDemoQueue | entry control not found or not clickable |

---

## licensing (`https://licensing.parnoir.com/`)

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Licensing shell after unlock | LIVE_REAL | OBSERVED | — | apps/licensing-portal/src/App.tsx | — |
| Track library / Add track | BLOCKED | OBSERVED | — | TrackLibraryPanel.tsx | entry control not found or not clickable |
| Partner inquiry | LIVE_REAL | OBSERVED | — | App.tsx mailto | — |

---

## developer (`https://developers.parnoir.com/`)

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Nav Home | LIVE_REAL | OBSERVED | GET /oauth/userinfo (200), GET /api/developer/api-keys (200), GET /api/developer/oauth-clients (200) | developer-portal route / | — |
| Nav Credentials | LIVE_REAL | OBSERVED | GET /oauth/userinfo (200), GET /api/developer/api-keys (200), GET /api/developer/oauth-clients (200) | developer-portal route /credentials | — |
| Nav Data points | LIVE_REAL | OBSERVED | GET /api/v1/standard-data-points (200), GET /oauth/userinfo (200), GET /api/developer/api-keys (200) +3 more | developer-portal route /data-points | — |
| Nav Guides | LIVE_REAL | OBSERVED | GET /oauth/userinfo (200), GET /api/developer/api-keys (200), GET /api/developer/oauth-clients (200) | developer-portal route /docs | — |
| Nav Layer 5 | LIVE_REAL | OBSERVED | GET /oauth/userinfo (200), GET /api/developer/oauth-clients (200), GET /api/developer/api-keys (200) | developer-portal route /integrate | — |
| Nav API reference | LIVE_REAL | OBSERVED | GET /oauth/userinfo (200), GET /api/developer/oauth-clients (200), GET /api/developer/api-keys (200) | developer-portal route /api-reference | — |
| Nav Proposals | LIVE_REAL | OBSERVED | GET /oauth/userinfo (200), GET /api/developer/api-keys (200), GET /api/developer/oauth-clients (200) +1 more | developer-portal route /proposals | — |
| Platform operator routes (if gated open) | BLOCKED | OBSERVED | GET /api/developer/data-point-proposals (200) | PlatformOperatorGate.tsx | entry control not found or not clickable |
| Session stack note (identity-sdk) | NEEDS_USER_REVIEW | INFERRED | — | PortalContext.tsx → @identity-protocol/identity-sdk | Unlock REAL via OAuth; PortalContext still depends on identity-sdk → identity-core |
