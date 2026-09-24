# ADR: Pen — authored-content IR, collab replicas, authenticity

**Status:** Accepted  
**Date:** 2026-09-21  
**Related:** [`pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc), [`PEN_FORM_FORMAT_SURVEY.md`](./PEN_FORM_FORMAT_SURVEY.md), device-cloud custody, messaging outbox, L5 one-kit, [`@par-noir/pen-curriculum`](../../packages/pen-curriculum), [`PEN_DUAL_PN_CHECKLIST.md`](../developer/PEN_DUAL_PN_CHECKLIST.md)

## Context

par Noir needs a universal authored-content language for humans, collaborators, and agents: flow documents with section versioning, template compile targets (Notes, posts, collections, feeds), and the same custody/collab pipes as group messaging. Legacy “Thought” is retired in favor of **Note**.

## Decisions

1. **Naming:** Pen (app/protocol), Pen Mini (browse composer), Note (`contentClass: 'note'`). Hard-cut Thought. **Collections** are the product name for ordered slide/story templates (former “carousel” ids hard-cut to `collection.*`). **Sets** (`social.set`) are Social feed items that reference other docs (primary + sources); compile via `compileSetToNote`. **Live Pen embeds** (`penEmbed` TipTap node: `{ docId, sectionSlug? }`) are by-reference in the editor (Attach → From Pen); **publish-time snapshot** via `snapshotPenEmbeds` before Connect-to-feed / public compile.
2. **Template-first:** Register **class** (form) then template before UI. Hierarchy: **Category → Form → Template** (e.g. Social → Notes → Basic Note). Template `classId` is always a **form** (has `parentId`). Manifest stores `classId` at create.
3. **Taxonomy (peer categories):**
   - **Social** (consumer) — Notes, Posts, Collections, Sets. Atom content for browse tiles.
   - **Community** (consumer) — **Feeds** (`community.feed`, `entitlement: self-hosted`; moved from Social), **Landing** (`community.landing`), **Community home** (`community.home`), **Site** (`community.site`). Spaces people gather / arrive / browse. **Site is a multipage feed** (ordered pages aggregated/compiled like browse home)—**not** an Elementor-class widget site builder. Format contracts: [`PEN_FORM_FORMAT_SURVEY.md`](./PEN_FORM_FORMAT_SURVEY.md).
   - **Projects** (consumer) — Journal, List, Letter, Note. Active WIP; letter/note are correspondence shapes (**Send** opens Messaging with `#pen_correspondence_handoff_v1:`).
   - **Library** (consumer) — Book, Article, **Music** (`library.music`). Durable works + audio assets.
   - **Time** (consumer) — Calendar, Event, Schedule (calendar/scheduling).
   - **Records** (kit only, `audience: 'kit'`) — Register, **Asset key** (`records.asset_key` license receipt). Hidden from Pen New…; included in `GET /api/pen/templates` for L5.
   - **Registry note:** Living code may still expose `social.feed` until the hard-cut implement PR (`social.feed` → `community.feed`). Design SoT is this ADR + the format survey migration appendix.
4. **Lifecycle:** Library is a **template / form category** (Book, Article)—peer to Social/Projects/Time/Community, not a publish channel. Publishing a **Project** may (a) save as a **Library template** under Yours, or (b) create a **finished Library document** (durable long-form, not a social feed tile) and write it to the owner’s cloud replica (`bootstrapDocCloud` / `publishDocCloud`). **Community Site** publishes/consumes as a multipage feed of page refs under the same custody spine—not a separate site host product.
5. **Audience:** Every `PenClass` has `audience: 'consumer' | 'kit'`. Pen UI lists consumer only; API/SDK return the full catalog.
6. **Browse `contentClass`** remains the social visibility target. Pen **Publish** updates the doc’s live `current/` only. **Connect to feed** chooses **aggregator targets** (browse, pen-templates, third-party stubs) via `openBrowseWithPenHandoff` / `pen_publish_handoff_v1` — not a separate publish type. Share to **browse** → normal social post (user feeds / Discover relevance). Share to **pen-templates** → sets `penTemplateKind` (+ taxonomy / `penIrRef`); surfaces **only** on the pN templates feed page and Discover **Templates** section — never user feeds, other feeds, or Discover relevance. As template (private Yours / `par-noir-pen/templates/`) and Projects → Library template / finished work remain Pen actions. Dashboard = packed CSS grid.
7. **Folder SoT:** `par-noir-pen/{docId}/` per user replica with `doc.json`, `current/` (live published), `drafts/{draftId}/` (WIP shown as unfinished suggestions), `past/{versionId}/` (superseded current snapshots). Messaging-style outbox fanout. `docKey` minted at create. **Section bodies and attached media** are AES-GCM DM envelopes under `docKey` via `encryptMediaBytes` (not plaintext TipTap JSON / JPEG on Drive). Local/browser storage is an offline sync buffer only — never durable SoT; **local docs + docKeys are wiped on lock**. Rename/move patch `library.index.json` via `pen.doc_meta`. Starred / created templates live under `par-noir-pen/templates/{templateId}/` (IR SoT; prefs blob remains sync buffer until dedicated Drive apply lands).
7a. **Roles:** `owner` (unrevokable) | `collaborator` (invite + accept + publish) | `commentor` (draft + suggest + comment) | `viewer` (read). **Invite:** resolve peer ML-KEM via `GET /api/profile/{pn}`, seal `docKey` with `sealSocialEnvelope`, create group membership. Drafts are visible unfinished suggestions until submitted for review; owner or collaborator accepts into `current/`. **Suggest** UI (propose / accept / reject) ships in the editor with outbox fanout.
7b. **Personal templates + category pins:** Yours store + pins sync to an encrypted Drive prefs blob (`par-noir-pen-prefs.enc`) under the owner’s ML-KEM-derived key; localStorage remains a buffer. Cloud templates folder path helpers are the long-term SoT for starred IR.
7c. **Templates as dual artifacts:** A public template is (1) full Pen IR (sections, layers, `visible` / `positionLocked`) for Use/remix and (2) a published feed post (CDN / `IndexedFile` / engagement) when shared to aggregators. Use hydrates IR and respects layer visibility + position locks. Remix lineage: `basedOnTemplateId` / `basedOnFileId` + structural fingerprint (`layerLockFingerprint`) — body text alone is not a remix.
7d. **Verified gates (fail closed):** `isVerifiedAuthor` is `false` until Veriff. Unverified: Connect to feed → browse / networks; private Yours / cloud templates + Use public templates; licensing forced free. Verified: may also publish public templates (`pen-templates`), set Social / Conditional licensing, and API-key private for self-hosted community. UI disables the pen-templates target (with copy) when unverified.
8. **Rich text SoT:** Section body is TipTap/ProseMirror JSON (`PenSectionContent.doc`). Dual-pane editor: left flow TipTap + section TOC dropdown + FormatRibbon scoped to the editor column; right pane is either **browse feed-tile preview** (`@par-noir/feed-tile`: full-bleed phone + engagement rail labeled Preview) for Social, or **EditablePagePreview** + LayersPanel (non-social). Overlay layers = Product C only. Layer row chrome: **eye** (visibility) + **lock** (position lock — no move/resize). Overlay FX beyond existing Object shadow/blur is deferred. Prose image/video use `wrap: none|left|right`. Attach → From Pen inserts live `penEmbed` refs (resolve from local/cloud on save events). Cold-open editor **hydrates from cloud** (`hydrateDocFromCloud`) before showing not-found.
8a. **Three layout products (do not conflate):** (A) Dashboard = packed grid; (B) Document embeds = TipTap flow + wrap attrs; (C) Overlay design = absolute `LayoutSurface` / `section.layers`. Social live preview mirrors browse feed tile — not a letter card.
8b. **Pen Mini:** Curated only — blank + up to ~3 `browseFeatured` platform variations per social form + starred/created from cloud templates. Not the full public pool. Full public social templates: browse **pN templates** feed + Discover Templates section. Pen TemplatesBrowse unions platform IR starters + owner templates folder + cached public pen-templates index, grouped by taxonomy.
9. **Authenticity:** ML-DSA genesis + promote chain (durable keys from messaging handoff; size-aware URL hash strips DSA when over budget and merges from storage/window.name; no ephemeral fallback); first-party notary stamps **hashes only** (`POST /api/pen/notary/timestamp`).
10. **L5:** Silo CRUD + list classes/templates + publish Note. No L5 multi-writer collab / groups / messages product routes.
11. **Primary acceptance:** User A creates doc, invites B, B edits, A sees update (and reverse). Manual dual-pN checklist: [`PEN_DUAL_PN_CHECKLIST.md`](../developer/PEN_DUAL_PN_CHECKLIST.md).
12. **External agents (v0):** Starter templates ship `agentStarter` prompts (`{{user_input}}`, `{{template_id}}`, `{{section_list}}`). Agents emit **`PenAgentBuild`**; protocol validates (`validatePenAgentBuild`) and materializes IR (`materializePenAgentBuild`). Teaching data lives in **`@par-noir/pen-curriculum`** (handbook, snapshots, fixtures, eval) — model-agnostic data, not per-model plugins/MCP. Cloud write reuses first-party `apply-inbound` / `createDocFromAgentBuild` when a Pen session exists. No custom code per model.
13. **Licensing + open creator contracts (root):** Every template/doc carries a `licensing` root with **family** (`implied` | `unconditionalFree` | `unconditionalPaid`). Monetization ⊆ verified membership. Music is Pen `library.music`; paid grants mint `parnoir.license_key.v1` and buyer `records.asset_key`. Period close uses `allocatePostBounty` — see [`ADR_OPEN_CREATOR_CONTRACTS.md`](./ADR_OPEN_CREATOR_CONTRACTS.md).

## Reserved (follow-ons)

Time calendar widgets; Records register UI / query engine; **Community registry hard-cut + format-first seeds** (see [`PEN_FORM_FORMAT_SURVEY.md`](./PEN_FORM_FORMAT_SURVEY.md) migration appendix); MCP tool servers; **My fonts / cloud font grants**; engager weight refinements (repost-originated); Veriff product UX.

## Consequences

| Gain | Cost |
|------|------|
| One IR for social + collab + agents | Large hard-cut Thought → Note |
| Portable verifiable history | Notary key custody; chain verify on apply |
| L5 can author Notes without inbox access | Collab stays first-party only |
| Scalable New… (pins, search, categories) | Feed entitlement depends on storage tier |
| Clear consumer vs kit taxonomy | Kit classes must stay out of Pen New… |
| Community as peer category (feeds + landing/home/site-as-multipage-feed) | Registry rename `social.feed` → `community.feed`; format-first seed rebuild |
| Any external agent can learn Pen from curriculum + starters | Curriculum must stay pinned to protocol version |

## Non-goals (v1)

Community **template marketplace**, RFC 3161 external TSA, L5 multi-writer, **Elementor-class widget site builder** (Site = multipage feed aggregator/compiler only), image/video editors, Stripe/checkout for tiers, per-model agent plugins.
