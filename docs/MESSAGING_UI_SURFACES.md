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

1. Consent stashes `{ identity, session }` in the **popup `window.name`** (`pn_messaging_handoff_v1:` prefix) before redirecting to `oauth-callback.html`.
2. **`oauth-callback.html`** (same origin as the app) reads `window.name`, writes `pn_messaging_oauth_handoff` to `localStorage`, and delivers via same-origin `postMessage` + `BroadcastChannel` (`par-noir-messaging-oauth-v1`) with redelivery retries — same pattern as OAuth code handoff.
3. The browse app applies the handoff in `runOAuthCallback` / `restoreMessagingAfterOAuth()`:
   - `pn_messaging_identity` → `pn_encrypted_identity_v1` in `localStorage` (encrypted blob only).
   - `pn_messaging_session` → ML-KEM keys in memory via `applyDmSessionHandoff` and `pn_dm_session_v1` in `sessionStorage` (tab refresh).

Cross-origin `postMessage` from the API consent page to the opener is **supplementary only** (works when `window.opener` survives); the callback bridge is the primary path.

`identity_handoff=required` on authorize is used **only** when OAuth is already valid but `pn_encrypted_identity_v1` is missing on device — it forces the identity unlock form on consent instead of the fast redirect-only path. General lock/unlock does **not** set this flag.

## Key modals

- **CreateGroupModal** — title + connected members → client-wrapped `chatKey`
- **GroupSettingsModal** — owner: title, roles, add/remove members
- **MessageThread** / **MessageList** — DM and group threads; read-only groups hide composer
- **MessageList** — merged inbox (`getInboxThreads`): DMs + groups sorted by `lastMessageAt`
- **DmCryptoUnlockModal** — when encrypted identity exists in `localStorage` but the ML-KEM session is missing (passcode re-derive on device; no full OAuth re-consent)

## API (ciphertext only)

- DMs: `POST /api/messages/send` with `encryptedContent`, `cryptoVersion: 2`
- Groups: `POST /api/groups`, `GET /api/groups`, `GET|POST /api/groups/:id/messages`, `POST /api/groups/:id/members`, `DELETE /api/groups/:id/members/:pn`, `PATCH /api/groups/:id`, `PATCH /api/groups/:id/members/:pn`

## Manual E2E checklist (groups)

1. Two users connected with KEM; both unlock pN once (messaging keys handed off automatically).
2. User A creates a group with B; both see the group in the inbox.
3. A sends a message; B sees decrypted text; network shows `encryptedContent` only on group send.
4. Set B to `readOnly` in group settings; B has no composer; A can still send; B cannot (403).
5. A adds C (connected); C sees history only from join onward (no backfill).

## Manual E2E checklist (messaging handoff)

1. **Fresh unlock:** Lock pN → unlock via OAuth popup with identity file → Messages tab shows no amber banner; `isDmIdentityReady()` true.
2. **Connection accept:** Send request from user B → user A accepts from Notifications, Connection Requests, and Connections tab — all succeed without extra OAuth.
3. **Tab refresh:** Reload page → `restoreDmSessionFromStorage()` restores session; accept still works.
4. **Reconnect without re-consent:** OAuth valid + `pn_encrypted_identity_v1` present but session cleared → "Enter passcode" opens `DmCryptoUnlockModal`, not full OAuth consent.
5. **Fast path unchanged:** User with existing OAuth grants who never stored identity → reconnect shows identity unlock on consent (`identity_handoff=required`), one time, then keys persist.

See [MESSAGING_ARCHITECTURE.md](./MESSAGING_ARCHITECTURE.md) and [security/MESSAGING_COORDINATOR_POLICY.md](./security/MESSAGING_COORDINATOR_POLICY.md) (what the operator may see vs message content).
