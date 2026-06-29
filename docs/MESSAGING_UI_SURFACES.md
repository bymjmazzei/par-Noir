# Messaging UI surfaces

Same E2E behavior on every surface: **one pN unlock** (OAuth consent with identity file + passcode) loads messaging alongside feeds. No separate inbox unlock step.

## Surfaces

| Surface | Entry | Components |
|---------|--------|------------|
| **Messaging app** | `messages.parnoir.com` — `MessagesPage` / `Inbox` | Full inbox, New group |
| **Browse modal** | `App.tsx` `showInbox`, `BottomNav`, profile/feed Message actions | Same `Inbox` + `MessageThread` overlay |
| **L5 embed** | Third-party app with OAuth + `@par-noir/messaging-ui` contract | Provide `apiEndpoint`, `getAccessToken()`, OAuth handoff listeners |

## OAuth handoff (single unlock)

When the user unlocks pN on the API consent page (`browser-app`), **one unlock** delivers both the OAuth authorization code and messaging keys:

1. Consent decrypts the identity file locally and extracts ML-KEM session + encrypted identity blob.
2. Redirect to `oauth-callback.html` stashes session in popup `window.name`, identity in URL hash (large blob), and embeds **`messagingHandoff`** in the same `oauth_callback` localStorage/postMessage payload as the authorization code.
3. `runOAuthCallback` applies `messagingHandoff` and polls for backup delivery **before** marking the user unlocked. On **messaging.parnoir.com** (`VITE_MESSAGING_ONLY`), unlock **fails** if messaging keys did not land (no “OAuth-only” broken state).
4. Stored: `pn_encrypted_identity_v1` (localStorage), `pn_dm_session_v1` (sessionStorage), ML-KEM in memory.

Cross-origin consent `postMessage` is supplementary only; the oauth-callback bundle is the primary path.

`identity_handoff=required` forces the identity unlock form when OAuth exists but messaging material is missing on device. Messaging-only builds set this automatically until keys are present.

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
