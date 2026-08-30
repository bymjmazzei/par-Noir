# Messaging UI surfaces

Same E2E behavior on every surface: **one pN unlock** (OAuth consent with identity file + passcode) loads messaging alongside feeds. No separate inbox unlock step.

**Channel model:** one peer connection index; threads are `(connectionId, channelClientId)`. Primary channel id is always **`platform`** (browse and messaging.parnoir.com share it). L5 apps use their OAuth `client_id` as the channel. See [ADR_MESSAGING_CHANNEL_THREADS.md](./architecture/ADR_MESSAGING_CHANNEL_THREADS.md).

## Surfaces

| Surface | Entry | Channel filter | Components |
|---------|--------|----------------|------------|
| **Messaging app** | `messages.parnoir.com` — `MessagesPage` / `Inbox` | **Aggregator**: `platform` + labeled L5 channels | Full inbox, New group |
| **Browse modal** | `App.tsx` `showInbox`, `BottomNav`, profile/feed Message actions | **`platform` only** | Same `Inbox` + `MessageThread` overlay (primary) |
| **L5 embed** | `messages.parnoir.com/embed?client_id=…` iframe | That `client_id` only | First-party unlock + filtered inbox; third parties must not call `/api/messages` |

## OAuth handoff (single unlock)

When the user unlocks pN via the padlock on `browse.parnoir.com` or `messaging.parnoir.com`, **one unlock** delivers both the OAuth authorization code and messaging keys:

1. Popup opens **same-origin** [`oauth-authorize.html`](apps/aggregator-browser/public/oauth-authorize.html) (not API consent). The page decrypts the identity file locally and extracts ML-KEM session + encrypted identity blob.
2. Before redirect, `oauth-authorize.html` writes **`pn_messaging_oauth_handoff`** to same-origin `localStorage` (shared with the main tab). Then it redirects the popup to `oauth-callback.html` with the authorization code.
3. `oauth-callback.html` reads the stashed handoff from `localStorage` first, delivers `oauth_callback` + `messagingHandoff` to the opener via postMessage/BroadcastChannel.
4. `runOAuthCallback` applies `messagingHandoff` **before** token exchange and **before** `setUnlocked`. Unlock **fails** if `isDmIdentityReady()` is false (no “OAuth-only” broken state) on **both** origins.
5. Stored: `pn_encrypted_identity_v1` (localStorage), `pn_dm_session_v1` (sessionStorage), ML-KEM in memory.

**Conversation recovery:** DM session keys are **not** stored in `localStorage`. Each thread’s opaque recovery blob lives on the user’s Drive inbox (`kemCiphertext` for the requester, `wrappedMessageRootKey` for the acceptor), **per channel**. Opening or sending a thread always re-derives `messageRootKey` from that blob plus the unlocked ML-KEM secret. The in-memory session cache is performance-only; lock/unlock or tab refresh recovers from Drive after unlock.

**Third-party OAuth** (Prism, developer portal, L5 integrators) still uses API-hosted `/oauth/consent` — they do not receive messaging ML-KEM handoff on the integrator origin. L5 clients are **denied** product routes (`/api/messages`, `/api/mailbox`, `/api/connections`, `/api/groups`, …). Chat UX is the **messaging embed** (first-party origin) filtered to their `client_id`.

**L5 connect** creates peer + that channel’s thread only — it does **not** create a primary/`platform` DM.

`identity_handoff=required` is set on authorize when messaging keys are not in memory on that origin.

## Connection status banner

[`ConnectionHealthBanner`](apps/aggregator-browser/src/components/ConnectionHealthBanner.tsx) is **read-only diagnostics** (OAuth, Drive, messaging). It does not trigger a second unlock. If messaging keys are missing, the user **locks and unlocks once** via the padlock OAuth flow.

## Key modals

- **CreateGroupModal** — title + connected members → client-wrapped `chatKey` (platform channel)
- **GroupSettingsModal** — owner: title, roles, add/remove members
- **MessageThread** / **MessageList** — DM and group threads; channel label when not `platform`
- **MessageList** — merged inbox (`getInboxThreads`): DMs + groups sorted by `lastMessageAt` (browse: platform only; messaging app: aggregator)
- **DmCryptoUnlockModal** — when encrypted identity exists in `localStorage` but the ML-KEM session is missing (passcode re-derive on device; no full OAuth re-consent)

## API (ciphertext only)

- DMs: `POST /api/messages/send` with `encryptedContent`, `cryptoVersion: 2`, `channelClientId` (default `platform`)
- Groups: `POST /api/groups`, `GET /api/groups`, `GET|POST /api/groups/:id/messages`, … (platform channel)
- List conversations: optional `channelClientId` filter; omit / `*` on messaging app = aggregator

## Manual E2E checklist (channels)

1. Connect A↔B on L5 embed (`client_id=acme`) → Acme thread only; messaging aggregator shows labeled Acme thread; no primary until platform message/connect.
2. Message on messaging.parnoir.com → primary/`platform` thread.
3. Browse Message action → primary only (no L5 dump).
4. L5 Bearer → `/api/messages` still 403 `first_party_required`.

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

## Manual dual-channel checklist

1. **Acme connect** (embed `?client_id=acme`): peer row exists; Acme thread only; **no** platform primary thread for that peer.
2. **Platform message** on messaging.parnoir.com (or browse Message): primary/`platform` thread created/used.
3. **Aggregator**: messaging app shows primary + labeled “Acme” (or client id) thread for the same peer.
4. **Acme viewport**: only Acme-channel threads.
5. **L5 Bearer → `/api/messages`**: still `403 first_party_required`.
6. **Legacy Inbox**: rows without `channelClientId` behave as `platform`.
7. Revoke Acme silo ≠ delete primary platform conversation.

See [ADR_MESSAGING_CHANNEL_THREADS.md](./architecture/ADR_MESSAGING_CHANNEL_THREADS.md) and [security/MESSAGING_COORDINATOR_POLICY.md](./security/MESSAGING_COORDINATOR_POLICY.md).
