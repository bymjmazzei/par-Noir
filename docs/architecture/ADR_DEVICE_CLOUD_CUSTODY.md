# ADR: Device custody of cloud credentials + sender outbox SoT

**Status:** **Accepted** — product path (development cutover; no dual-write).

**Context:** The API historically stored encrypted cloud OAuth refresh tokens and provider keys in Postgres (`storage_credentials`) so the coordinator could dual-write to user-owned storage while recipients were offline. A Railway compromise therefore yielded usable access to connected clouds. Assigning delivery durability to Railway `social_mailbox` alone also meant a mailbox wipe could drop “accepted” sends.

**Related:** [MESSAGING_COORDINATOR_POLICY.md](../security/MESSAGING_COORDINATOR_POLICY.md), [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md), [DEVICE_CLOUD_CUSTODY_E2E.md](./DEVICE_CLOUD_CUSTODY_E2E.md), [ADR_MESSAGING_BLIND_ROUTING.md](./ADR_MESSAGING_BLIND_ROUTING.md).

---

## Decision

1. **Long-lived cloud secrets live on the user device**, not on Railway.
2. **Sender-owned outbox is the durable commit (SoT)** under `par-noir-messages/_outbox/` (plus sealed local outbox on browser until promoted).
3. **Railway `social_mailbox` is a rebuildable opaque throughway** — keyed by **`route_key`** (not clear recipient pn); ciphertext-centric payload (no durable clear from/to). Recipient-facing jobs only; **no sender mailbox copies**. Idempotent enqueue/lookup allow unlock reconcile to rebuild after wipe.
4. **Device flush workers** claim by route key, **materialize into user cloud**, then ack. Never ack without write. Peer for conversation paths is resolved on-device (`connectionId` → connections silo).
5. **Aggregator-browser** remains API-only; it commits sealed local outbox first, then fans out via API with peer `routeKey` from connection metadata.
6. **Public engagement** (likes/comments) uses aggregator/API public counts only — **not** mailbox jobs. Actor preference/engagement silo writes are actor-device → own cloud only.
7. **Peer-inbox is not the universal DM transport** (cross-cloud requires recipient credentials on materialize). See blind-routing ADR.

**Default:** device cloud custody is **on** unless `DEVICE_CLOUD_CUSTODY=0|false|no`. Legacy server dual-write for messaging/engagement is removed.

---

## Owner Drive path (source of truth)

How owner Google Drive I/O moves under custody — non-negotiable:

| Rule | Meaning |
|------|---------|
| Secrets on device | AT/RT only in the local vault; DB holds layout shells (`pnDriveIndex`), never OAuth secrets |
| Forward, don’t mint on server | Every Drive-backed call carries `X-PN-Cloud-Access-Token` |
| One server resolver | Only `resolveOwnerDriveToken` (req-scoped layout: `requireOwnerDriveContextFromReq`) |
| One client gate per app | Browser: `ownerFetch` / `ownerGet` (+ thin `messageFetch`). Dashboard: `ownerApiService` |
| Incomplete index → ensure | With a resolved token, `ensureCompletePnDriveIndex` runs the init spine; do not abort grant/consent as `cloud_token_required` |
| No silent peer Drive | Peer half = mailbox job → peer device `apply-inbound` with **their** forwarded AT |
| Soft null = probes only | Capability probes may soft-null; grant/write paths that soft-no-op without AT are bugs |

**Distinct grant persist errors:** `cloud_token_required` (missing/failed header) vs `drive_index_incomplete` (ensure still failed).

**Ratchets:** `scripts/check-token-resolver-boundary.sh`, `scripts/check-owner-fetch-boundary.sh`. Do not grow allowlists.

---

## Flow

```
On connect: exchange opaque mailbox_route_key onto connections rows
Browser/Dashboard commit → local/cloud outbox (SoT)
        ↓ enqueue by route_key
Railway opaque throughway (lossy)
        ↓ recipient unlock flush (route claim)
Recipient silo (recipient credentials)
```

---

## Consequences

| Gain | Cost |
|------|------|
| Railway compromise ≠ mass cloud takeover via refresh tokens | Silo materialization waits for an unlocked device with keys |
| Railway mailbox wipe ≠ lost sender commit | Browser must seal outbox before treating send as durable |
| DB dump ≠ clear private who→whom table | Route keys must be exchanged (or legacy pepper fallback) |
| Cross-cloud DMs without sender OAuth on recipient provider | Throughway still sees authenticated send/claim in transit |
| Least-privilege grants limit stolen-client blast radius | Existing Full Dropbox / whole-drive OneDrive / connection-string Azure must reconnect |

---

## Record

| Field | Value |
|-------|-------|
| **Decision** | **go** — device custody + outbox SoT + opaque throughway |
| **Date** | 2026-07-23 |
| **Notes** | Sender mailbox jobs removed. `delivery: throughway` for DMs. Public likes/comments: `delivery: public`. |
