# Messaging coordinator policy (operator)

This document defines what the par Noir **API operator** may see, store, and log for messaging. It complements the technical threat model in [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md).

**Plain-language summary:** par Noir **cannot read your message bodies** (E2E encrypted). The API **does** see **routing metadata** (who is messaging whom, when) **in transit** while coordinating delivery to user-owned storage. That metadata is **not** kept in a central par Noir message database; canonical copies live on **each user's storage** (Google Drive or portable providers).

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
| `fromPnIdentifier` / `toPnIdentifier` | Yes | User Drive inbox + conversation sheets | Request-scoped memory only | Log as `hashIdentifier()` only |
| Timestamps | Yes | User Drive sheets | Request-scoped memory only | Safe to log (no PII) |
| Approximate sizes | Yes | — | Request-scoped memory only | Safe to log |
| `kemCiphertext` | Yes (opaque) | User Drive connections / inbox (col F) | Request-scoped memory only | Never log full blob |
| `wrappedMessageRootKey` | Yes (opaque) | User Drive inbox (col H, acceptor) | Request-scoped memory only | Never log full blob |
| `messageRootKey` / `chatKey` | **No** | Client memory only (derived from blobs + unlock) | — | Never |
| Passcode / pn name | **No** (messaging path) | — | — | Never |
| ML-KEM secret keys | **No** | Client memory / sessionStorage | — | Never |
| Connection rows | Yes (during accept/list) | User Drive `connections` sheet | Request-scoped memory only | Hash pn identifiers |
| Messaging ledger rows | Yes (during append) | User Drive `messaging_ledger` | User-owned; user may delete sheet | Hash pn identifiers |
| Realtime `new_message` | Yes (WebSocket fan-out) | Not persisted by API | Ephemeral event | Payload: `threadId` + `messageId` only |
| OAuth `oauth_refresh_tokens` | Yes (session mgmt) | Postgres | Until token expiry/revoke; see `AUDIT_RETENTION_DAYS` | Hash pn identifier |
| `storage_credentials` | Yes (encrypted blobs) | Postgres | While account connected | Never log decrypted tokens |

---

## What par Noir Postgres does **not** contain

Messaging routing is **not** stored as a central graph in PostgreSQL. Verified tables relevant to messaging:

- **`oauth_refresh_tokens`** — OAuth session (includes `pn_identifier` for auth; not a message graph).
- **`storage_credentials`** — encrypted Drive tokens so the API can coordinate writes on behalf of the user.
- **`audit_events`** — optional security audit (not message content); retention `AUDIT_RETENTION_DAYS` (default 365).

There is **no** `messages`, `conversations`, or `connections` table in Postgres for DM/group ciphertext or peer lists.

---

## Third-party visibility

| Party | What they may see |
|-------|------------------|
| **Google Drive** (or other user-chosen provider) | File names, sheet structure, sharing ACLs, API access patterns |
| **par Noir API** | Routing metadata in transit + coordination writes to user storage |
| **End-user clients** | Decrypted content after unlock |

---

## Application logs

- **Production:** `MESSAGING_DEBUG_LOGS` unset or `0`; messaging routes use `safeLogger` with hashed pN identifiers.
- **Verbose sheet tracing:** only when `MESSAGING_DEBUG_LOGS=1` or `LOG_LEVEL=debug` (non-production).
- **Infrastructure log retention:** align with hosting provider (recommend ≤30 days for application logs); document in ops runbooks.

---

## Messaging privacy (integrators / FAQ)

- **Can par Noir read my messages?** No. Bodies are E2E encrypted; the server stores and moves ciphertext only.
- **Does par Noir know who I message?** During send/delivery the API sees sender and recipient identifiers to dual-write to both users' storage. par Noir does not maintain a separate central message database for this graph.
- **Where do messages live?** On your connected storage (e.g. Google Drive under your pN folder layout).
- **OAuth passcode:** Legacy OAuth unlock may still send passcode to the server for authentication; E2E messaging keys are derived client-side and are not required to be retained server-side for messaging.

---

## Related documents

- [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md) — crypto and data flow
- [MESSAGING_UI_SURFACES.md](../MESSAGING_UI_SURFACES.md) — client surfaces
- [MESSAGING_CLIENT_COORDINATION_RFC.md](../architecture/MESSAGING_CLIENT_COORDINATION_RFC.md) — future client-coordinated paths
- [ADR_MESSAGING_BLIND_ROUTING.md](../architecture/ADR_MESSAGING_BLIND_ROUTING.md) — blind routing decision gate
