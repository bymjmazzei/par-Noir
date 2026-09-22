# ADR: Pen — authored-content IR, collab replicas, authenticity

**Status:** Accepted  
**Date:** 2026-09-21  
**Related:** [`pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc), device-cloud custody, messaging outbox, L5 one-kit

## Context

par Noir needs a universal authored-content language for humans, collaborators, and agents: flow documents with section versioning, template compile targets (Notes, posts, collections, feeds), and the same custody/collab pipes as group messaging. Legacy “Thought” is retired in favor of **Note**.

## Decisions

1. **Naming:** Pen (app/protocol), Pen Mini (browse composer), Note (`contentClass: 'note'`). Hard-cut Thought. **Collections** are the product name for ordered slide/story templates (former “carousel” ids hard-cut to `collection.*`).
2. **Template-first:** Register **class** (form) then template before UI. Hierarchy: **Category → Form → Template** (e.g. Social → Notes → Basic Note). Starter category: Social (Notes, Posts, Collections, Feeds). Community marketplace later.
3. **Classes:** Template `classId` is always a **form** (has `parentId`). Manifest stores `classId` at create. Browse `contentClass` remains the publish target only. Feed form requires `storageTier === 'self-hosted'` (client gate; no Stripe in Pen v1). Client may pin categories and search the catalog; pins are local prefs.
4. **Folder SoT:** `par-noir-pen/{docId}/` per user replica; fixed current section file; supersede → `past/{slug}-{date}`; messaging-style outbox fanout. `docKey` minted at create.
5. **Authenticity:** ML-DSA genesis + promote chain; first-party notary stamps **hashes only** (`POST /api/pen/notary/timestamp`).
6. **L5:** Silo CRUD + list classes/templates + publish Note. No L5 multi-writer collab / groups / messages product routes.
7. **Primary acceptance:** User A creates doc, invites B, B edits, A sees update (and reverse).

## Reserved (not implemented)

Future categories (broader content ontology), `custody.*` / register / dossier families. Do not import external taxonomies as live registry rows until designed.

## Consequences

| Gain | Cost |
|------|------|
| One IR for social + collab + agents | Large hard-cut Thought → Note |
| Portable verifiable history | Notary key custody; chain verify on apply |
| L5 can author Notes without inbox access | Collab stays first-party only |
| Scalable New… (pins, search, categories) | Feed entitlement depends on storage tier |

## Non-goals (v1)

Community template marketplace, RFC 3161 external TSA, L5 multi-writer, site builder, image/video editors, Stripe/checkout for tiers, syncing category pins to cloud.
