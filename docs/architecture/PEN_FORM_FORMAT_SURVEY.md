# Pen form format survey

**Status:** Design (docs only)  
**Date:** 2026-09-24  
**Related:** [`ADR_PEN.md`](./ADR_PEN.md), [`.cursor/rules/pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc), prior Pexels seed pack (anti-pattern baseline)

## Method

Study **public product formats** (section roles, primary vs secondary surface, empty states, compile/preview target). Do **not** copy kits, skins, assets, or branding from Canva, Notion Marketplace, Elementor, Framer, etc.

| Extract | Do not extract |
|---|---|
| Section roles / block order | Visual skins, fonts, stock photos |
| What’s primary vs secondary | Proprietary kit files |
| Empty-state affordances | Marketplace listings to rehost |
| Compile/preview target | Widget runtimes / Elementor builders |

**References** below are product *names* for provenance only.

---

## Taxonomy context (this survey)

Peer categories after Community hard-cut (registry implement deferred):

| Category | Forms | Job |
|---|---|---|
| **Social** | Notes, Posts, Collections, Sets, Quote, Link, Poll, Metric, Code, Profile, Audio, Frame | Atom content for browse tiles (dominance + orientation — see [`PEN_TEMPLATE_SPEC_V0.md`](./PEN_TEMPLATE_SPEC_V0.md)) |
| **Community** | Feeds (config), Feed embed, Landing, Community home, Site | Spaces people gather / arrive / browse as a multipage feed |
| **Projects** | Journal, List, Letter, Note | Active WIP + correspondence |
| **Library** | Book, Article, Music | Durable works |
| **Time** | Calendar, Event, Schedule | Scheduling |
| **Records** (kit) | Register, Asset key | Structured kit data |
| **Primitives** (kit) | Table | Cloud reference grids; templates embed; stickers bind |

**Site ≠ site builder.** A Site is a **multipage feed**: ordered pages aggregated/compiled the way browse home surfaces content—not an Elementor-class widget IDE.

---

## Social

### Note (`social.note`)

| | |
|---|---|
| **Purpose** | Short-to-medium **text-first** browse artifact |
| **Primary surface** | Typography / body flow |
| **Secondary** | Optional inline image/video (wrap), not obligatory full-bleed hero |
| **Section roles** | `body` required; optional `title` |
| **Compile / preview** | Browse feed tile; text-led card (presentation may tint bg, but media is not the format) |
| **Empty state** | “Start writing…” — not “add cover photo” |
| **References** | Apple Notes, Notion plain page, Instagram caption-only / text posts, Twitter/X text posts |
| **Anti-pattern (current seeds)** | Full-bleed Pexels hero + caption overlay — reads as a Post |

### Post (`social.post`)

| | |
|---|---|
| **Purpose** | **Media-first** social unit (image or video) |
| **Primary surface** | Locked media frame (image **or** video) |
| **Secondary** | Caption under/over media |
| **Section roles** | `attachments` (or media) required; `caption` optional |
| **Compile / preview** | Browse tile with media dominant; engagement rail |
| **Empty state** | “Add photo/video” then optional caption |
| **References** | Instagram feed post / Reel, TikTok, YouTube Shorts (frame + caption) |
| **Anti-pattern** | Caption-only with decorative stock as if it were the body; stock that doesn’t mark media as required |

### Collection (`social.collection`)

| | |
|---|---|
| **Purpose** | **Ordered multipage** story / slides — mix of note-like and post-like pages |
| **Primary surface** | Sequence of pages with **typed page roles** |
| **Page roles** | At least: `text` (note-like) and `media` (post-like); optional `cover` |
| **Section roles** | Ordered slugs (`slide-1`… or `cover` + `pages`); each page declares role |
| **Compile / preview** | Swipeable collection / `contentClass: collection` |
| **Empty state** | “Add page” → choose text or media page |
| **References** | Instagram Stories/carousels, Apple Photos Memories, Notion gallery databases (as *sequence*, not DB UI) |
| **Anti-pattern** | Two identical photo slides with titles — no role distinction |

### Set (`social.set`)

| | |
|---|---|
| **Purpose** | **Dynamic aggregation of other docs** — primary + sources (refs), not a collage |
| **Primary surface** | Primary embed / ref |
| **Secondary** | Ordered source refs (other Pen docs / feed items) |
| **Section roles** | `primary` required; `sources` optional list of refs |
| **Compile / preview** | `compileSetToNote` / set semantics; live `penEmbed` where applicable |
| **Empty state** | “Choose primary” / “Add source” |
| **References** | Spotify playlists (refs), Notion linked databases (as *refs*), Substack “recommended reading” blocks |
| **Anti-pattern** | Hero stock photo + “Source A/B” plaintext with no doc refs |

---

## Community

### Feed (`community.feed`)

| | |
|---|---|
| **Purpose** | **Feed configuration** for a self-hosted / curated stream people subscribe to |
| **Primary surface** | Config: meta + membership/rules + index — preview as a **feed**, not a mood board |
| **Section roles** | `meta` required; `rules` and/or `index` optional |
| **Compile / preview** | Feed chrome (list/rail of members’ posts), not a single social tile |
| **Empty state** | Name the feed; define who can post; empty stream state |
| **References** | pN browse home / subscribed feeds, Discord channel lists (as *stream*), Substack publication home |
| **Anti-pattern** | Hero still + “My feed” caption with no feed semantics |
| **Entitlement** | Keep `self-hosted` |

### Feed embed (`community.feed_embed`)

| | |
|---|---|
| **Purpose** | **Framed configurable stream** embeddable in portals/workspaces — not full Home/Landing/Site |
| **Primary surface** | Compact chronological cards + filter header + micro-composer |
| **Section roles** | `header` (scope/filters), `stream` (cards), `composer` (sticky footer) |
| **Compile / preview** | Framed embed chrome; not a full community hub page |
| **Empty state** | Empty stream inside frame; “Choose feed scope” |
| **Anti-pattern** | Loading full page layouts inside the embed frame; fixed heights that break scroll |

### Landing (`community.landing`)

| | |
|---|---|
| **Purpose** | **Single arrival page** — first impression + CTA |
| **Primary surface** | Sectioned page: hero → value/proof → CTA |
| **Section roles (contract)** | `hero` (headline + optional media), `value` (benefits/proof), `cta` (action); optional `embed` (feed/Pen embed slot) |
| **Compile / preview** | Full page / multipage-feed item; not a phone social tile by default |
| **Empty state** | Placeholder headline + “Add CTA” |
| **References** | Carrd single-page sites, Linktree-style arrival (structure only), Elementor/Framer *section catalogs* named hero/CTA/features (pattern names only), classic landing checklists (value prop, proof, CTA) |
| **Anti-pattern** | Decorating a blank doc with one stock photo |

### Community home (`community.home`)

| | |
|---|---|
| **Purpose** | **Hub** for a community space |
| **Primary surface** | Banner/identity + nav slots + featured stream + announcements |
| **Section roles (contract)** | `banner`, `nav`, `featured` (feed/embed), `announcements`; optional `about` |
| **Compile / preview** | Hub layout; featured region behaves like a feed embed |
| **Empty state** | “Name your community”; empty featured stream |
| **References** | Discord server home / channels overview, Circle community home, Mighty Networks home, Facebook Group “About + Featured” |
| **Anti-pattern** | Single mood-board image labeled “community” |

### Site (`community.site`)

| | |
|---|---|
| **Purpose** | **Multipage feed** of pages (Landing / Community home / Social pages) — aggregator/compiler, not a widget builder |
| **Primary surface** | Ordered toc of page refs (or sections that compile to pages) |
| **Section roles** | `pages` (ordered refs to Pen docs / page sections); optional `nav` labels |
| **Compile / preview** | Same consumption model as **browse home**: swipe/scroll an ordered feed of pages |
| **Empty state** | “Add page” → pick existing Landing/Home/Note/Post or blank page |
| **References** | pN browse home multipage rail, Framer multi-page *as ordered pages* (not component library), Notion “wiki” as linked pages (refs only) |
| **Anti-pattern** | Elementor/Framer widget runtime, theme kits, drag-drop site builder IDE |
| **Product rule** | Site = template aggregator + multipage feed compiler under normal Pen custody |

---

## Projects

### Journal (`projects.journal`)

| | |
|---|---|
| **Purpose** | **Dated log** of entries over time |
| **Primary surface** | Repeating **entry** blocks: date + body |
| **Section roles** | `entries` as a sequence of dated units (or one section with structured entry parts) |
| **Compile / preview** | Letter/paper editor; chronological list |
| **Empty state** | “New entry” with today’s date |
| **References** | Day One, Apple Journal, Notion daily journal (date + prompt/body) |
| **Anti-pattern** | One stock header image + a single “Thursday” heading |

### List (`projects.list`)

| | |
|---|---|
| **Purpose** | Checklist / shopping / running tasks |
| **Primary surface** | **Item rows** with check state |
| **Section roles** | `items` — each item: label + `checked` (boolean); optional notes |
| **Compile / preview** | List UI; not freeform paragraphs of `☐` characters |
| **Empty state** | “Add item” |
| **References** | Apple Reminders, Things, Google Keep checklists, Notion to-do |
| **Anti-pattern** | Unicode checkbox glyphs inside a TipTap paragraph as the “format” |

### Letter (`projects.letter`)

| | |
|---|---|
| **Purpose** | Correspondence for DM handoff later |
| **Primary surface** | Locked **regions**: salutation, body, closing/signature |
| **Section roles** | Prefer `salutation`, `body`, `closing` (or one body with locked layer regions) |
| **Compile / preview** | Letter layout; Send → messaging handoff |
| **Empty state** | “Dear …,” / body / “Sincerely,” |
| **References** | Classic formal letter, email compose (To/subject separate; body regions), Notion “letter to future self” (as *regions*, not marketplace kit) |
| **Anti-pattern** | Loose paragraphs + decorative letterhead stock only |

### Project Note (`projects.note`)

| | |
|---|---|
| **Purpose** | Short correspondence card (DM later) |
| **Primary surface** | Brief message body; optional accent |
| **Section roles** | `body` required |
| **Compile / preview** | Card / letter-small |
| **References** | Greeting card fronts, iMessage note, short email |
| **Anti-pattern** | Full social-post media treatment |

---

## Library (brief)

| Form | Format contract (summary) | References | Anti-pattern |
|---|---|---|---|
| **Book** | Front matter (title/cover optional) + chaptered `body`; longform letter/A4 | Print book front matter, Scrivener binder (as *sections*) | Cover-only stock with no chapter structure |
| **Article** | Headline + durable body; optional hero **secondary** to text | Medium/Substack article, Apple News | Hero-first social post dressed as article |
| **Music** | Cover + meta (title/artist) + audio slot required | Bandcamp/Spotify track page (structure) | Cover art without audio affordance |

---

## Time (brief)

| Form | Format contract (summary) | References | Anti-pattern |
|---|---|---|---|
| **Calendar** | Meta + event list / grid affordance | Apple Calendar, Google Calendar | Stock “desk calendar” photo as the product |
| **Event** | Title, when, where, details | Eventbrite event page, Calendar event sheet | Hero club photo without datetime fields |
| **Schedule** | Ordered agenda rows (time + label) | Conference run-of-show, calendar day agenda | Header image + prose bullet times only |

---

## Records (kit, brief)

| Form | Format contract | Anti-pattern |
|---|---|---|
| **Register** | Typed columns + rows (already `registerColumns`) | Decorative chrome pretending to be a sheet |
| **Asset key** | Grant fields + proof | Marketing tile |

---

## Cross-cutting rules for a future format-first seed pass

1. **Form job first** — if the seed could be mistaken for another form in the gallery, it fails.
2. **Stock is optional illustration** of a format — never the format.
3. **Community pages** use section contracts above; Site consumes them as a multipage feed.
4. **Social Mini** stays curated for Social forms; Community forms appear in Pen New… / TemplatesBrowse under Community.
5. **Dominance** — Note = text-dominant; Post = media-dominant (see [`PEN_TEMPLATE_SPEC_V0.md`](./PEN_TEMPLATE_SPEC_V0.md)).
6. **Cloud table primitives** — kit `primitives.table` is SoT for poll tallies / comparison grids; templates embed; stickers bind; TipTap tables are not SoT.

---

## Primitives (kit)

### Table (`primitives.table`)

| | |
|---|---|
| **Purpose** | Cloud **reference grid** (columns + rows) — poll options/tallies, comparison matrices |
| **Primary surface** | Structured `table.v1` JSON in section SoT (not freeform TipTap) |
| **Discovery** | Hidden from Pen New…; Insert / mint-on-template-use; L5 catalog |
| **Host binding** | Overlay `embed` layer (`refDocId`) and/or flow `penEmbed`; stickers `interactive` with `bindDocId` |
| **Anti-pattern** | `social.table` TipTap-only form pretending to be vote/results SoT |

---

## Migration appendix (registry hard-cut — implemented)

### Class id rename / add map

| Current | Target | Notes |
|---|---|---|
| `social.feed` | `community.feed` | Move form under new category `community`; keep `entitlement: self-hosted` |
| `feed.self_hosted.v1` / `feed.curated.v1` | Keep template ids **or** retitle only; update `classId` to `community.feed` | Prefer stable template ids; hard-cut classId |
| — | `community` (category) | New peer category, `audience: consumer` |
| — | `community.landing` | New form |
| — | `community.home` | New form |
| — | `community.site` | New form (multipage feed) |
| — | `landing.*.v1`, `home.*.v1`, `site.*.v1` | New platform starters (format-first; later PR) |

Docs already using “self-hosted community” for L5 feeds remain valid; Pen **class** taxonomy is what moves.

### Files to touch in the implement PR (not this pass)

1. [`packages/pen-protocol/src/classes.ts`](../../packages/pen-protocol/src/classes.ts) — add `community` + forms; remove feed from `social`.
2. [`packages/pen-protocol/src/templates.ts`](../../packages/pen-protocol/src/templates.ts) + [`starterSeeds.ts`](../../packages/pen-protocol/src/starterSeeds.ts) — format-first seeds; new Landing/Home/Site starters; Feed seeds as config not mood board.
3. Pen New… / TemplatesBrowse taxonomy grouping; `listConsumerCategories` tests.
4. [`packages/pen-curriculum`](../../packages/pen-curriculum) catalog snapshot + handbook.
5. Any `social.feed` string checks in apps/api (grep hard-cut).
6. Agent `agentStarter` prompts for new forms.

### Next implement checklist

- [x] Registry: Community category + Feed move + Landing / Home / Site forms  
- [x] Format-first seed rebuild per tables above (delete stock-as-format anti-patterns)  
- [x] Gallery/preview: text-first Notes; Feed config chrome; Landing/Home/Site section roles  
- [x] Curriculum + acceptance tests for classId invariants  
- [x] No Elementor widget runtime; Site remains aggregator/compiler  

*(Implemented in format-first Community registry pass.)*
---

## Non-goals (this document)

- Community **template marketplace**  
- Elementor/Framer widget runtimes  
- Copying third-party template files or assets
