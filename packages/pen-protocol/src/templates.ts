/** Pen template registry + starter pack. */

import type { PenPageLayout, PenPagePresentation, PenSectionContent } from './types.js';
import type { PenLicensingRoot } from './licensing.js';
import { emptySection } from './richDoc.js';
import {
  seedArticle,
  seedAssetKey,
  seedAudio,
  seedBook,
  seedCalendar,
  seedCode,
  seedCollectionBasic,
  seedCollectionStory,
  seedCommunityHome,
  seedComparison,
  seedEvent,
  seedFeedCurated,
  seedFeedEmbed,
  seedFeedSelfHosted,
  seedFrame,
  seedJournal,
  seedKnowledgeClaim,
  seedLanding,
  seedLetter,
  seedLink,
  seedMetric,
  seedMusic,
  seedNoteArticle,
  seedNoteBasicLandscape,
  seedNoteBasicPortrait,
  seedNoteMediaLandscape,
  seedNoteMediaPortrait,
  seedNoteTextTileDark,
  seedNoteTextTileLight,
  seedPoll,
  seedPostCaption,
  seedPostImageAspect,
  seedPostVideoAspect,
  seedProfile,
  seedQuote,
  seedRegister,
  seedSchedule,
  seedSetBasic,
  seedSite,
  seedTablePrimitive,
  type SeedBundle
} from './starterSeeds.js';

export type PenDocType = 'note' | 'post' | 'collection' | 'self_hosted_feed' | string;

export interface PenTemplateSection {
  slug: string;
  title: string;
  required?: boolean;
}

/** Column schema for kit Registers (relational stub — not a query engine). */
export type PenRegisterColumnType = 'string' | 'number' | 'boolean' | 'date';

export interface PenRegisterColumn {
  id: string;
  title: string;
  type: PenRegisterColumnType;
  required?: boolean;
}

export interface PenTemplate {
  id: string;
  /** Form class id (e.g. social.note), never a category. */
  classId: string;
  docType: PenDocType;
  version: string;
  title: string;
  description: string;
  sections: PenTemplateSection[];
  /** Social compile target */
  publishContentClass?: 'note' | 'media' | 'collection';
  /**
   * Public display name for “authored by …”.
   * Platform starters omit this and resolve to {@link PLATFORM_TEMPLATE_AUTHOR}.
   */
  authorDisplayName?: string;
  /**
   * Agent starter brief. Placeholders: {{user_input}}, {{template_id}}, {{section_list}}.
   * External agents compose this with the user ask — no per-model plugins.
   */
  agentStarter: string;
  /** Present on register templates — agents emit `rows` matching these columns. */
  registerColumns?: PenRegisterColumn[];
  /** Demo TipTap sections for preview / create-from-template. */
  seedSections?: PenSectionContent[];
  /** Default page chrome when creating / previewing from this template. */
  seedPagePresentation?: PenPagePresentation;
  /** Default page layout when creating / previewing from this template. */
  seedPageLayout?: PenPageLayout;
  /** Gallery thumb aspect (Social orientations). */
  seedGalleryAspect?: '9/16' | '16/9' | '1/1';
  /** Default multipage swipe axis (collections → x). */
  seedPageSwipeAxis?: 'x' | 'y';
  /** Featured in Pen Mini (~3 per form). */
  browseFeatured?: boolean;
  /** Optional CDN-backed public template preview. */
  previewFileId?: string;
  /** Work license + open creator contracts (optional on platform starters). */
  licensing?: PenLicensingRoot;
}

/** Default author label for first-party / starter templates. */
export const PLATFORM_TEMPLATE_AUTHOR = 'par noir';

function withSeed(
  base: Omit<PenTemplate, 'seedSections' | 'seedPagePresentation' | 'seedPageLayout'>,
  seed: SeedBundle
): PenTemplate {
  return {
    ...base,
    seedSections: seed.seedSections,
    seedPagePresentation: seed.seedPagePresentation,
    seedPageLayout: seed.seedPageLayout
  };
}

export function templateAuthorLabel(
  template: Pick<PenTemplate, 'authorDisplayName'> | null | undefined
): string {
  const name = template?.authorDisplayName?.trim();
  return name || PLATFORM_TEMPLATE_AUTHOR;
}

