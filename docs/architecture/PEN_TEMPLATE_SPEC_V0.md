# Pen template spec v0

**Status:** Design SoT (imported from v0 Templates sheet)  
**Date:** 2026-09-24  
**Related:** [`ADR_PEN.md`](./ADR_PEN.md), [`PEN_FORM_FORMAT_SURVEY.md`](./PEN_FORM_FORMAT_SURVEY.md), [`.cursor/rules/pen-templates.mdc`](../../.cursor/rules/pen-templates.mdc)

Normalized from the Template Specifications sheet. **Component Level** is product vocabulary (Primitive / Compound / Container). Registry `classId` stays Category → Form → Template.

## Cross-cutting rules

| Rule | Spec |
|---|---|
| **Dominance** | Note templates exist only when **text is the dominant asset**. Corner/small overlay text on video/image is a **Post**. Crop test: if cropping away text leaves a complete media post, it is a Post. |
| **Orientation** | Portrait / landscape / square are **separate template ids** (mainly Social). |
| **Feed config vs embed** | `community.feed` = feed **config**. `community.feed_embed` = **framed** configurable stream chrome (not full home/landing/site). |
| **Cloud table** | Kit `primitives.table` is a **reference object** under Pen doc custody. Polls/templates **embed** it; interactive stickers **bind** to it; votes log into table rows (runtime follow-on). TipTap tables are static prose only — never vote/results SoT. |
| **Interactive stickers** | Overlay layers `kind: interactive` with `behavior` + `bindDocId`. Foundation IR first; click handlers stub until engagement write path. |

## Sheet rows

| Template Type | Level | Job | Hierarchy | Regions | Mood | Anti-patterns |
|---|---|---|---|---|---|---|
| Basic Note (Portrait) | Primitive | Short text thought / status | Body text | Top bar, center canvas, bottom bar | Minimal, punchy | Cramped margins, low contrast, walls of text |
| Basic Note (Landscape) | Primitive | Desktop/feed text banner | Headline + sub | Left/center focus, footer/header | Editorial, balanced | Multi-line centered walls, cluttered corners |
| Note on Media (Portrait) | Compound | Text on imagery | Foreground text card/scrim | Top bar, overlay card, bottom scrim | Cinematic, readable | Light text on busy highlights without scrim |
| Note on Media (Landscape) | Compound | Widescreen text + media | Split focal — media + text block | Media layer, text container, meta tray | Polished rule-of-thirds | Text across high-frequency texture without card |
| Video Post (Portrait) | Primitive | Vertical reel | 9:16 video | Safe title 15%, stage 70%, dock 15% | Kinetic | Captions in notch or interaction dock |
| Video Post (Landscape) | Primitive | 16:9 video | Video + lower-third | Stage, subtitle rail, title/meta | Studio | Heavy UI over viewport |
| Image Post (Portrait) | Primitive | Vertical photo/graphic | Visual subject | Image stage, caption drawer, badge | Clean framing | Crop subject; center watermarks |
| Image Post (Landscape) | Primitive | Horizontal photo | Full-width visual | Display stage, caption band, meta | Gallery calm | Fake blurred letterbox |
| Image Post (Square) | Primitive | 1:1 grid image | Centered square | Square viewport, action bar, caption | Punchy | Letterbox 16:9 into 1:1 |
| Video Post (Square) | Primitive | 1:1 feed video | 1:1 canvas | Square canvas, overlay controls, meta | Social-native | Tiny subtitles; action outside center |
| Multipage Basic Note | Container | Swipeable text guide | Step indicator + headline | Header rail, content stage, footer | Pedagogical | Inconsistent type/margins across slides |
| Multipage Media | Container | Media carousel | Primary media per slide | Gallery viewport, pager, caption | Curated | Mixed aspects causing jump |
| Multiple Templates (Set) | Container | Multi-format sequence | Narrative thread | Navigator, modular body, source tray | Episodic | Font/layout thrash between slides |
| Community Home | Container | Hub | Banner + featured + feed | Hero, nav, sidebar, feed | Welcoming | Illegible banners; buried join |
| Community Feed Embed | Container | Compact stream embed | Chronological feed | Header filters, stream, micro-composer | Utilitarian | Full heavy page in embed frame |
| Journal compilation | Container | Multi-entry digest | Title + dated entries | Header, TOC, entry stream | Archival | Strip timestamps; flatten notes |
| Article / Editorial | Container | Longform | Headline + dek + body | Hero header, body column, sticky TOC | Authoritative | Full-width walls; no subheads |
| Quote / Highlight | Primitive | Soundbite card | Oversized quote | Quotation canvas, scrim, byline | Expressive | >40 words; distracting stock |
| Poll & Survey | Compound | Voting widget | Prompt + options + tallies | Prompt, vote deck, status rail | Playful transparent | Ambiguous options; hidden tallies |
| Event & Live | Compound | Event card | Date badge + title + CTA | Date stamp, details, action bar | Timely | Omit timezone; bury RSVP |
| Link & Bookmark | Primitive | OG preview card | Thumbnail + title + domain | Preview, meta, title/snippet | Utility | Raw URLs; broken OG |
| Audio Snippet | Compound | Voice/audiogram | Waveform + avatar + player | Speaker badge, player, transcript | Intimate | Autoplay sound; no transcript |
| Member Profile | Compound | Contributor badge | Avatar + name + bio | Identity mast, bio, action dock | Warm | Pixelated avatars; badge spam |
| Metric / KPI | Primitive | Big number | Stat + delta | Metric canvas, label, timeframe | Analytical | Delta without window |
| Data Table / Comparison | Compound | Matrix (embeds cloud table) | Headers + cells | Header band, matrix, summary | Systematic | Unaligned numbers; chaos wrap |
| Code Block | Primitive | Syntax snippet | Code viewport | Chrome, viewport, console | Developer | Proportional fonts; no copy |
| Interactive frame | Compound | Host embed + stickers | Frame + bound controls | Embed stage, utility rail | Integrated | Nested double scroll; no fallback |

## Registry mapping

| Sheet | `classId` / approach |
|---|---|
| Notes (P/L, on-media) | `social.note` — orientation-split template ids; on-media only if text dominates |
| Image/Video posts | `social.post` — orientation-split ids |
| Collections / Set | `social.collection` / `social.set` |
| Quote, Link, Metric, Code, Profile, Audio | `social.quote`, `social.link`, `social.metric`, `social.code`, `social.profile`, `social.audio` |
| Poll | `social.poll` — embeds `primitives.table` + interactive stickers |
| Comparison matrix | Consumer compound under `social.poll` or dedicated comparison starter embedding table — **not** TipTap-as-SoT `social.table` |
| Interactive frame | `social.frame` — embed layer + stickers; no third-party webview runtime |
| Feed embed | `community.feed_embed` |
| Feed config / Landing / Home / Site | existing Community forms |
| Event | `time.event` |
| Article | `library.article` |
| Journal digest | `projects.journal` |
| Cloud table SoT | `primitives.table` (kit) |
