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

## Groups

- Owner creates a group; members must already be **connected to the owner**.
- Random `chatKey`; each member gets `wrappedChatKey = wrap(chatKey, KDF(ownerPn, messageRootKey, groupId))`.
- Per-member sheet: `conversation-group-{groupId}`; inbox column G `threadType=group` (A=groupId, B=sheet id, C=owner pn).
- **Send:** `POST /api/groups/:groupId/messages` with `encryptedContent` + `cryptoVersion: 2`; API fans out the same blob to every member sheet.
- **Read:** `GET /api/groups/:groupId/messages?userPnIdentifier=…`; browser unwraps `chatKey` via DM session to owner, then decrypts.
- `accessRole` (`readWrite` | `readOnly`): API returns 403 on send for read-only; UI hides composer.
- **Member admin:** `POST …/members`, `DELETE …/members/:pn`, `PATCH /api/groups/:id` (title), `PATCH …/members/:pn` (role).
- MVP does **not** rotate `chatKey` when a member is removed; removed members retain old ciphertext unless keys are rotated in a future release.

## Threat model (summary)

| API may learn | API must not learn |
|---------------|-------------------|
| Who messages whom (connection graph) | Plaintext content |
| Timestamps, approximate sizes | `messageRootKey`, `chatKey`, passcode, pn name |
| `kemCiphertext` blobs (opaque) | ML-KEM secret keys |

## OAuth passcode debt

Browser OAuth may still send passcode to the server for legacy unlock flows. **E2E messaging does not rely on the server retaining passcode**—use local `pn_encrypted_identity_v1` + `DmCryptoUnlockModal` for ML-KEM secret in memory only.

## Implementation packages

- `@par-noir/dm-crypto` — KEM session, DM v2, group wrap helpers
- `apps/aggregator-browser` — encrypt/decrypt, unlock modal, connection accept with KEM
