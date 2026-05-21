# Messaging UI surfaces

Same E2E behavior on every surface: unlock messaging (passcode + local encrypted identity), then DMs and groups.

## Surfaces

| Surface | Entry | Components |
|---------|--------|------------|
| **Messaging app** | `messages.parnoir.com` — `MessagesPage` / `Inbox` | Full inbox, New group, unlock modal |
| **Browse modal** | `App.tsx` `showInbox`, `BottomNav`, profile/feed Message actions | Same `Inbox` + `MessageThread` overlay |
| **L5 embed** | Third-party app with OAuth + `@par-noir/messaging-ui` contract | Provide `apiEndpoint`, `getAccessToken()`, local identity unlock |

## OAuth identity handoff

After sign-in on the API consent page (`browser-app`), the consent UI sends `postMessage({ type: 'pn_messaging_identity', identity })` to the browse/messaging origin. The app stores `pn_encrypted_identity_v1` in `localStorage` for `DmCryptoUnlockModal`.

## Key modals

- **DmCryptoUnlockModal** — passcode → ML-KEM secret in memory only
- **CreateGroupModal** — title + connected members → client-wrapped `chatKey`
- **GroupSettingsModal** — owner: title, roles, add/remove members
- **MessageThread** / **MessageList** — DM and group threads; read-only groups hide composer
- **MessageList** — merged inbox (`getInboxThreads`): DMs + groups sorted by `lastMessageAt`

## API (ciphertext only)

- DMs: `POST /api/messages/send` with `encryptedContent`, `cryptoVersion: 2`
- Groups: `POST /api/groups`, `GET /api/groups`, `GET|POST /api/groups/:id/messages`, `POST /api/groups/:id/members`, `DELETE /api/groups/:id/members/:pn`, `PATCH /api/groups/:id`, `PATCH /api/groups/:id/members/:pn`

## Manual E2E checklist (groups)

1. Two users connected with KEM; both unlock messaging.
2. User A creates a group with B; both see the group in the inbox.
3. A sends a message; B sees decrypted text; network shows `encryptedContent` only on group send.
4. Set B to `readOnly` in group settings; B has no composer; A can still send; B cannot (403).
5. A adds C (connected); C sees history only from join onward (no backfill).

See [MESSAGING_ARCHITECTURE.md](./MESSAGING_ARCHITECTURE.md).