/** Build a short imperative agentStarter for a prose/flow template. */
function proseStarter(input: {
  title: string;
  focus: string;
}): string {
  return [
    `You are authoring a Pen document with template {{template_id}} ("${input.title}").`,
    input.focus,
    'Sections for this template: {{section_list}}.',
    'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "sections": [{ "slug", "plainText" }] }.',
    'Use only the section slugs listed. Do not invent folder paths, file layouts, or parallel formats.',
    'Never include secrets, pn name, passcodes, tokens, or raw account identifiers.',
    'User request:',
    '{{user_input}}'
  ].join('\n');
}

function registerStarter(input: {
  title: string;
  columns: PenRegisterColumn[];
}): string {
  const cols = input.columns
    .map((c) => `${c.id}:${c.type}${c.required ? '*' : ''}`)
    .join(', ');
  return [
    `You are authoring a Pen Register with template {{template_id}} ("${input.title}").`,
    `Columns ( *=required ): ${cols}.`,
    'Emit ONLY a PenAgentBuild JSON object: { "templateId", "title", "rows": [ { columnId: value, ... } ] }.',
    'Do not use freeform TipTap sections for row data. Do not invent folder paths or extra columns.',
    'Never include secrets, pn name, passcodes, tokens, or raw account identifiers.',
    'User request:',
    '{{user_input}}'
  ].join('\n');
}

const DEFAULT_REGISTER_COLUMNS: PenRegisterColumn[] = [
  { id: 'id', title: 'Id', type: 'string', required: true },
  { id: 'label', title: 'Label', type: 'string', required: true },
  { id: 'notes', title: 'Notes', type: 'string', required: false }
];

