# RFC: Messaging client coordination (dashboard / native)

**Status:** Superseded in part by [ADR_DEVICE_CLOUD_CUSTODY.md](./ADR_DEVICE_CLOUD_CUSTODY.md) for **offline delivery without operator-held cloud tokens** (mailbox + device flush ≈ option **B2**). Blind-routing / graph-hiding remains gated by [ADR_MESSAGING_BLIND_ROUTING.md](./ADR_MESSAGING_BLIND_ROUTING.md).

**Goal:** Reduce operator **cloud credential custody** and explore paths that reduce **time on wire** of routing metadata through the par Noir API without breaking the **browser API-only** rule ([SHARED_CODE_RULES.md](../../SHARED_CODE_RULES.md) § aggregator-browser).

**Related:** [MESSAGING_COORDINATOR_POLICY.md](../security/MESSAGING_COORDINATOR_POLICY.md), [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md).

---

## Background

Today, DM send flows through the L3 API coordinator:

1. Browser encrypts body client-side (`encryptedContent`, `cryptoVersion: 2`).
2. Browser `POST /api/messages/send` with `fromPnIdentifier`, `toPnIdentifier`, ciphertext.
3. API dual-writes ciphertext to sender and recipient user-owned storage (Drive sheets).
4. API may emit realtime hints and append optional user-owned ledgers.

Phase 2 of metadata minimization reduces **logging and realtime payload** exposure; it does **not** remove the API from the send path.

This RFC evaluates whether **L2 dashboard** or **native (Capacitor)** clients can write ciphertext **directly** to user storage for some sends, while L4 browser continues to read via API.

---

## Layer constraints

| Layer | Component | Messaging storage rule |
|-------|-----------|------------------------|
| L4 | aggregator-browser | **API-only** — no `googleapis.com` in bundle |
| L2 | id-dashboard | Identity-direct; may use established Drive session |
| L3 | API | Coordinator for browser; may still fan-out recipient copy |
| Native | `capacitor-messaging` | Same as L2 when device holds session |

**Non-goal:** Relaxing browser API-only so the browser bundle talks to Google directly. That does not reduce operator exposure vs status quo and violates architecture rules.

---

## Options

| Option | Graph exposure (par Noir) | Fits layers | Notes |
|--------|---------------------------|-------------|-------|
| **A. Status quo + Phase 2** | API sees routing per send | L3 coordinator | **Default**; simplest; already shipped logging/realtime minimization |
| **B. Dashboard “privacy send”** | API may still see routing on recipient fan-out | L2 write; L4 read via API | Browser deep-links to dashboard; dashboard writes sender sheet via Drive |
| **C. Native/Capacitor messaging** | Same as B | L2 on device | Uses device-stored session from `apps/aggregator-browser/capacitor-messaging/` |
| **D. Browser direct Drive** | N/A | **Not recommended** | No reduction vs A; breaks API-only rule |

**Recommendation:** Stay on **A** unless product explicitly wants “minimize par Noir as routing observer.” If yes, prototype **B** or **C** only — not as default for all users.

---

## Option B/C — proposed flow (prototype scope)

### Sender side (dashboard or native)

1. User chooses “Send via dashboard” (feature-flagged deep link from browser) or uses native messaging UI.
2. Client derives / loads ML-KEM session (same `@par-noir/dm-crypto` path as browser).
3. Client encrypts `encryptedContent` locally.
4. Client writes row to **sender’s** conversation sheet using dashboard’s Google path, matching row shape from `messageSheetsService` (messageId, timestamps, ciphertext, empty `content`).

### Recipient delivery (open design)

| Approach | par Noir sees to/from? | Complexity |
|----------|------------------------|------------|
| **B1. API fan-out** | Yes, once per send (same as today) | Low — reuse `appendMessage` for recipient sheet only |
| **B2. Recipient pull** | No live send metadata on API | High — recipient polls Drive or inbox API without sender posting through API |

Prototype should document which approach is used. **B1** is acceptable for a spike; **B2** is the path toward reduced coordinator visibility.

### Browser (unchanged)

- Default send remains `POST /api/messages/send`.
- Optional UI: “Open in dashboard for private send” behind feature flag — no rule change.

---

## Portable storage

[`@par-noir/user-owned-storage`](../../packages/user-owned-storage) and [`messagePortableService`](../../api/src/server/modules/storage/messagePortableService.ts) abstract non-Google providers. Coordinator policy and Phase 2 logging rules apply regardless of provider.

---

## Prototype acceptance criteria (post-approval only)

1. One documented E2E test path: dashboard/native encrypt → write sender sheet → recipient receives ciphertext (via B1 or B2).
2. Default browser user flow unchanged.
3. Threat model and [MESSAGING_COORDINATOR_POLICY.md](../security/MESSAGING_COORDINATOR_POLICY.md) updated for any new metadata paths.
4. No prototype merged without explicit RFC **approved** sign-off.

---

## Non-goals

- Removing API from all messaging paths (see [ADR_MESSAGING_BLIND_ROUTING.md](./ADR_MESSAGING_BLIND_ROUTING.md)).
- Storing ML-KEM secrets or passcodes server-side.
- Changing browser API-only without architecture amendment.

---

## Decision requested

- [ ] **Approve A only** — no prototype; coordinator + Phase 2 minimization is sufficient.
- [ ] **Approve B/C prototype** — specify B1 vs B2 for recipient delivery and assign owner.
- [ ] **Defer** — revisit after launch metrics / user feedback.

**Approvers:** _TBD_

**Date:** _TBD_
