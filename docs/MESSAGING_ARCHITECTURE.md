# Messaging architecture (E2E)

## Principle

The par Noir API is a **storage coordinator**, not a **conversation participant**. It moves ciphertext and membership metadata on users’ Google Drive. It must not decrypt message bodies, derive `messageRootKey` / `chatKey`, or log plaintext.

## Direct messages (1:1)

1. Each user publishes `mlKemPublicKey` on their Drive `profile.json` (and via `POST /api/profile/ml-kem-public-key`).
2. On **connection accept**, the acceptor runs ML-KEM-768 encapsulation client-side and sends `kemCiphertext` to `POST /api/connections/:id/accept`. The API stores the blob only.
3. Both sides derive `messageRootKey` locally, then per-message keys via HKDF (`par-noir-dm-v1` + `connectionId`).
4. **Send:** `POST /api/messages/send` with `encryptedContent` and `cryptoVersion: 2` only.
5. **Read:** `GET|POST /api/messages/conversation` returns `encryptedContent`; the browser decrypts.

Inbox sheets cache `kemCiphertext` (column F) for fast session open—opaque KEM blob, not a server-held secret.

## Media attachments (E2E)

1. **Pick:** Attach modal tabs — **My pN** (owner index), **Shared with me** (Drive `sharedWithMe`), **Saved** (curated feed), **Device** (file picker / native camera).
2. **Prepare (client):** Download source blob, decrypt with pN identity or public share token as needed, re-encrypt with the conversation key (`deriveMessageKey` for DMs, group `chatKey` for groups) via `@par-noir/dm-crypto` `encryptMediaBytes`.
3. **Upload:** `POST /api/drive/files` into `par-noir-messages/attachments/` (`GET /api/messages/attachments-folder` resolves folder id). Ciphertext uploaded with `encrypt: false`.
4. **Send:** `POST /api/messages/send` or `POST /api/groups/:groupId/messages` with optional `mediaFileId` and `mediaMimeType`. Message sheet columns **H** (file id) and **I** (mime hint) store attachment metadata.
5. **Share:** API grants Google Drive **reader** to each recipient’s stored Google email before dual-write append.
6. **Receive:** Browser downloads ciphertext, decrypts with the same conversation key, uses column **I** for inline preview when present.
7. **Delete:** Removing a message revokes Drive reader ACL for the conversation partner when the deleter owns the media file.

The API never sees plaintext media; it coordinates upload, ACL, and sheet metadata only.

## Groups

- Owner creates a group; members must already be **connected to the owner**.
- Random `chatKey`; each member gets `wrappedChatKey = wrap(chatKey, KDF(ownerPn, messageRootKey, groupId))`.
- Per-member sheet: `conversation-group-{groupId}`; inbox column G `threadType=group` (A=groupId, B=sheet id, C=owner pn).
- **Send:** `POST /api/groups/:groupId/messages` with `encryptedContent` + `cryptoVersion: 2`; API fans out the same blob to every member sheet.
- **Read:** `GET /api/groups/:groupId/messages?userPnIdentifier=…`; browser unwraps `chatKey` via DM session to owner, then decrypts.
- `accessRole` (`readWrite` | `readOnly`): API returns 403 on send for read-only; UI hides composer.
- **Member admin:** `POST …/members`, `DELETE …/members/:pn`, `PATCH /api/groups/:id` (title), `PATCH …/members/:pn` (role).
- **Key rotation on remove:** Deleting a member fans out `rotateGroupMemberKeys` to **all remaining members’** sheets (dual-write, mirroring add-member).

## Identity re-key migration

When the owner rotates ML-KEM keys (new `pn-*`):

1. Dashboard stores a short-lived `pn_identity_migration_kem_handoff` in **sessionStorage** (predecessor + successor ML-KEM material).
2. On browser unlock, `migrateConnectionsOnUnlock` self-rekeys requester-side `kemCiphertext` per connection and re-wraps owned group `chatKey` rows via `POST /api/identity/migration/:id/groups/rewrap`.
3. **Historical DMs:** `ensureMessageRootKey` falls back to legacy roots cached during migration for decrypt-only.

See [developer/IDENTITY_REKEY_MIGRATION.md](./developer/IDENTITY_REKEY_MIGRATION.md).

## Threat model (summary)

The API is a **coordinator**, not a **conversation participant**.

| Role | Description |
|------|-------------|
| **Coordinator** | Sees routing metadata **in transit** to dual-write ciphertext, accept connections, grant attachment ACLs, and push realtime hints. |
| **Not a participant** | Must not decrypt bodies, derive `messageRootKey` / `chatKey`, or retain passcode for messaging. |

| API may learn (in transit) | API must not learn |
|----------------------------|-------------------|
| Who messages whom (connection graph while coordinating) | Plaintext content |
| Timestamps, approximate sizes | `messageRootKey`, `chatKey`, passcode, pn name |
| `kemCiphertext` blobs (opaque) | ML-KEM secret keys |

**Persistence:** Canonical message and connection data lives on **user-owned storage** (Drive / portable providers), not par Noir Postgres. The operator does not maintain a central social-graph database for DMs.

**Third parties:** The storage host (e.g. Google Drive) has its own metadata layer (files, sharing, timing).

**Operator policy:** See [security/MESSAGING_COORDINATOR_POLICY.md](./security/MESSAGING_COORDINATOR_POLICY.md) for retention, logging rules, and commitments.

## OAuth passcode debt

Browser OAuth may still send passcode to the server for legacy unlock flows. **E2E messaging does not rely on the server retaining passcode**—messaging ML-KEM keys are handed off client-side at OAuth unlock (`pn_messaging_session`) and held in browser memory / `sessionStorage` only.

## Implementation packages

- `@par-noir/dm-crypto` — KEM session, DM v2, group wrap helpers
- `apps/aggregator-browser` — encrypt/decrypt, unlock modal, connection accept with KEM
