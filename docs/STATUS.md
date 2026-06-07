# Current Status: par Noir Ecosystem

**Last updated:** 2026-06-07

## Layer 4 — Aggregator Browser (`browse.parnoir.com`, `messaging.parnoir.com`)

### Implemented
- TikTok-style full-screen feed + discovery grid + feed rail
- pN OAuth 2.0 unlock (`PNConnect`, token refresh)
- Engagement (like, comment, share, save) synced via API
- Feed create/subscribe/discover/trending/recommended APIs wired
- Upload via API-only Drive proxy (`FileStorageAggregator`)
- Connections, follow, profiles (`MePage`)
- E2E messaging: 1:1 DMs (ML-KEM v2), group chat (up to 15 members), message requests, **media attachments** (My pN / Shared / Saved / Device picker)
- Notifications (in-app + native push registration)
- NSFW gating with age ZKP
- Copyright reports → Prism queue
- Search over public content metadata

### In progress / gaps
- User search filter (profiles) — placeholder
- Branded feed owner settings UI — partial
- Real-time transport — polling today; Socket.IO client planned
- Orphan components (`BrowseCloud`, `CreatorFeedPage`) — cleanup pending

## Layer 3 — API

### Implemented
- Metadata index, Drive proxy, feeds, engagement, connections, groups, messaging
- pN OAuth, Google token refresh, ZKP data points on Drive
- Prism, DMCA, monetization (Stripe when configured), music registry
- Developer portal APIs (OAuth clients, API keys, proposals)
- Push notifications, activity ledger

### Gaps
- `/api/v1/data-points/*` (API-key integrator fetch) — implementation in progress
- Legacy `POST /api/auth/verify` — deprecated
- Platform paid feed subscriptions — removed (410)

## Layer 2 — Dashboard (`pn.parnoir.com`)

### Implemented
- Self-issued identity create/unlock (`IdentityCrypto`, PQC)
- Google Drive encrypted storage, visibility, feeds metadata
- Custodian recovery UX, ZKP v1/v2 data points, third-party permissions
- Sub-pN / owned assets, Stripe monetization, OAuth inline for API token

### Gaps
- Recovery keys: Shamir vs independent codes — alignment pending
- Identity succession UI, device management tab
- `App.tsx` monolith refactor

## Layer 1 — Identity

**Proof-of-work** in par Noir = user supplies pn name + passcode; the portal runs PQC keygen and encrypts the identity blob (no central issuer, not blockchain mining). See `SHARED_CODE_RULES.md` glossary.

## Authentication

- **Browser / portals:** pN OAuth 2.0 (production)
- **Dashboard:** pn file + pn name + passcode unlock; optional API OAuth after unlock
- **Legacy challenge auth:** not used by current apps
