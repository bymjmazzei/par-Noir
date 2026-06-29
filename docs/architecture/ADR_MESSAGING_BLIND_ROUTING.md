# ADR: Blind routing for messaging

**Status:** **No-go gate** — no blind-routing engineering until this ADR records an explicit **go** decision.

**Context:** The par Noir API currently acts as a **coordinator**: it sees `fromPnIdentifier` / `toPnIdentifier` in transit to dual-write ciphertext to user-owned storage. Phase 2 minimizes logging, realtime payloads, and operator retention; it does not hide the social graph from the operator during send.

**Related:** [MESSAGING_COORDINATOR_POLICY.md](../security/MESSAGING_COORDINATOR_POLICY.md), [MESSAGING_CLIENT_COORDINATION_RFC.md](./MESSAGING_CLIENT_COORDINATION_RFC.md).

---

## Decision gate

Before any blind-routing spike or implementation, leadership must answer:

1. **Is hiding the graph from par Noir required** if **Google Drive** (or the user’s storage provider) still sees file names, sheet structure, and sharing ACLs?
2. **What UX cost is acceptable?** (discovery, groups, attachments, connection accept, realtime notifications.)
3. **What is the legal/privacy promise to users?** (marketing copy must match engineering reality.)

### Outcomes

| Decision | Action |
|----------|--------|
| **NO** | Close this ADR as **no-go**; remain on coordinator model + Phase 2 minimization + optional RFC B/C prototype. |
| **YES** | Record **go** below; fund spike; update threat model; no code merge without updated policy. |

**Current recommendation:** **NO** — coordinator + minimized logging is proportionate unless product commits to “operator must not know the social graph.”

---

## What “blind routing” would mean

The API would route or deliver messages **without learning** (or without retaining) who messages whom. Example directions (spike only — not implementation commitments):

| Direction | Idea | par Noir graph | Provider graph |
|-----------|------|----------------|----------------|
| Sealed sender | Recipient id encrypted to server pubkey; server routes opaquely | Reduced if not logged | Unchanged |
| Drive-only relay | Users poll own Drive; no central send with to/from | Reduced on API | Unchanged |
| Mix network | Third-party relays | Out of scope for par Noir core | Varies |

---

## Dependencies that would break or require rework

Blind routing conflicts with or complicates:

| Area | Location | Why |
|------|----------|-----|
| Group fan-out | `apps/aggregator-browser/src/services/groupService.ts`, API group routes | Fan-out needs member list |
| Attachment ACL | `messagingMediaService.ts` | Grants reference recipient identity |
| Connection accept | `connectionsService.ts`, accept routes | Stores `kemCiphertext`, peer ids |
| Realtime notifications | `realtimeEvents.ts`, Socket.IO | Today targets `pn:` rooms by identifier |
| Device policy / proofs | device-auth, proof signing | May bind actions to identity |
| Inbox / connection discovery | inbox sheets, connection sheets | Structural metadata on user Drive |

Any **go** decision must include a phased plan for these surfaces.

---

## Acceptance criteria (if **go**)

1. ADR signed with named approvers and date.
2. Updated [MESSAGING_ARCHITECTURE.md](../MESSAGING_ARCHITECTURE.md) threat model.
3. Updated [MESSAGING_COORDINATOR_POLICY.md](../security/MESSAGING_COORDINATOR_POLICY.md) data-class table.
4. Spike doc with chosen approach, UX impact, and provider-metadata honesty.
5. **No** blind-routing production code merged without all of the above.

---

## Record

| Field | Value |
|-------|-------|
| **Decision** | _Pending — default **no-go**_ |
| **Date** | _TBD_ |
| **Approvers** | _TBD_ |
| **Notes** | Phase 2 (logging, realtime trim, policy) ships without blind routing. |