const STARTER: PenTemplate[] = [
  withSeed(
    {
      id: 'note.basic.portrait.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Note (Portrait)',
      description: 'Text-first portrait Note for browse',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Note (Portrait)',
        focus: 'Fill the required body with clear prose suitable for a browse Note. Text must dominate.'
      })
    },
    seedNoteBasicPortrait()
  ),
  withSeed(
    {
      id: 'note.text_tile.light.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Text Tile (Light)',
      description: 'Twitter-style status card on a light ground',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Text Tile (Light)',
        focus: 'Write one clear status thought inside the light card. Text must dominate.'
      })
    },
    seedNoteTextTileLight()
  ),
  withSeed(
    {
      id: 'note.text_tile.dark.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Text Tile (Dark)',
      description: 'Twitter-style status card on a dark ground',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Text Tile (Dark)',
        focus: 'Write one clear status thought inside the dark card. Text must dominate.'
      })
    },
    seedNoteTextTileDark()
  ),
  withSeed(
    {
      id: 'note.basic.landscape.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Note (Landscape)',
      description: 'Text-first landscape Note',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '16/9',
      agentStarter: proseStarter({
        title: 'Note (Landscape)',
        focus: 'Write a headline and short sub-message. Text must dominate.'
      })
    },
    seedNoteBasicLandscape()
  ),
  withSeed(
    {
      id: 'note.media.portrait.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Note on Media (Portrait)',
      description: 'Text card/scrim over quiet media — text still dominates',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Note on Media (Portrait)',
        focus: 'Write protected overlay text. Media is backdrop only.'
      })
    },
    seedNoteMediaPortrait()
  ),
  withSeed(
    {
      id: 'note.media.landscape.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Note on Media (Landscape)',
      description: 'Split media + dominant text card',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      seedGalleryAspect: '16/9',
      agentStarter: proseStarter({
        title: 'Note on Media (Landscape)',
        focus: 'Write the text card; media is secondary.'
      })
    },
    seedNoteMediaLandscape()
  ),
  withSeed(
    {
      id: 'note.article.v1',
      classId: 'social.note',
      docType: 'note',
      version: '1',
      title: 'Article Note',
      description: 'Title + body Note',
      sections: [
        { slug: 'title', title: 'Title', required: true },
        { slug: 'body', title: 'Body', required: true }
      ],
      publishContentClass: 'note',
      browseFeatured: true,
      agentStarter: proseStarter({
        title: 'Article Note',
        focus:
          'Provide a short title section and a full body. Title section is display title text, not only the JSON title field.'
      })
    },
    seedNoteArticle()
  ),
  withSeed(
    {
      id: 'post.caption.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Caption Post',
      description: 'Caption-forward post over a still',
      sections: [
        { slug: 'caption', title: 'Caption', required: true },
        { slug: 'attachments', title: 'Attachments', required: false }
      ],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Caption Post',
        focus:
          'Write the caption. Mention attachment refs in attachments only if the user provided media identifiers; otherwise omit attachments.'
      })
    },
    seedPostCaption()
  ),
  withSeed(
    {
      id: 'post.image.portrait.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Image Post (Portrait)',
      description: 'Locked portrait image frame with optional caption',
      sections: [
        { slug: 'attachments', title: 'Media', required: true },
        { slug: 'caption', title: 'Caption', required: false }
      ],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Image Post (Portrait)',
        focus: 'Describe media attachments the user named; add an optional short caption.'
      })
    },
    seedPostImageAspect('portrait')
  ),
  withSeed(
    {
      id: 'post.image.landscape.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Image Post (Landscape)',
      description: 'Locked landscape image frame',
      sections: [
        { slug: 'attachments', title: 'Media', required: true },
        { slug: 'caption', title: 'Caption', required: false }
      ],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '16/9',
      agentStarter: proseStarter({
        title: 'Image Post (Landscape)',
        focus: 'Describe landscape media; optional caption.'
      })
    },
    seedPostImageAspect('landscape')
  ),
  withSeed(
    {
      id: 'post.image.square.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Image Post (Square)',
      description: '1:1 image frame',
      sections: [
        { slug: 'attachments', title: 'Media', required: true },
        { slug: 'caption', title: 'Caption', required: false }
      ],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '1/1',
      agentStarter: proseStarter({
        title: 'Image Post (Square)',
        focus: 'Describe square media; optional caption.'
      })
    },
    seedPostImageAspect('square')
  ),
  withSeed(
    {
      id: 'post.video.portrait.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Video Post (Portrait)',
      description: 'Locked 9:16 video frame',
      sections: [
        { slug: 'attachments', title: 'Media', required: true },
        { slug: 'caption', title: 'Caption', required: false }
      ],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Video Post (Portrait)',
        focus: 'Describe the video the user named; add an optional short caption.'
      })
    },
    seedPostVideoAspect('portrait')
  ),
  withSeed(
    {
      id: 'post.video.landscape.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Video Post (Landscape)',
      description: 'Locked 16:9 video frame',
      sections: [
        { slug: 'attachments', title: 'Media', required: true },
        { slug: 'caption', title: 'Caption', required: false }
      ],
      publishContentClass: 'note',
      seedGalleryAspect: '16/9',
      agentStarter: proseStarter({
        title: 'Video Post (Landscape)',
        focus: 'Describe landscape video; optional caption.'
      })
    },
    seedPostVideoAspect('landscape')
  ),
  withSeed(
    {
      id: 'post.video.square.v1',
      classId: 'social.post',
      docType: 'post',
      version: '1',
      title: 'Video Post (Square)',
      description: 'Locked 1:1 video frame',
      sections: [
        { slug: 'attachments', title: 'Media', required: true },
        { slug: 'caption', title: 'Caption', required: false }
      ],
      publishContentClass: 'note',
      seedGalleryAspect: '1/1',
      agentStarter: proseStarter({
        title: 'Video Post (Square)',
        focus: 'Describe square video; optional caption.'
      })
    },
    seedPostVideoAspect('square')
  ),
