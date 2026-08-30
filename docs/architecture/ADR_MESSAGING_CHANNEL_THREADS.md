# ADR: Messaging channel threads (peer index + per-channel DMs)

**Status:** Accepted  
**Date:** 2026-08-30  
**Related:** [L5_ONE_KIT_REVIEW.md](../developer/L5_ONE_KIT_REVIEW.md), [MESSAGING_UI_SURFACES.md](../MESSAGING_UI_SURFACES.md), [ADR_DEVICE_CLOUD_CUSTODY.md](./ADR_DEVICE_CLOUD_CUSTODY.md)

## Context

Connections were a single global graph with one DM thread per peer. L5 integrators must not see the user’s full inbox, but users need Acme-scoped chat, Greenbee-scoped chat, and a platform primary DM — with messaging.parnoir.com able to aggregate.

## Decision

1. **Peer edge** remains one row in `_metadata/connections.xlsx` (`connectionId` = sorted peer pair). Crypto capability (peer ML-KEM) is shared.
2. **Threads** are keyed by `(connectionId, channelClientId)`:
   - `platform` = **primary** channel (default). Both `browser-app` and `messaging-app` use this id — browse is a *viewport*, not a separate channel.
   - L5 OAuth `client_id` = that app’s channel.
3. **L5 connect/accept** creates peer (if needed) + **that channel’s thread only**. It does **not** create a primary/`platform` Inbox row.
4. **Primary** appears when the user connects/messages on a first-party surface with `channelClientId=platform`.
5. **Ciphertext layout:**
   - Platform: `par-noir-messages/` (unchanged paths).
   - L5: `integrators/{client_id}/messages/`.
6. **Per-channel message root keys** — reuse peer ML-KEM public key; new wrap/root per channel so Acme ciphertext ≠ platform ciphertext.
7. **L5 product access** remains first-party-only for `/api/messages` etc. L5 sites embed a messaging-origin viewport filtered to their `client_id`.
8. **Viewports:**
   - browse → primary only
   - messaging.parnoir.com → aggregator (primary + labeled L5 threads)
   - L5 iframe → that channel only

## Consequences

| Gain | Cost |
|------|------|
| L5 blast radius per channel/silo | Inbox schema gains `channelClientId`; resolver is peer+channel |
| Clear UX: Acme chat ≠ primary DM | Accept/send must pass channel |
| Aggregator without giving L5 full mail | Embed unlock per messaging origin |

## Non-goals

- Migrating historical primary DMs into silos
- Auto-creating primary on L5 connect
- Third-party Bearer access to message REST
