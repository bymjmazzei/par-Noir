# Messaging architecture (E2E)

## Principle

The par Noir API is a **storage coordinator / opaque mailbox**, not a **conversation participant**. It moves ciphertext and membership metadata toward users’ storage. It must not decrypt message bodies, derive `messageRootKey` / `chatKey`, or log plaintext.

Under **device cloud custody** ([ADR_DEVICE_CLOUD_CUSTODY.md](./architecture/ADR_DEVICE_CLOUD_CUSTODY.md)), the API does **not** hold long-lived cloud OAuth secrets. The **sender outbox** (local sealed + user cloud `_outbox/`) is the durable commit; Railway `social_mailbox` is an **opaque throughway** keyed by `route_key` (not clear recipient pn), with ciphertext-centric payloads (no durable clear from/to). Devices rebuild throughway jobs from that outbox if wiped. Recipient devices claim by route and flush ciphertext into **their** Drive/portable silo. Peer-inbox is **not** the universal DM transport ([ADR_MESSAGING_BLIND_ROUTING.md](./architecture/ADR_MESSAGING_BLIND_ROUTING.md)).

## Direct messages (1:1)

1. Each user may publish `mlKemPublicKey` on their Drive `profile.json` (and via `POST /api/profile/ml-kem-public-key`) for **discovery** and cold-DM flows.
2. On **connection send**, the requester attaches `requesterMlKemPublicKey` and opaque `requesterMailboxRouteKey` to the recipient’s `pending_received` row (`peerMlKemPublicKey` in column F; `peerMailboxRouteKey` in column H of the connections sheet).
3. On **connection accept**, the acceptor reads `peerMlKemPublicKey` from that pending row (profile publish is a legacy fallback for requests sent before this change). The acceptor runs ML-KEM-768 encapsulation client-side and sends `kemCiphertext`, `wrappedMessageRootKey`, and `acceptorMailboxRouteKey` to `POST /api/connections/:id/accept`. The API stores KEM blobs and writes the acceptor’s route key onto the requester’s connection row (no server-side derivation).
4. On **every open** (after identity unlock), each party re-derives `messageRootKey` from their own Drive inbox:
   - **Requester:** `openDmSession(kemCiphertext, mlKemSecretKey)` — inbox column **F** (`kemCiphertext`).
   - **Acceptor:** `unwrapMessageRootKey(wrappedMessageRootKey, mlKemSecretKey, connectionId)` — inbox column **H** (`wrappedMessageRootKey`).
   Both paths require an unlocked identity session (`mlKemSecretKey` from OAuth handoff). `@par-noir/dm-crypto` `resolveMessageRootKey` tries wrapped, then kem, then optional legacy root (identity migration only).
5. Per-message keys via HKDF (`par-noir-dm-v1` + `connectionId`).
6. **Send:** `POST /api/messages/send` with `encryptedContent`, `cryptoVersion: 2`, `connectionId`, and peer `routeKey` when known.
   - **Device custody (default on):** Client commits sender outbox first; API fans out recipient-only **opaque** throughway jobs (`delivery: throughway`). Devices flush with locally held cloud keys and materialize silos before ack.
7. **Read:** `GET|POST /api/messages/conversation` returns `encryptedContent` from user storage after flush; clients claim pending via `GET /api/mailbox/pending?routeKey=…` (device auth) before materialization.
8. **Public likes/comments:** aggregator public counts only (`delivery: public`) — not mailbox jobs.

Inbox sheets cache opaque recovery blobs on user Drive—column F (`kemCiphertext`) for the requester, column H (`wrappedMessageRootKey`) for the acceptor—not a server-held secret and never plaintext `messageRootKey`.

## Media attachments (E2E)

1. **Pick:** Attach modal tabs — **My pN** (owner index), **Shared with me** (Drive `sharedWithMe`), **Saved** (curated feed), **Device** (file picker / native camera).
2. **Prepare (client):** Download source blob, decrypt with pN identity or public share token as needed, re-encrypt with the conversation key (`deriveMessageKey` for DMs, group `chatKey` for groups) via `@par-noir/dm-crypto` `encryptMediaBytes`. Client produces a **distinct AES-GCM envelope per recipient** (new IV) so dual-written blobs are not bit-identical.
3. **Upload:** `POST /api/drive/files` into the **sender’s** `par-noir-messages/attachments/` as `blob-{uuid}.msgenc` (`GET /api/messages/attachments-folder` resolves folder id). Ciphertext uploaded with `encrypt: false`.
4. **Send:** `POST /api/messages/send` or `POST /api/groups/:groupId/messages` with `mediaFileId`, optional `mediaMimeType`, and optional `mediaEnvelopesByPn` (per-recipient envelopes).
5. **Dual-write (no peer ACLs):** API copies/uploads ciphertext into **each recipient’s own** attachments folder using **their** credentials. Each conversation row stores that silo’s `mediaFileId`. **No** Google Drive reader grants between users.
6. **Receive:** Browser downloads ciphertext via **own** storage proxy (own token), decrypts with the conversation key.
7. **Delete:** Removing a message deletes the attachment from the **deleter’s** silo only (no ACL revoke).