withSeed(
    {
      id: 'collection.basic.v1',
      classId: 'social.collection',
      docType: 'collection',
      version: '1',
      title: 'Collection',
      description: 'Ordered pages with distinct stills',
      sections: [
        { slug: 'slide-1', title: 'Slide 1', required: true },
        { slug: 'slide-2', title: 'Slide 2', required: false }
      ],
      publishContentClass: 'collection',
      browseFeatured: true,
      seedPageSwipeAxis: 'x',
      agentStarter: proseStarter({
        title: 'Collection',
        focus: 'Write slide-1 content; add slide-2 only if the user needs a second page. Same asset class per page.'
      })
    },
    seedCollectionBasic()
  ),
  withSeed(
    {
      id: 'collection.story.v1',
      classId: 'social.collection',
      docType: 'collection',
      version: '1',
      title: 'Story Collection',
      description: 'Vertical story cover + pages (same-type multipage)',
      sections: [
        { slug: 'cover', title: 'Cover', required: true },
        { slug: 'pages', title: 'Pages', required: true }
      ],
      publishContentClass: 'collection',
      browseFeatured: true,
      seedPageSwipeAxis: 'x',
      agentStarter: proseStarter({
        title: 'Story Collection',
        focus: 'Write a cover line and story pages body.'
      })
    },
    seedCollectionStory()
  ),
  withSeed(
    {
      id: 'set.basic.v1',
      classId: 'social.set',
      docType: 'set',
      version: '1',
      title: 'Set',
      description:
        'Multi-media refs — mix different templates/posts (not same-type multipage)',
      sections: [
        { slug: 'primary', title: 'Primary', required: true },
        { slug: 'sources', title: 'Sources', required: false }
      ],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Set',
        focus:
          'Describe the primary item; list penEmbed source refs in sources when provided. Mix media types.'
      })
    },
    seedSetBasic()
  ),
  withSeed(
    {
      id: 'feed.self_hosted.v1',
      classId: 'community.feed',
      docType: 'self_hosted_feed',
      version: '1',
      title: 'Self-hosted Feed',
      description: 'Feed meta + membership rules (config)',
      sections: [
        { slug: 'meta', title: 'Feed meta', required: true },
        { slug: 'rules', title: 'Rules', required: false }
      ],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Self-hosted Feed',
        focus: 'Fill feed meta (name/purpose). Add membership rules only if the user specified them.'
      })
    },
    seedFeedSelfHosted()
  ),
  withSeed(
    {
      id: 'feed.curated.v1',
      classId: 'community.feed',
      docType: 'self_hosted_feed',
      version: '1',
      title: 'Curated Feed',
      description: 'Curated index (config)',
      sections: [
        { slug: 'meta', title: 'Feed meta', required: true },
        { slug: 'index', title: 'Index', required: false }
      ],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Curated Feed',
        focus: 'Fill feed meta; optionally describe the curated index.'
      })
    },
    seedFeedCurated()
  ),
  withSeed(
    {
      id: 'landing.basic.v1',
      classId: 'community.landing',
      docType: 'landing',
      version: '1',
      title: 'Landing',
      description: 'L5 page chrome — hero/value/CTA + community.feed_embed slot',
      sections: [
        { slug: 'hero', title: 'Hero', required: true },
        { slug: 'value', title: 'Value', required: true },
        { slug: 'feed_embed', title: 'Feed embed', required: false },
        { slug: 'cta', title: 'CTA', required: true }
      ],
      agentStarter: proseStarter({
        title: 'Landing',
        focus:
          'Write hero headline, value/proof bullets, optional feed_embed slot note, and a clear CTA. Feed embed is a live stream slot — not longform.'
      })
    },
    seedLanding()
  ),
  withSeed(
    {
      id: 'home.basic.v1',
      classId: 'community.home',
      docType: 'community_home',
      version: '1',
      title: 'Community Home',
      description: 'Banner, nav, feed_embed iframe slot, announcements',
      sections: [
        { slug: 'banner', title: 'Banner', required: true },
        { slug: 'nav', title: 'Nav', required: false },
        { slug: 'feed_embed', title: 'Feed embed', required: true },
        { slug: 'announcements', title: 'Announcements', required: false }
      ],
      agentStarter: proseStarter({
        title: 'Community Home',
        focus:
          'Fill banner identity, feed_embed slot (live stream), and optional nav/announcements.'
      })
    },
    seedCommunityHome()
  ),
  withSeed(
    {
      id: 'site.basic.v1',
      classId: 'community.site',
      docType: 'site',
      version: '1',
      title: 'Site',
      description: 'Ordered multipage feed of page refs',
      sections: [{ slug: 'pages', title: 'Pages', required: true }],
      agentStarter: proseStarter({
        title: 'Site',
        focus: 'List ordered page refs for the multipage feed (landing, home, social pages).'
      })
    },
    seedSite()
  ),
  withSeed(
    {
      id: 'journal.basic.v1',
      classId: 'projects.journal',
      docType: 'journal',
      version: '1',
      title: 'Journal',
      description:
        'Example Project starter — users publish their own Projects as templates for depth',
      sections: [{ slug: 'entries', title: 'Entries', required: true }],
      agentStarter: proseStarter({
        title: 'Journal',
        focus:
          'Write dated journal entries. Prefer composing from Social/Time atoms rather than inventing Project-only forms.'
      })
    },
    seedJournal()
  ),
  withSeed(
    {
      id: 'letter.basic.v1',
      classId: 'projects.letter',
      docType: 'letter',
      version: '1',
      title: 'Letter',
      description: 'Example correspondence Project — Send opens Messaging',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      agentStarter: proseStarter({
        title: 'Letter',
        focus: 'Write the letter body (greeting, content, closing) in body.'
      })
    },
    seedLetter()
  ),
  withSeed(
    {
      id: 'book.basic.v1',
      classId: 'library.book',
      docType: 'book',
      version: '1',
      title: 'Book',
      description: 'Longform compile target — atom sequence (vertical within unit)',
      sections: [
        { slug: 'front', title: 'Front', required: false },
        { slug: 'body', title: 'Body', required: true }
      ],
      seedPageSwipeAxis: 'y',
      agentStarter: proseStarter({
        title: 'Book',
        focus:
          'Longform: body is a unit sequence. Vertical within unit; horizontal between units. Optional front matter.'
      })
    },
    seedBook()
  ),
  withSeed(
    {
      id: 'article.basic.v1',
      classId: 'library.article',
      docType: 'article',
      version: '1',
      title: 'Article',
      description: 'Longform compile target — durable article as atom sequence',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      seedPageSwipeAxis: 'y',
      agentStarter: proseStarter({
        title: 'Article',
        focus: 'Write a durable article body as a longform atom sequence.'
      })
    },
    seedArticle()
  ),
  withSeed(
    {
      id: 'music.basic.v1',
      classId: 'library.music',
      docType: 'music',
      version: '1',
      title: 'Music',
      description: 'Cover art + track meta and audio',
      sections: [
        { slug: 'meta', title: 'Meta', required: true },
        { slug: 'audio', title: 'Audio', required: true }
      ],
      agentStarter: proseStarter({
        title: 'Music',
        focus: 'Fill track meta (title, artist) and attach audio in audio.'
      })
    },
    seedMusic()
  ),
  withSeed(
    {
      id: 'calendar.basic.v1',
      classId: 'time.calendar',
      docType: 'calendar',
      version: '1',
      title: 'Calendar',
      description: 'Calendar shell — lists/embeds Event atoms (grid later)',
      sections: [
        { slug: 'meta', title: 'Meta', required: true },
        { slug: 'events', title: 'Events', required: false }
      ],
      agentStarter: proseStarter({
        title: 'Calendar',
        focus: 'Fill calendar meta; list eventRef lines for time.event atoms when provided.'
      })
    },
    seedCalendar()
  ),
  withSeed(
    {
      id: 'event.basic.v1',
      classId: 'time.event',
      docType: 'event',
      version: '1',
      title: 'Event',
      description: 'Structured when/where (tz + placeLabel + optional geoProofRef)',
      sections: [{ slug: 'details', title: 'Details', required: true }],
      agentStarter: proseStarter({
        title: 'Event',
        focus:
          'Emit title/startAt/endAt/timeZone/placeLabel/details key lines. Never raw lat/lng — use geoProofRef for place proofs.'
      })
    },
    seedEvent()
  ),
  withSeed(
    {
      id: 'schedule.basic.v1',
      classId: 'time.schedule',
      docType: 'schedule',
      version: '1',
      title: 'Schedule',
      description: 'Ordered agenda rows for humans and agents',
      sections: [{ slug: 'agenda', title: 'Agenda', required: true }],
      agentStarter: proseStarter({
        title: 'Schedule',
        focus: 'Write ordered agenda rows as “HH:MM — Title (Nm)” lines.'
      })
    },
    seedSchedule()
  ),
  withSeed(
    {
      id: 'knowledge.claim.v1',
      classId: 'knowledge.claim',
      docType: 'knowledge',
      version: '1',
      title: 'Knowledge Claim',
      description: 'Claims bound to standard-data-points + ZKP — never raw PII',
      sections: [{ slug: 'claims', title: 'Claims', required: true }],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Knowledge Claim',
        focus:
          'Bind dataPointId catalog ids and opaque proofRef slots only. Never emit age, email, name, passcode, or coordinates.'
      })
    },
    seedKnowledgeClaim()
  ),
  
  withSeed(
    {
      id: 'quote.basic.v1',
      classId: 'social.quote',
      docType: 'quote',
      version: '1',
      title: 'Quote Card',
      description: 'Highlight / soundbite',
      sections: [{ slug: 'body', title: 'Quote', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Quote Card',
        focus: 'Write a short quotable line and optional byline. Keep under ~40 words.'
      })
    },
    seedQuote()
  ),
  withSeed(
    {
      id: 'link.basic.v1',
      classId: 'social.link',
      docType: 'link',
      version: '1',
      title: 'Link Card',
      description: 'Bookmark / OG summary',
      sections: [{ slug: 'body', title: 'Link', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      agentStarter: proseStarter({
        title: 'Link Card',
        focus: 'Provide domain, title, and a short snippet — not a raw URL dump.'
      })
    },
    seedLink()
  ),
  withSeed(
    {
      id: 'poll.basic.v1',
      classId: 'social.poll',
      docType: 'poll',
      version: '1',
      title: 'Poll',
      description: 'Survey widget — embeds cloud table + vote stickers',
      sections: [{ slug: 'prompt', title: 'Prompt', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Poll',
        focus: 'Write the poll question. Options live in the bound table primitive.'
      })
    },
    seedPoll()
  ),
  withSeed(
    {
      id: 'comparison.basic.v1',
      classId: 'social.frame',
      docType: 'comparison',
      version: '1',
      title: 'Comparison Matrix',
      description: 'Embeds a cloud table as comparison chrome',
      sections: [{ slug: 'body', title: 'Body', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      agentStarter: proseStarter({
        title: 'Comparison Matrix',
        focus: 'Describe comparison axes; cell data lives in the bound table primitive.'
      })
    },
    seedComparison()
  ),
  withSeed(
    {
      id: 'metric.basic.v1',
      classId: 'social.metric',
      docType: 'metric',
      version: '1',
      title: 'Metric / KPI',
      description: 'Big-number callout',
      sections: [{ slug: 'body', title: 'Metric', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      agentStarter: proseStarter({
        title: 'Metric / KPI',
        focus: 'Provide value, delta with timeframe, and metric label.'
      })
    },
    seedMetric()
  ),
  withSeed(
    {
      id: 'code.basic.v1',
      classId: 'social.code',
      docType: 'code',
      version: '1',
      title: 'Code Snippet',
      description: 'Syntax card',
      sections: [{ slug: 'body', title: 'Code', required: true }],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Code Snippet',
        focus: 'Provide language badge and a short code body.'
      })
    },
    seedCode()
  ),
  withSeed(
    {
      id: 'profile.basic.v1',
      classId: 'social.profile',
      docType: 'profile',
      version: '1',
      title: 'Profile Card',
      description: 'Member / contributor badge',
      sections: [{ slug: 'body', title: 'Profile', required: true }],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Profile Card',
        focus: 'Fill display name, role, and short bio.'
      })
    },
    seedProfile()
  ),
  withSeed(
    {
      id: 'audio.basic.v1',
      classId: 'social.audio',
      docType: 'audio',
      version: '1',
      title: 'Audio Snippet',
      description: 'Audio-first shell — bind audioSotDocId to published music/audio SoT',
      sections: [{ slug: 'body', title: 'Audio', required: true }],
      publishContentClass: 'note',
      browseFeatured: true,
      seedGalleryAspect: '9/16',
      agentStarter: proseStarter({
        title: 'Audio Snippet',
        focus:
          'Name the track; audio-only is valid. Companion visuals remix via audioSotDocId — do not re-upload bytes.'
      })
    },
    seedAudio()
  ),
  withSeed(
    {
      id: 'frame.basic.v1',
      classId: 'social.frame',
      docType: 'frame',
      version: '1',
      title: 'Interactive Frame',
      description: 'Embed stage + stickers (no third-party webview)',
      sections: [{ slug: 'body', title: 'Frame', required: true }],
      publishContentClass: 'note',
      agentStarter: proseStarter({
        title: 'Interactive Frame',
        focus: 'Describe the framed content; interactions bind to a cloud primitive.'
      })
    },
    seedFrame()
  ),
  withSeed(
    {
      id: 'feed.embed.v1',
      classId: 'community.feed_embed',
      docType: 'feed_embed',
      version: '1',
      title: 'Feed Embed',
      description: 'L5 iframe / framed stream slot (not longform chapters)',
      sections: [
        { slug: 'header', title: 'Header', required: true },
        { slug: 'stream', title: 'Stream', required: true },
        { slug: 'footer', title: 'Footer', required: false }
      ],
      agentStarter: proseStarter({
        title: 'Feed Embed',
        focus:
          'Fill header chrome and stream iframe empty-state. This is a live aggregator slot inside page chrome — not longform.'
      })
    },
    seedFeedEmbed()
  ),
  withSeed(
    {
      id: 'table.basic.v1',
      classId: 'primitives.table',
      docType: 'table',
      version: '1',
      title: 'Cloud Table',
      description: 'Kit cloud grid reference object',
      sections: [{ slug: 'grid', title: 'Grid', required: true }],
      agentStarter: proseStarter({
        title: 'Cloud Table',
        focus: 'Do not invent TipTap tables for tallies — structured table.v1 rows only via tooling.'
      })
    },
    seedTablePrimitive()
  ),
withSeed(
    {
      id: 'register.basic.v1',
      classId: 'records.register',
      docType: 'register',
      version: '1',
      title: 'Register',
      description: 'Typed register rows (kit)',
      sections: [{ slug: 'rows', title: 'Rows', required: true }],
      registerColumns: DEFAULT_REGISTER_COLUMNS,
      agentStarter: registerStarter({
        title: 'Register',
        columns: DEFAULT_REGISTER_COLUMNS
      })
    },
    seedRegister()
  ),
  withSeed(
    {
      id: 'asset_key.basic.v1',
      classId: 'records.asset_key',
      docType: 'asset_key',
      version: '1',
      title: 'Asset Key',
      description: 'Paid license receipt (kit) — asset ref, scope, price, ZKP',
      sections: [
        { slug: 'grant', title: 'Grant', required: true },
        { slug: 'proof', title: 'Proof', required: true }
      ],
      agentStarter: proseStarter({
        title: 'Asset Key',
        focus: 'Record asset id, scope, price, and license-key proof after purchase.'
      })
    },
    seedAssetKey()
  )
];

const byId = new Map(STARTER.map((t) => [t.id, t]));

export function listStarterTemplates(): PenTemplate[] {
  return [...STARTER];
}

export function getTemplate(templateId: string): PenTemplate | undefined {
  const direct = byId.get(templateId);
  if (direct) return direct;
  return resolveBlankTemplateId(templateId) || undefined;
}

export function requireTemplate(templateId: string): PenTemplate {
  const t = getTemplate(templateId);
  if (!t) throw new Error(`unknown_pen_template:${templateId}`);
  return t;
}

/** Pen Mini: featured platform templates for a form (cap applied by caller). */
export function listBrowseFeaturedTemplates(classId?: string): PenTemplate[] {
  return listStarterTemplates().filter(
    (t) => t.browseFeatured && (!classId || t.classId === classId)
  );
}

/**
 * Synthetic blank template for a form (empty sections matching a starter of that class).
 * Id is `blank.${classId}` (also accepts legacy `blank.${classId}.v1` via getTemplate).
 */
export function blankTemplateForClass(classId: string): PenTemplate | null {
  const sample = listStarterTemplates().find((t) => t.classId === classId);
  if (!sample) return null;
  return {
    id: `blank.${classId}`,
    classId,
    docType: sample.docType,
    version: '1',
    title: 'Blank',
    description: 'Empty document',
    sections: sample.sections.map((s) => ({ ...s })),
    browseFeatured: false,
    seedSections: sample.sections.map((s) => emptySection(s.slug)),
    agentStarter: proseStarter({
      title: 'Blank',
      focus: 'Fill the sections listed for this blank form.'
    })
  };
}

/** Custom blank (no class starter) — used by Pen New → Blank → Custom. */
function blankCustomTemplate(): PenTemplate {
  return {
    id: 'blank.custom',
    classId: 'custom.doc',
    docType: 'custom',
    version: '1',
    title: 'Blank',
    description: 'Empty custom document',
    sections: [{ slug: 'body', title: 'Body', required: true }],
    browseFeatured: false,
    seedSections: [emptySection('body')],
    agentStarter: proseStarter({
      title: 'Blank',
      focus: 'Freeform custom document.'
    })
  };
}

/**
 * Resolve `blank.${classId}` / `blank.${classId}.v1` / `blank.custom(.v1)`.
 * CreateBlank historically appended `.v1`; catalog id does not.
 */
function resolveBlankTemplateId(templateId: string): PenTemplate | null {
  const id = String(templateId || '').trim();
  if (!id.startsWith('blank.')) return null;
  const body = id.endsWith('.v1') ? id.slice(0, -3) : id;
  if (body === 'blank.custom') return blankCustomTemplate();
  const classId = body.slice('blank.'.length);
  if (!classId || classId.includes('..')) return null;
  return blankTemplateForClass(classId);
}
