# Messaging coordinator policy (operator)

This document defines what the par Noir **API operator** may see, store, and log for messaging. It complements the technical threat model in [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md).

**Plain-language summary:** par Noir **cannot read your message bodies** (E2E encrypted). The API **may** observe **authenticated send/claim** in transit, but durable `social_mailbox` rows are keyed by opaque **`route_key`** (not clear recipient pn) and payloads omit clear from/to. With **device cloud custody**, long-lived cloud OAuth secrets are **not** stored on the operator; the **sender’s outbox** is the durable commit; undelivered ciphertext sits in that opaque throughway until the recipient’s device flushes it into **their** storage. Canonical conversation copies live on **each user's storage** after flush / promote. Peer-inbox is not the universal DM bus.

---

## Operator commitments

1. **No plaintext message logging** — never log `content`, decrypted bodies, passcode, pn name, or ML-KEM secret keys.
2. **No analytics/marketing use** of the connection graph derived from messaging coordination.
3. **Minimal retention on operator infrastructure** — routing metadata exists in API process memory for the duration of the request; application logs use **hashed** pN identifiers (see `hashIdentifier` in `api/src/utils/logger.ts`).
4. **User-owned persistence** — conversation ciphertext, connections, and optional activity ledgers are written to **user storage**, not par Noir Postgres as a social graph.

---

## Data classification

| Data class | Seen by API (in transit)? | Stored where (canonical) | Operator retention | Logging rule |
|------------|---------------------------|--------------------------|--------------------|--------------|
| `encryptedContent` (DM/group body) | Yes (opaque blob) | User Drive sheets | Request-scoped memory only; blob on user Drive | Never log blob; hash participants only |
| `fromPnIdentifier` / `toPnIdentifier` | Yes (request path) | Conversation sheets use `self`/`peer` markers; opaque conversation filenames | Request-scoped memory only | Log as `hashIdentifier()` only |
| Timestamps | Yes | User Drive sheets | Request-scoped memory only | Safe to log (no PII) |
| Approximate sizes | Yes | — | Request-scoped memory only | Safe to log |
| Attachment ciphertext | Yes (opaque) | Dual-written into **each** user’s `attachments/` (no peer ACLs) | Request-scoped memory only | Never log blob |
| `kemCiphertext` | Yes (opaque) | User Drive connections / inbox (col F) | Request-scoped memory only | Never log full blob |
| `wrappedMessageRootKey` | Yes (opaque) | User Drive inbox (col H, acceptor) | Request-scoped memory only | Never log full blob |
| `messageRootKey` / `chatKey` | **No** | Client memory only (derived from blobs + unlock) | — | Never |
| Passcode / pn name | **No** (messaging path) | — | — | Never |
| ML-KEM secret keys | **No** | Client memory / sessionStorage | — | Never |
| Connection rows | Yes (during accept/list) | User Drive `connections` sheet | Request-scoped memory only | Hash pn identifiers |
| Messaging ledger rows | Yes (during append) | User Drive `messaging_ledger` | User-owned; user may delete sheet | Hash pn identifiers |
| Realtime `new_message` | Yes (WebSocket fan-out) | Not persisted by API | Ephemeral event | Payload: `threadId` + `messageId` only |
| OAuth `oauth_refresh_tokens` | Yes (session mgmt) | Postgres | Until token expiry/revoke; see `AUDIT_RETENTION_DAYS` | Hash pn identifier |
| `storage_credentials` (legacy / layout-only) | Layout metadata may remain; **provider secrets must not** under device custody | Postgres | While account connected | Never log tokens; purge refresh/access secrets after migration |
| `social_mailbox` jobs | Yes (opaque payload + `route_key`) | Postgres until device ack | Until ack or `expires_at` | Never log ciphertext or full route key; hash route/ids |
| Public like/comment counts | Yes | Aggregator DB | Product retention | Hash actor when logged; no mailbox copy |

---

## What par Noir Postgres does **not** contain

Messaging **conversation sheets** are **not** a central graph in PostgreSQL. Verified tables relevant to messaging:

- **`oauth_refresh_tokens`** — OAuth session (includes `pn_identifier` for auth; not a message graph).
- **`storage_credentials`** — under device custody: non-secret layout / provider enum only (no refresh tokens). Legacy rows may still hold encrypted tokens until migration purge.
- **`social_mailbox`** — opaque store-and-forward jobs (`route_key` + ciphertext-centric payload; no clear `pn-*` recipient column on new rows) until the recipient device flushes to user cloud and acks. Not a substitute for canonical Drive/portable conversation sheets; not a clear private social-graph table.
- **`audit_events`** — optional security audit (not message content); retention `AUDIT_RETENTION_DAYS` (default 365).

There is **no** long-lived `messages`, `conversations`, or `connections` table in Postgres for DM/group ciphertext or peer lists as the system of record.

---

## Third-party visibility

| Party | What they may see |
|-------|------------------|
| **Google Drive** (or other user-chosen provider) | File activity, timing, sheet structure; **no** messaging peer reader ACLs; opaque `conversation-o-*` names and `self`/`peer` from-cells on new writes; residual plaintext peer DIDs may still appear on connections / inbox until further migration |
| **par Noir API** | Routing metadata in transit; opaque mailbox until device flush; **no** standing cloud refresh tokens under device custody |
| **End-user clients** | Decrypted content after unlock |

---

## Application logs

- **Production:** `MESSAGING_DEBUG_LOGS` unset or `0`; messaging routes use `safeLogger` with hashed pN identifiers.
- **Verbose sheet tracing:** only when `MESSAGING_DEBUG_LOGS=1` or `LOG_LEVEL=debug` (non-production).
- **Infrastructure log retention:** align with hosting provider (recommend ≤30 days for application logs); document in ops runbooks.

---

## Messaging privacy (integrators / FAQ)

- **Can par Noir read my messages?** No. Bodies are E2E encrypted; the server stores and moves ciphertext only.
- **Does par Noir know who I message?** During send the API sees sender and recipient identifiers to enqueue mailbox jobs (and, on the legacy path, dual-write). That is not blind routing. Canonical copies after flush live on user storage.
- **Where do messages live?** Ultimately on your connected storage. Until your device flushes, undelivered ciphertext may sit briefly in `social_mailbox` on the API.
- **If Railway is compromised?** Under device custody the attacker does **not** get standing cloud OAuth refresh tokens. They can still disrupt mailbox/cache, see routing metadata in pending jobs, and abuse other env secrets until rotated — see [ADR_DEVICE_CLOUD_CUSTODY.md](../architecture/ADR_DEVICE_CLOUD_CUSTODY.md).
- **OAuth passcode:** Legacy OAuth unlock may still send passcode to the server for authentication; E2E messaging keys are derived client-side and are not required to be retained server-side for messaging.

---

## Related documents

- [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md) — crypto and data flow
- [MESSAGING_UI_SURFACES.md](../MESSAGING_UI_SURFACES.md) — client surfaces
- [ADR_DEVICE_CLOUD_CUSTODY.md](../architecture/ADR_DEVICE_CLOUD_CUSTODY.md) — device-held cloud credentials + mailbox
- [MESSAGING_CLIENT_COORDINATION_RFC.md](../architecture/MESSAGING_CLIENT_COORDINATION_RFC.md) — client-coordinated paths
- [ADR_MESSAGING_BLIND_ROUTING.md](../architecture/ADR_MESSAGING_BLIND_ROUTING.md) — blind routing decision gate
