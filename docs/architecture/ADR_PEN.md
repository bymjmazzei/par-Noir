# ADR: Pen — authored-content IR, collab replicas, authenticity

**Status:** Accepted  
**Date:** 2026-09-21  
**Related:** [`pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc), device-cloud custody, messaging outbox, L5 one-kit

## Context

par Noir needs a universal authored-content language for humans, collaborators, and agents: flow documents with section versioning, template compile targets (Notes, posts, feeds), and the same custody/collab pipes as group messaging. Legacy “Thought” is retired in favor of **Note**.

## Decisions

1. **Naming:** Pen (app/protocol), Pen Mini (browse composer), Note (`contentClass: 'note'`). Hard-cut Thought.
2. **Template-first:** Register template before UI. Starter pack: post, carousel, notes, self-hosted feed. Community marketplace later.
3. **Folder SoT:** `par-noir-pen/{docId}/` per user replica; fixed current section file; supersede → `past/{slug}-{date}`; messaging-style outbox fanout. `docKey` minted at create.
4. **Authenticity:** ML-DSA genesis + promote chain; first-party notary stamps **hashes only** (`POST /api/pen/notary/timestamp`).
5. **L5:** Silo CRUD + list templates + publish Note. No L5 multi-writer collab / groups / messages product routes.
6. **Primary acceptance:** User A creates doc, invites B, B edits, A sees update (and reverse).

## Consequences

| Gain | Cost |
|------|------|
| One IR for social + collab + agents | Large hard-cut Thought → Note |
| Portable verifiable history | Notary key custody; chain verify on apply |
| L5 can author Notes without inbox access | Collab stays first-party only |

## Non-goals (v1)

Community template marketplace, RFC 3161 external TSA, L5 multi-writer, site builder, image/video editors.
