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

Device cloud custody is always on; there is no opt-out. Legacy server dual-write for messaging/engagement is removed.

---

## Owner cloud path (source of truth)

The server never touches a user's cloud. Non-negotiable:

| Rule | Meaning |
|------|---------|
| Secrets on device | Tokens, keys, SAS tokens and relay tokens live only in the device vault. `storage_credentials` holds layout shells (`pnDriveIndex`, account ids, prefixes). The provider route refuses secrets with `secrets_not_accepted`. |
| No server cloud I/O | No code in `api/src` calls Drive/Sheets, Dropbox, OneDrive, S3, Azure Blob or FTP for a user, or imports a client for them. |
| No forwarded tokens | Devices never send a cloud token to the API. `X-PN-Cloud-Access-Token` is not an allowed CORS header and nothing reads it. |
| Owner writes on the device | The device writes its own cloud (`@par-noir/device-cloud-credentials`) and posts a `deviceCloudResult` receipt; the API updates Postgres only. |
| Peer writes by mailbox | Anything another user's cloud needs is a mailbox job that their device applies to its own cloud. |
| FTP via the user's relay | Browsers reach FTPS/SFTP through `apps/pn-storage-relay`, which the user hosts. See [STORAGE_FTP_SETUP.md](../developer/STORAGE_FTP_SETUP.md). |
| One client gate per app | Browser: `ownerFetch` / `ownerGet` (+ thin `messageFetch`). Dashboard: `ownerApiService`. |

**Fixed exceptions:** anonymous reads of files the user made public (`publicBlobAccess`, by public URL or the platform API key, never a bearer token), and platform infrastructure (R2 in `feedPreviewR2`, GCP KMS).

**Ratchets:** `scripts/check-no-server-user-cloud.sh` (no allowlist; exceptions are fixed in the script), `scripts/check-owner-fetch-boundary.sh`.

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
| **Amended** | 2026-11-10: the server no longer touches any user cloud (no forwarded tokens, no server resolver, no stored S3/Azure keys, FTP via user-hosted relay). |
