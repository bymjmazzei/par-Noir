# ADR: Pen — authored-content IR, collab replicas, authenticity

**Status:** Accepted  
**Date:** 2026-09-21  
**Related:** [`pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc), device-cloud custody, messaging outbox, L5 one-kit

## Context

par Noir needs a universal authored-content language for humans, collaborators, and agents: flow documents with section versioning, template compile targets (Notes, posts, collections, feeds), and the same custody/collab pipes as group messaging. Legacy “Thought” is retired in favor of **Note**.

## Decisions

1. **Naming:** Pen (app/protocol), Pen Mini (browse composer), Note (`contentClass: 'note'`). Hard-cut Thought. **Collections** are the product name for ordered slide/story templates (former “carousel” ids hard-cut to `collection.*`). **Sets** (`social.set`) are Social feed items that reference other docs (primary + sources). **Live Pen embeds** (`penEmbed` TipTap node: `{ docId, sectionSlug? }`) are by-reference in the editor (Attach → From Pen); publish-time snapshot for public feed compile remains a follow-on.
2. **Template-first:** Register **class** (form) then template before UI. Hierarchy: **Category → Form → Template** (e.g. Social → Notes → Basic Note). Template `classId` is always a **form** (has `parentId`). Manifest stores `classId` at create.
3. **Taxonomy (peer categories):**
   - **Social** (consumer) — Notes, Posts, Collections, Sets, Feeds (`entitlement: self-hosted` on Feeds). Browse/feed purpose.
   - **Projects** (consumer) — Journal, List, Letter, Note. Active WIP; letter/note are correspondence shapes (DM delivery later), not a separate category.
   - **Library** (consumer) — Book, Article. Durable works. Peer to Projects (not a subclass).
   - **Time** (consumer) — Calendar, Event, Schedule (calendar/scheduling).
   - **Records** (kit only, `audience: 'kit'`) — Register. Hidden from Pen New…; included in `GET /api/pen/templates` for L5.
4. **Lifecycle:** Library is a **template / form category** (Book, Article)—peer to Social/Projects/Time, not a publish channel. Publishing a **Project** may (a) save as a **Library template** under Yours, or (b) create a **finished Library document** (durable long-form, not a social feed tile). Cloud share/API for finished work is still reserved.
5. **Audience:** Every `PenClass` has `audience: 'consumer' | 'kit'`. Pen UI lists consumer only; API/SDK return the full catalog.
6. **Browse `contentClass`** remains the social publish target. Pen **Publish ▾**: Social (handoff `pen_publish:` → browse); As template (personal Yours); for Projects also As Library template + As finished work. Dashboard = packed CSS grid.
7. **Folder SoT:** `par-noir-pen/{docId}/` per user replica; fixed current section file; supersede → `past/{slug}-{date}`; messaging-style outbox fanout. `docKey` minted at create.
8. **Rich text SoT:** Section body is TipTap/ProseMirror JSON (`PenSectionContent.doc`). Dual-pane editor: left flow TipTap + section TOC dropdown + FormatRibbon scoped to the editor column; right pane is either **browse feed-tile preview** (Social: full-bleed `pagePresentation` + right engagement rail) or **EditablePagePreview** + LayersPanel (non-social). Overlay layers = Product C only. Prose image/video use `wrap: none|left|right`. Attach → From Pen inserts live `penEmbed` refs (resolve from local store on save events).
8a. **Three layout products (do not conflate):** (A) Dashboard = packed grid; (B) Document embeds = TipTap flow + wrap attrs; (C) Overlay design = absolute `LayoutSurface` / `section.layers`. Social live preview mirrors browse feed tile — not a letter card.
9. **Authenticity:** ML-DSA genesis + promote chain; first-party notary stamps **hashes only** (`POST /api/pen/notary/timestamp`).
10. **L5:** Silo CRUD + list classes/templates + publish Note. No L5 multi-writer collab / groups / messages product routes.
11. **Primary acceptance:** User A creates doc, invites B, B edits, A sees update (and reverse).

## Reserved (follow-ons)

Set primary + multi-source engagement compile; publish-time snapshot of `penEmbed` for public feeds; finished Library work **cloud** share/API; Time calendar widgets; Correspondence DM handoff; Records register UI; site/spaces categories; collab Suggest UI.

## Consequences

| Gain | Cost |
|------|------|
| One IR for social + collab + agents | Large hard-cut Thought → Note |
| Portable verifiable history | Notary key custody; chain verify on apply |
| L5 can author Notes without inbox access | Collab stays first-party only |
| Scalable New… (pins, search, categories) | Feed entitlement depends on storage tier |
| Clear consumer vs kit taxonomy | Kit classes must stay out of Pen New… |

## Non-goals (v1)

Community template marketplace, RFC 3161 external TSA, L5 multi-writer, site builder, image/video editors, Stripe/checkout for tiers, syncing category pins to cloud.
