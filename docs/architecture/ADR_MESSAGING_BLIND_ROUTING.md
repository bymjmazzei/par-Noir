# ADR: Blind routing / opaque throughway for messaging

**Status:** **Partial go** — opaque cross-cloud throughway is **in**; universal peer-inbox transport is **no-go**.

**Context:** The API historically coordinated DMs with clear `fromPn` / `toPn` on durable mailbox rows. Device cloud custody removed long-lived cloud secrets from Railway, but `social_mailbox` keyed by `recipient_identity_id` still left a clear private who→whom table in Postgres. Peer-inbox (sender writes into the recipient’s provider) was considered and rejected as a universal bus: cross-cloud (Dropbox ↔ Drive ↔ portable) requires the **recipient** device to materialize with **recipient** credentials.

**Related:** [MESSAGING_COORDINATOR_POLICY.md](../security/MESSAGING_COORDINATOR_POLICY.md), [ADR_DEVICE_CLOUD_CUSTODY.md](./ADR_DEVICE_CLOUD_CUSTODY.md), [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md).

---

## Decision

| Path | Verdict |
|------|---------|
| **Opaque Railway throughway** (`route_key`, ciphertext-centric payload, no clear from/to in durable columns) | **Go** |
| **Peer `_inbox/` ACL transport as sole/universal DM bus** | **No-go** (breaks one-social-cloud + cross-provider) |
| Full mix-network / sealed-sender with zero in-transit observation | **Out of scope** (operator may still see authenticated send/claim requests) |

### Opaque throughway (shipped)

1. Each identity mints a high-entropy **`mailbox_route_key`** (device-sealed).
2. On connection request/accept, peers store **`peerMailboxRouteKey`** on the user-owned connections row.
3. Sender enqueue supplies `route_key` (or legacy HMAC fallback of pepper + recipient pn when not yet exchanged).
4. Recipient claims pending by proving ownership of that route (device auth + route key); durable rows are not queryable by clear `pn-*`.
5. Payload sanitization strips clear identity fields before Postgres insert.
6. Public likes/comments stay on the **aggregator**; they are **not** mailbox jobs.

### Honesty

- Operator may still observe **in-transit** authenticated send/claim.
- Compromised DB yields opaque blobs + route keys, not a readable identity social graph table.
- Storage providers still see each user’s own silo after flush.
- Sender outbox remains SoT; throughway wipe + unlock reconcile still redelivers.

---

## Record

| Field | Value |
|-------|-------|
| **Decision** | Opaque throughway **go**; peer-inbox as universal transport **no-go** |
| **Date** | 2026-07-23 |
| **Notes** | Supersedes default no-go for “hide durable graph”; does not claim zero network-level observation. |
