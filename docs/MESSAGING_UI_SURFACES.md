# Messaging UI surfaces

Same E2E behavior on every surface: **one pN unlock** (OAuth consent with identity file + passcode) loads messaging alongside feeds. No separate inbox unlock step.

## Surfaces

| Surface | Entry | Components |
|---------|--------|------------|
| **Messaging app** | `messages.parnoir.com` — `MessagesPage` / `Inbox` | Full inbox, New group |
| **Browse modal** | `App.tsx` `showInbox`, `BottomNav`, profile/feed Message actions | Same `Inbox` + `MessageThread` overlay |
| **L5 embed** | Third-party app with OAuth + `@par-noir/messaging-ui` contract | Provide `apiEndpoint`, `getAccessToken()`, OAuth handoff listeners |

## OAuth handoff (single unlock)

When the user unlocks pN on the API consent page (`browser-app`):

1. `postMessage({ type: 'pn_messaging_identity', identity })` — browser stores `pn_encrypted_identity_v1` in `localStorage` (encrypted blob only).
2. `postMessage({ type: 'pn_messaging_session', session })` — browser applies ML-KEM keys in memory via `applyDmSessionHandoff` and `pn_dm_session_v1` in `sessionStorage` (tab refresh).

If OAuth permissions already exist but messaging material is missing, the browser adds `identity_handoff=required` to the authorize URL so consent shows the unlock form instead of skipping straight to redirect.

## Key modals

- **CreateGroupModal** — title + connected members → client-wrapped `chatKey`
- **GroupSettingsModal** — owner: title, roles, add/remove members
- **MessageThread** / **MessageList** — DM and group threads; read-only groups hide composer
- **MessageList** — merged inbox (`getInboxThreads`): DMs + groups sorted by `lastMessageAt`
- **DmCryptoUnlockModal** — rare fallback only when encrypted identity exists but session handoff failed (passcode re-derive on device)

## API (ciphertext only)

- DMs: `POST /api/messages/send` with `encryptedContent`, `cryptoVersion: 2`
- Groups: `POST /api/groups`, `GET /api/groups`, `GET|POST /api/groups/:id/messages`, `POST /api/groups/:id/members`, `DELETE /api/groups/:id/members/:pn`, `PATCH /api/groups/:id`, `PATCH /api/groups/:id/members/:pn`

## Manual E2E checklist (groups)

1. Two users connected with KEM; both unlock pN once (messaging keys handed off automatically).
2. User A creates a group with B; both see the group in the inbox.
3. A sends a message; B sees decrypted text; network shows `encryptedContent` only on group send.
4. Set B to `readOnly` in group settings; B has no composer; A can still send; B cannot (403).
5. A adds C (connected); C sees history only from join onward (no backfill).

See [MESSAGING_ARCHITECTURE.md](./MESSAGING_ARCHITECTURE.md) and [security/MESSAGING_COORDINATOR_POLICY.md](./security/MESSAGING_COORDINATOR_POLICY.md) (what the operator may see vs message content).