The API never sees plaintext media; it coordinates dual-write of opaque blobs only.

## Anti-tracing metadata (cloud at-rest)

- Conversation **from** cells use relative markers `self` / `peer` (not raw `pn-*`).
- New DM conversation files are named `conversation-o-{hash}` (deterministic opaque peer ref); legacy `conversation-{pn}` still readable.
- `pnDriveIndex.conversationSheets` keys use the same opaque peer keys for new entries.
- API still sees `from`/`to` **in transit** for dual-write (not blind routing).

## Groups

- Owner creates a group; members must already be **connected to the owner**.
- Random `chatKey`; each member gets `wrappedChatKey = wrap(chatKey, KDF(ownerPn, messageRootKey, groupId))`.
- **One canonical conversation sheet** on the **owner's** Drive: `conversation-group-{groupId}`. Member inbox rows and groups sheet rows point at the owner's `spreadsheetId` (directory only).
- **Send:** `POST /api/groups/:groupId/messages` with `encryptedContent` + `cryptoVersion: 2`; API appends once to the owner's conversation sheet.
- **Read:** `GET /api/groups/:groupId/messages?userPnIdentifier=…`; API reads the owner's sheet with owner credentials; browser unwraps `chatKey` via DM session to owner, then decrypts.
- Inbox thread order for groups uses the **owner's** conversation file `modifiedTime` (not per-send inbox rewrites).
- `accessRole` (`readWrite` | `readOnly`): API returns 403 on send for read-only; UI hides composer.
- **Member admin:** `POST …/members`, `DELETE …/members/:pn`, `PATCH /api/groups/:id` (title), `PATCH …/members/:pn` (role).
- **Key rotation on remove:** Deleting a member rotates `wrappedChatKey` on owner and remaining members' groups sheets (metadata only; no conversation sheet fan-out).

## Identity re-key migration

When the owner rotates ML-KEM keys (new `pn-*`):

1. Dashboard stores a short-lived `pn_identity_migration_kem_handoff` in **sessionStorage** (predecessor + successor ML-KEM material).
2. On browser unlock, `migrateConnectionsOnUnlock` self-rekeys requester-side `kemCiphertext` per connection (`POST /api/identity/migration/:id/connections/rekey`), re-wraps acceptor-side `wrappedMessageRootKey` on the acceptor inbox (`POST /api/identity/migration/:id/connections/rewrap-root`), and re-wraps owned group `chatKey` rows via `POST /api/identity/migration/:id/groups/rewrap`.
3. **Historical DMs:** `resolveMessageRootKey` falls back to legacy roots cached during migration for decrypt-only.

See [developer/IDENTITY_REKEY_MIGRATION.md](./developer/IDENTITY_REKEY_MIGRATION.md).

## Threat model (summary)

The API is a **coordinator**, not a **conversation participant**.

| Role | Description |
|------|-------------|
| **Coordinator / mailbox** | Sees routing metadata **in transit** to enqueue opaque jobs (or, on the legacy path, dual-write ciphertext). Push/realtime hints may fire without cloud tokens. |
| **Not a participant** | Must not decrypt bodies, derive `messageRootKey` / `chatKey`, or retain passcode for messaging. |
| **Not a cloud custodian (device custody)** | Must not store long-lived provider refresh tokens; devices hold those secrets. |

| API may learn (in transit) | API must not learn |
|----------------------------|-------------------|
| Who messages whom (connection graph while coordinating / mailbox) | Plaintext content |
| Timestamps, approximate sizes | `messageRootKey`, `chatKey`, passcode, pn name |
| `kemCiphertext` blobs (opaque) | ML-KEM secret keys |
| Opaque mailbox payloads until ack | Standing cloud refresh tokens (device custody) |

**Persistence:** Canonical message and connection data lives on **user-owned storage** after device flush. Pending jobs may live briefly in Postgres `social_mailbox`. The operator does not maintain a central social-graph database as the system of record for DMs.

**Third parties:** The storage host may see file activity and timing. Messaging **does not** create peer Drive ACLs. Conversation filenames and from-cells are opaque / relative where possible; connections sheet peer DIDs remain a residual graph surface.

**Operator policy:** See [security/MESSAGING_COORDINATOR_POLICY.md](./security/MESSAGING_COORDINATOR_POLICY.md) for retention, logging rules, and commitments.

**Blind routing:** Not in scope — see [architecture/ADR_MESSAGING_BLIND_ROUTING.md](./architecture/ADR_MESSAGING_BLIND_ROUTING.md) (no-go). Opaque metadata + dual-write attachments are **not** blind routing.

## OAuth passcode debt

Browser OAuth may still send passcode to the server for legacy unlock flows. **E2E messaging does not rely on the server retaining passcode**—messaging ML-KEM keys are handed off client-side at OAuth unlock (`pn_messaging_session`) and held in browser memory / `sessionStorage` only.

## Implementation packages

- `@par-noir/dm-crypto` — KEM session, DM v2, group wrap helpers, `wrapMessageRootKey` / `resolveMessageRootKey`
- `apps/aggregator-browser` — encrypt/decrypt, unlock modal, connection accept with KEM
