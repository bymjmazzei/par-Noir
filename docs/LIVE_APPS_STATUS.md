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
| Engagement sidebar / like affordance | BLOCKED | OBSERVED | GET /api/messages/conversations (200) | FeedEngagementSidebar.tsx | entry control not found or not clickable |
| Lock pN | LIVE_REAL | OBSERVED | — | LockButtonWithContext.tsx | — |

---

## messaging (`https://messaging.parnoir.com/`)

**Follow-up QA (2026-09-09, fixture `.local/test-pn-2`, Drive linked on dashboard):**  
Harness: [`apps/aggregator-browser/scripts/ux-messaging-qa.mjs`](../apps/aggregator-browser/scripts/ux-messaging-qa.mjs) → `.local/ux-playwright/messaging-qa/messaging-qa-report.json`

| Flow | Label | Evidence | API (sample) | Source | Notes |
|---|---|---|---|---|---|
| Unlock + OAuth session | LIVE_REAL | OBSERVED | POST /oauth/token (200), GET /oauth/userinfo (200) | OAuth consent + pnOAuthService | test-pn-2 |
| Post-unlock bootstrap | LIVE_REAL | OBSERVED | GET cloud-vault (200), GET mailbox/route (200), GET mailbox/pending (200), GET messages/conversations (200) | AggregatorCloudReconnectHost / mailbox | Vault **exists**; session still lacks Drive AT |
| Cloud signed-in on device | LIVE_UNFINISHED | OBSERVED | GET /api/connections → **409 cloud_token_required**; banner “linked but not signed in”; **no** “Reconnect cloud storage” dialog for ~18s | ConnectionHealthBanner vs useCloudReconnectGate | Root: accounts cache dropped `socialCloudProvider` → gate can assess `unlinked` and never open prompt. **Local fix** in accountsCacheService + gate + banner CTA (needs deploy to verify on prod) |
| Messages tab | LIVE_REAL | OBSERVED | (empty shell; conversations already 200) | Inbox.tsx | Empty “No messages yet” expected for new pN |
| Notifications | LIVE_UNFINISHED | OBSERVED | GET /api/notifications (**401**) ×2; UI “unauthorized” | notificationService.ts | List/unread/mark/delete omitted Bearer; L5 boundary requires first-party token. **Local fix:** wire `authHeaders()` (needs deploy) |
| Requests | LIVE_REAL | OBSERVED | GET /api/messages/requests (200), GET /api/connections/pending (200) | RequestsList.tsx | — |
| Connections | LIVE_REAL | OBSERVED | GET /api/connections (200) after earlier 409 | ConnectionsPanel.tsx | List UI works; Drive-backed accept/DM still blocked without cloud AT |
| New group | LIVE_REAL | OBSERVED | Button visible (“New group”) | CreateGroupModal.tsx | Earlier deep map missed button (icon-row timing); visible in messaging-qa screenshots |
| Compose / send / offline outbox | BLOCKED | OBSERVED | — | messageService outbox + throughway | No second peer send in this pass; also blocked until cloud AT on device |
| Lock pN | LIVE_REAL | OBSERVED | — | LockButtonWithContext.tsx | — |

**Offline queues:** not exercised end-to-end yet — requires cloud reconnect on messaging origin after the local fixes ship, then dual-pN send (test-pn + test-pn-2).

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
