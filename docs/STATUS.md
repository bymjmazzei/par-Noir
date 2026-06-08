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
- E2E messaging: 1:1 DMs (ML-KEM v2), group chat (up to 15 members), message requests, **media attachments** with `mediaMimeType` column + inline preview
- Notifications (in-app + native push registration)
- NSFW gating with age ZKP
- Copyright reports → Prism queue
- Search over public content metadata + **profile search** (`GET /api/profile/search`)
- **Socket.IO** hints for messages/notifications (`useRealtimeSync`; polling reduced when connected)
- Branded feed owner settings via `FeedService.updateFeed` with `creatorDid`

### Remaining polish
- Orphan components (`BrowseCloud`, `CreatorFeedPage`) — cleanup pending
- Platform paid feed subscriptions — removed (410)

## Layer 3 — API

### Implemented
- Metadata index, Drive proxy, feeds, engagement, connections, groups, messaging
- pN OAuth (canonical `pn-` id from **publicKey**), Google token refresh, ZKP data points on Drive
- **`/api/v1/data-points/*`** — API-key integrator request, poll, and fetch
- **Recovery** Drive sheets: custodian roster + recovery requests (`/api/recovery/*`)
- **`POST /api/storage/migrate-volume-id`** — legacy passcode-based id → canonical id
- Prism, DMCA, monetization (Stripe when configured), music registry
- Developer portal APIs (OAuth clients, API keys, proposals)
- Push notifications, activity ledger, realtime `new_notification` events

### Gaps
- Legacy `POST /api/auth/verify` — deprecated
- Production Railway: set `SOCKET_REQUIRE_AUTH=true` for Socket.IO

## Layer 2 — Dashboard (`pn.parnoir.com`)

### Implemented
- Self-issued identity create/unlock (`IdentityCrypto`, PQC)
- **Shamir custodian recovery** (`@par-noir/recovery-crypto`): same pN keys, new passcode, recovery envelope in `.pn` file
- Google Drive encrypted storage, visibility, feeds metadata
- ZKP v1/v2 data points, third-party permissions, data-point request panel
- Sub-pN / owned assets, Stripe monetization, OAuth inline for API token
- Identity succession panel (read-only public status)

### Remaining polish
- `App.tsx` monolith refactor (Recovery tab partially extracted)

## Layer 1 — Identity

**Proof-of-work** in par Noir = user supplies pn name + passcode; the portal runs PQC keygen and encrypts the identity blob (no central issuer, not blockchain mining). See `SHARED_CODE_RULES.md` glossary.

## Recovery architecture (summary)

1. **Create:** `IdentityCrypto.createIdentity` builds a recovery envelope (PQC secrets) and Shamir shares for custodians.
2. **Recover:** Custodians submit shares → combine → decrypt envelope → user sets **new passcode** → same `publicKey` / ML-KEM keys.
3. **Platform:** Canonical `pn-{hash(publicKey)}` avoids orphaning API/Drive state after passcode reset; legacy ids migrate via `/api/storage/migrate-volume-id`.
4. **Messaging:** Same keys → existing DM `kemCiphertext` threads decrypt after unlock in the browser.

Full detail: `apps/id-dashboard/docs/PN_IDENTIFIER_CONSISTENCY.md`, `docs/MESSAGING_ARCHITECTURE.md`.

## Authentication

- **Browser / portals:** pN OAuth 2.0 (production)
- **Dashboard:** pn file + pn name + passcode unlock; optional API OAuth after unlock
- **Legacy challenge auth:** not used by current apps
