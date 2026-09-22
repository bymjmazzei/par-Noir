# ADR: Pen — authored-content IR, collab replicas, authenticity

**Status:** Accepted  
**Date:** 2026-09-21  
**Related:** [`pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc), device-cloud custody, messaging outbox, L5 one-kit

## Context

par Noir needs a universal authored-content language for humans, collaborators, and agents: flow documents with section versioning, template compile targets (Notes, posts, collections, feeds), and the same custody/collab pipes as group messaging. Legacy “Thought” is retired in favor of **Note**.

## Decisions

1. **Naming:** Pen (app/protocol), Pen Mini (browse composer), Note (`contentClass: 'note'`). Hard-cut Thought. **Collections** are the product name for ordered slide/story templates (former “carousel” ids hard-cut to `collection.*`). **Sets** (`social.set`) are Social feed items that reference other docs (primary + sources); embed/ref compile is a follow-on.
2. **Template-first:** Register **class** (form) then template before UI. Hierarchy: **Category → Form → Template** (e.g. Social → Notes → Basic Note). Template `classId` is always a **form** (has `parentId`). Manifest stores `classId` at create.
3. **Taxonomy (peer categories):**
   - **Social** (consumer) — Notes, Posts, Collections, Sets, Feeds (`entitlement: self-hosted` on Feeds). Browse/feed purpose.
   - **Projects** (consumer) — Journal, List, Letter, Note. Active WIP; letter/note are correspondence shapes (DM delivery later), not a separate category.
   - **Library** (consumer) — Book, Article. Durable works. Peer to Projects (not a subclass).
   - **Time** (consumer) — Calendar, Event, Schedule (calendar/scheduling).
   - **Records** (kit only, `audience: 'kit'`) — Register. Hidden from Pen New…; included in `GET /api/pen/templates` for L5.
4. **Lifecycle (documented, not implemented):** Publishing a Project **as a whole** later promotes it into a Library asset. That is a promote path, not a hierarchy edge.
5. **Audience:** Every `PenClass` has `audience: 'consumer' | 'kit'`. Pen UI lists consumer only; API/SDK return the full catalog.
6. **Browse `contentClass`** remains the publish target only. `docType` is compile/preview hint. Client may pin categories, search the catalog, and toggle home **All** / **By category** / **Dashboard**; prefs are local. Dashboard widgets use a **packed CSS grid** (`DashboardGridTile`: col/row/span; drag swaps 1×1 cells)—not absolute pasteboard layout.
7. **Folder SoT:** `par-noir-pen/{docId}/` per user replica; fixed current section file; supersede → `past/{slug}-{date}`; messaging-style outbox fanout. `docKey` minted at create.
8. **Rich text SoT:** Section body is TipTap/ProseMirror JSON (`PenSectionContent.doc`). Dual-pane editor: left flow TipTap edits the active text layer; right editable page (`LayoutSurface`) places **overlay** layers only (`PenSectionContent.layers` text/image with % rects). Prose **image/video** embeds stay in the flow doc with `wrap: none|left|right` (float beside text)—not in layers. Legacy `{ blocks }` migrates once on load. Compile (`renderRich`) emits float HTML for wrap. In-doc `pen.comment` / `pen.suggestion` ride the Pen outbox → apply-inbound; public comments stay on `/api/engagement/:fileId/*`. Manifest `pageLayout: flow|letter|a4`. No multi-cursor CRDT.
8a. **Three layout products (do not conflate):** (A) Dashboard = packed grid; (B) Document embeds = TipTap flow + wrap attrs; (C) Overlay design = absolute `LayoutSurface` / `section.layers`.
9. **Authenticity:** ML-DSA genesis + promote chain; first-party notary stamps **hashes only** (`POST /api/pen/notary/timestamp`).
10. **L5:** Silo CRUD + list classes/templates + publish Note. No L5 multi-writer collab / groups / messages product routes.
11. **Primary acceptance:** User A creates doc, invites B, B edits, A sees update (and reverse).

## Reserved (follow-ons)

Set source refs + engagement on primary; Project→Library promote API; Time calendar widgets; Correspondence DM handoff; Records register UI; site/spaces categories.

## Consequences

| Gain | Cost |
|------|------|
| One IR for social + collab + agents | Large hard-cut Thought → Note |
| Portable verifiable history | Notary key custody; chain verify on apply |
| L5 can author Notes without inbox access | Collab stays first-party only |
| Scalable New… (pins, search, categories) | Feed entitlement depends on storage tier |
| Clear consumer vs kit taxonomy | Kit classes must stay out of Pen New… |

## Non-goals (v1)

Community template marketplace, RFC 3161 external TSA, L5 multi-writer, site builder, image/video editors, Stripe/checkout for tiers, syncing category pins to cloud, Set embed protocol, Project→Library runtime promote.
