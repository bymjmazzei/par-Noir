# Messaging UI surfaces

Same E2E behavior on every surface: **one pN unlock** (OAuth consent with identity file + passcode) loads messaging alongside feeds. No separate inbox unlock step.

## Surfaces

| Surface | Entry | Components |
|---------|--------|------------|
| **Messaging app** | `messages.parnoir.com` — `MessagesPage` / `Inbox` | Full inbox, New group |
| **Browse modal** | `App.tsx` `showInbox`, `BottomNav`, profile/feed Message actions | Same `Inbox` + `MessageThread` overlay |
| **L5 embed** | Third-party app with OAuth + `@par-noir/messaging-ui` contract | Provide `apiEndpoint`, `getAccessToken()`, OAuth handoff listeners |

## OAuth handoff (single unlock)

When the user unlocks pN via the padlock on `browse.parnoir.com` or `messaging.parnoir.com`, **one unlock** delivers both the OAuth authorization code and messaging keys:

1. Popup opens **same-origin** [`oauth-authorize.html`](apps/aggregator-browser/public/oauth-authorize.html) (not API consent). The page decrypts the identity file locally and extracts ML-KEM session + encrypted identity blob.
2. Before redirect, `oauth-authorize.html` writes **`pn_messaging_oauth_handoff`** to same-origin `localStorage` (shared with the main tab). Then it redirects the popup to `oauth-callback.html` with the authorization code.
3. `oauth-callback.html` reads the stashed handoff from `localStorage` first, delivers `oauth_callback` + `messagingHandoff` to the opener via postMessage/BroadcastChannel.
4. `runOAuthCallback` applies `messagingHandoff` **before** token exchange and **before** `setUnlocked`. Unlock **fails** if `isDmIdentityReady()` is false (no “OAuth-only” broken state) on **both** origins.
5. Stored: `pn_encrypted_identity_v1` (localStorage), `pn_dm_session_v1` (sessionStorage), ML-KEM in memory.

**Conversation recovery:** DM session keys are **not** stored in `localStorage`. Each thread’s opaque recovery blob lives on the user’s Drive inbox (`kemCiphertext` for the requester, `wrappedMessageRootKey` for the acceptor). Opening or sending a thread always re-derives `messageRootKey` from that blob plus the unlocked ML-KEM secret. The in-memory session cache is performance-only; lock/unlock or tab refresh recovers from Drive after unlock.

**Third-party OAuth** (Prism, developer portal, L5 integrators) still uses API-hosted `/oauth/consent` — they do not need ML-KEM handoff.

`identity_handoff=required` is set on authorize when messaging keys are not in memory on that origin.

## Connection status banner

[`ConnectionHealthBanner`](apps/aggregator-browser/src/components/ConnectionHealthBanner.tsx) is **read-only diagnostics** (OAuth, Drive, messaging). It does not trigger a second unlock. If messaging keys are missing, the user **locks and unlocks once** via the padlock OAuth flow.

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
4. **Tab refresh:** Reload page → `restoreDmSessionFromStorage()` restores in-memory keys when possible; otherwise `DmCryptoUnlockModal` (passcode only, no OAuth).
5. **Per origin:** Unlock on `browse.parnoir.com` does not provision `messaging.parnoir.com` — each origin needs one atomic unlock.

## Manual E2E checklist (DM session recovery)

1. User A sends connection request; User B accepts → both send and receive decrypted messages.
2. **Acceptor lock/unlock:** B locks pN, unlocks → still decrypts and can send (reads `wrappedMessageRootKey` from Drive).
3. **Requester lock/unlock:** A locks pN, unlocks → still decrypts and can send (reads `kemCiphertext` from Drive).
4. Delete conversation on both sides, reconnect, repeat steps 1–3.
5. Tab refresh with unlocked session → decrypt without re-accept.

Run on **both** browse and messaging (`VITE_MESSAGING_ONLY`) builds.

See [MESSAGING_ARCHITECTURE.md](./MESSAGING_ARCHITECTURE.md) and [security/MESSAGING_COORDINATOR_POLICY.md](./security/MESSAGING_COORDINATOR_POLICY.md) (what the operator may see vs message content).
