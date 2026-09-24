/** Format-first seed IR for platform starters (see PEN_FORM_FORMAT_SURVEY.md). */

import type {
  PenPageLayer,
  PenPageLayout,
  PenPagePresentation,
  PenSectionContent,
  PenTipTapNode
} from './types.js';
import { STARTER_ASSETS } from './starterAssets.js';
import { emptyPollTable, tableSectionFromPayload } from './table.js';
import { SEED_TABLE_DOC_PLACEHOLDER } from './seedRefs.js';

export function tipTapParagraphs(...paras: string[]): PenTipTapNode {
  return {
    type: 'doc',
    content: paras.map((text) => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : []
    }))
  };
}

export function tipTapHeading(text: string, level = 1): PenTipTapNode {
  return {
    type: 'heading',
    attrs: { level },
    content: text ? [{ type: 'text', text }] : []
  };
}

export function tipTapDoc(...nodes: PenTipTapNode[]): PenTipTapNode {
  return {
    type: 'doc',
    content: nodes.flatMap((n) => (n.type === 'doc' ? n.content || [] : [n]))
  };
}

function bulletList(...items: string[]): PenTipTapNode {
  return {
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: text ? [{ type: 'text', text }] : []
        }
      ]
    }))
  };
}

function textLayer(
  id: string,
  text: string,
  geom: { x: number; y: number; w: number; h: number; zIndex: number },
  extra?: Partial<PenPageLayer>
): PenPageLayer {
  return {
    id,
    kind: 'text',
    ...geom,
    name: id,
    positionLocked: extra?.positionLocked ?? true,
    textDoc: tipTapParagraphs(text),
    ...extra
  };
}

function imageLayer(
  id: string,
  imageSrc: string,
  geom: { x: number; y: number; w: number; h: number; zIndex: number },
  locked = true
): PenPageLayer {
  return {
    id,
    kind: 'image',
    ...geom,
    name: id,
    imageSrc,
    positionLocked: locked
  };
}

function videoLayer(
  id: string,
  videoSrc: string,
  geom: { x: number; y: number; w: number; h: number; zIndex: number },
  locked = true
): PenPageLayer {
  return {
    id,
    kind: 'video',
    ...geom,
    name: id,
    videoSrc,
    positionLocked: locked
  };
}

export function socialPresentation(
  partial: Partial<PenPagePresentation> = {}
): PenPagePresentation {
  return {
    fontFamily: partial.fontFamily || 'Georgia',
    fontSize: partial.fontSize ?? 42,
    textColor: partial.textColor || '#FFFFFF',
    textStyle: partial.textStyle || 'plain',
    dropShadowColor: partial.dropShadowColor || '#000000',
    dropShadowBlur: partial.dropShadowBlur ?? 12,
    dropShadowOffsetX: partial.dropShadowOffsetX ?? 2,
    dropShadowOffsetY: partial.dropShadowOffsetY ?? 2,
    backgroundColor: partial.backgroundColor || '#111111',
    backgroundImage: partial.backgroundImage,
    backgroundGradient: partial.backgroundGradient,
    textAlign: partial.textAlign || 'center',
    padding: partial.padding ?? 36
  };
}

export function paperPresentation(
  partial: Partial<PenPagePresentation> = {}
): PenPagePresentation {
  return {
    fontFamily: partial.fontFamily || 'Georgia',
    fontSize: partial.fontSize ?? 18,
    textColor: partial.textColor || '#1a1a1a',
    textStyle: partial.textStyle || 'plain',
    dropShadowColor: '#000000',
    dropShadowBlur: 0,
    dropShadowOffsetX: 0,
    dropShadowOffsetY: 0,
    backgroundColor: partial.backgroundColor || '#f7f3ea',
    backgroundImage: partial.backgroundImage,
    textAlign: partial.textAlign || 'left',
    padding: partial.padding ?? 48
  };
}

export type SeedBundle = {
  seedSections: PenSectionContent[];
  seedPagePresentation: PenPagePresentation;
  seedPageLayout?: PenPageLayout;
};

/** Note — text-first; no obligatory hero media. */
export function seedNoteBasic(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0c0c0c',
      fontSize: 40,
      textAlign: 'left',
      padding: 40
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'A short line that lands.',
          'Keep going — this form is text-first. Add media only if it serves the words.'
        ),
        layers: []
      }
    ]
  };
}

export function seedNoteArticle(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#121212',
      fontSize: 36,
      textAlign: 'left',
      padding: 32
    }),
    seedSections: [
      {
        slug: 'title',
        doc: tipTapParagraphs('The point, in one line'),
        layers: []
      },
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Lead with the claim. Keep paragraphs short.',
          'Detail that earns the scroll comes second.'
        ),
        layers: []
      }
    ]
  };
}

export function seedPostCaption(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#1a1a1a',
      backgroundImage: STARTER_ASSETS.captionBg,
      fontSize: 28,
      textAlign: 'center'
    }),
    seedSections: [
      {
        slug: 'caption',
        doc: tipTapParagraphs('Say it in one breath.'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.captionBg, {
            x: 0,
            y: 0,
            w: 360,
            h: 360,
            zIndex: 1
          }),
          textLayer('layer_caption', 'Say it in one breath.', {
            x: 24,
            y: 300,
            w: 312,
            h: 56,
            zIndex: 2
          })
        ]
      },
      { slug: 'attachments', doc: tipTapParagraphs(''), layers: [] }
    ]
  };
}

/** Post — media-primary; stock only fills the required media slot. */
export function seedPostImage(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#000000',
      fontSize: 24,
      textAlign: 'left',
      padding: 20
    }),
    seedSections: [
      {
        slug: 'attachments',
        doc: tipTapParagraphs(''),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.imagePost, {
            x: 0,
            y: 0,
            w: 360,
            h: 450,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'caption',
        doc: tipTapParagraphs('Optional caption under the frame.'),
        layers: [
          textLayer('layer_caption', 'Optional caption under the frame.', {
            x: 16,
            y: 460,
            w: 328,
            h: 48,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

export function seedPostVideo(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#050505',
      fontSize: 24,
      textAlign: 'center'
    }),
    seedSections: [
      {
        slug: 'attachments',
        doc: tipTapParagraphs(''),
        layers: [
          videoLayer('layer_media', STARTER_ASSETS.videoPost, {
            x: 0,
            y: 0,
            w: 360,
            h: 640,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'caption',
        doc: tipTapParagraphs('Swap in your clip.'),
        layers: [
          textLayer('layer_caption', 'Swap in your clip.', {
            x: 24,
            y: 560,
            w: 312,
            h: 48,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

/** Collection — typed page roles: text page + media page. */
export function seedCollectionBasic(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0d1b2a',
      textAlign: 'left',
      fontSize: 32
    }),
    seedSections: [
      {
        slug: 'slide-1',
        doc: tipTapDoc(
          tipTapHeading('Text page', 2),
          tipTapParagraphs(
            'This page is note-like: words first.',
            'Swipe for a media page.'
          )
        ),
        layers: []
      },
      {
        slug: 'slide-2',
        doc: tipTapParagraphs('Media page'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.collection2, {
            x: 0,
            y: 0,
            w: 360,
            h: 480,
            zIndex: 1
          }),
          textLayer('layer_caption', 'Media page — post-like', {
            x: 20,
            y: 400,
            w: 320,
            h: 48,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

export function seedCollectionStory(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#120a1a',
      fontSize: 36
    }),
    seedSections: [
      {
        slug: 'cover',
        doc: tipTapParagraphs('Tonight’s story'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.storyCover, {
            x: 0,
            y: 0,
            w: 360,
            h: 640,
            zIndex: 1
          }),
          textLayer('layer_title', 'Tonight’s story', {
            x: 28,
            y: 500,
            w: 304,
            h: 64,
            zIndex: 2
          })
        ]
      },
      {
        slug: 'pages',
        doc: tipTapParagraphs(
          'Beat two — still vertical.',
          'Keep each beat short.'
        ),
        layers: []
      }
    ]
  };
}

/** Set — primary + source refs (not a collage). */
export function seedSetBasic(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#1a1a1a',
      textAlign: 'left',
      fontSize: 28,
      padding: 28
    }),
    seedSections: [
      {
        slug: 'primary',
        doc: tipTapDoc(
          tipTapHeading('Primary', 2),
          tipTapParagraphs(
            'Set = multi-media assembly (mix types).',
            'Attach → From Pen to embed the primary post/template.',
            'Collection = same-type multipage — use that form instead for slides.'
          )
        ),
        layers: []
      },
      {
        slug: 'sources',
        doc: tipTapDoc(
          tipTapHeading('Sources', 3),
          tipTapParagraphs('Add penEmbed refs to different templates/posts:'),
          bulletList(
            'ref: (image post)',
            'ref: (note / metric)',
            'ref: (audio or video)'
          )
        ),
        layers: []
      }
    ]
  };
}

/** Feed — config surface, not a mood board. */
export function seedFeedSelfHosted(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#ffffff',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapDoc(
          tipTapHeading('Feed name', 1),
          tipTapParagraphs(
            'Purpose: what this stream is for.',
            'Visibility: members of this community.'
          )
        ),
        layers: []
      },
      {
        slug: 'rules',
        doc: tipTapDoc(
          tipTapHeading('Membership rules', 2),
          bulletList(
            'Who can post',
            'What belongs here',
            'What gets removed'
          )
        ),
        layers: []
      }
    ]
  };
}

export function seedFeedCurated(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#fafafa',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapDoc(
          tipTapHeading('Curated feed', 1),
          tipTapParagraphs('Hand-chosen index for this week.')
        ),
        layers: []
      },
      {
        slug: 'index',
        doc: tipTapDoc(
          tipTapHeading('Index', 2),
          bulletList('1. Opening pick', '2. Feature', '3. Close')
        ),
        layers: []
      }
    ]
  };
}

export function seedLanding(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#0f172a',
      textColor: '#f8fafc',
      textAlign: 'center',
      fontSize: 20,
      padding: 56
    }),
    seedSections: [
      {
        slug: 'hero',
        doc: tipTapDoc(
          tipTapHeading('Your headline', 1),
          tipTapParagraphs('One supporting line for arrivals.')
        ),
        layers: []
      },
      {
        slug: 'value',
        doc: tipTapDoc(
          tipTapHeading('Why it matters', 2),
          bulletList('Benefit one', 'Benefit two', 'Proof or social signal')
        ),
        layers: []
      },
      {
        slug: 'feed_embed',
        doc: tipTapDoc(
          tipTapHeading('Live stream', 2),
          tipTapParagraphs(
            'L5 slot: embed community.feed_embed (iframe) here.',
            'Page chrome = this Landing; stream = aggregator feed.'
          )
        ),
        layers: []
      },
      {
        slug: 'cta',
        doc: tipTapParagraphs('Primary action → (link or join)'),
        layers: []
      }
    ]
  };
}

export function seedCommunityHome(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#111827',
      textColor: '#f9fafb',
      fontSize: 17,
      padding: 40
    }),
    seedSections: [
      {
        slug: 'banner',
        doc: tipTapDoc(
          tipTapHeading('Community name', 1),
          tipTapParagraphs('Short about line.')
        ),
        layers: []
      },
      {
        slug: 'nav',
        doc: tipTapDoc(
          tipTapHeading('Nav', 3),
          bulletList('Home', 'Feed', 'About')
        ),
        layers: []
      },
      {
        slug: 'feed_embed',
        doc: tipTapDoc(
          tipTapHeading('Featured stream', 2),
          tipTapParagraphs(
            'iframe slot → community.feed_embed bound to community.feed.',
            'Not longform — live posts from the aggregator.'
          )
        ),
        layers: []
      },
      {
        slug: 'announcements',
        doc: tipTapDoc(
          tipTapHeading('Announcements', 2),
          tipTapParagraphs('Pinned update for members.')
        ),
        layers: []
      }
    ]
  };
}

/** Site — ordered multipage feed toc (aggregator), not a widget builder. */
export function seedSite(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#ffffff',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'pages',
        doc: tipTapDoc(
          tipTapHeading('Site pages', 1),
          tipTapParagraphs(
            'Ordered multipage feed — like browse home.',
            'Replace each ref with a Landing, Community home, or Social page.'
          ),
          bulletList(
            '1. page: Landing (arrival)',
            '2. page: Community home',
            '3. page: (add Note / Post / …)'
          )
        ),
        layers: []
      }
    ]
  };
}

export function seedJournal(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#f4efe6',
      fontSize: 17
    }),
    seedSections: [
      {
        slug: 'entries',
        doc: tipTapDoc(
          tipTapHeading('2026-09-24', 2),
          tipTapParagraphs('Morning — what stuck.', 'Evening — what to keep.'),
          tipTapHeading('2026-09-23', 2),
          tipTapParagraphs('Yesterday’s note.')
        ),
        layers: []
      }
    ]
  };
}

export function seedList(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#ffffff',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'items',
        doc: tipTapDoc(
          tipTapHeading('Today', 2),
          bulletList(
            '[ ] First item',
            '[ ] Second item',
            '[x] Done example'
          )
        ),
        layers: []
      }
    ]
  };
}

export function seedLetter(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#fffdf8',
      fontSize: 17
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapDoc(
          tipTapParagraphs('Dear friend,'),
          tipTapParagraphs(
            'Body of the letter — replace with your message.',
            'Keep the regions: salutation, body, closing.'
          ),
          tipTapParagraphs('With care,', 'Your name')
        ),
        layers: [
          textLayer(
            'layer_salutation',
            'Dear friend,',
            { x: 48, y: 80, w: 400, h: 36, zIndex: 1 },
            { positionLocked: true }
          ),
          textLayer(
            'layer_closing',
            'With care,',
            { x: 48, y: 720, w: 280, h: 36, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      }
    ]
  };
}

export function seedCardNote(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#1f2937',
      textColor: '#f9fafb',
      textAlign: 'center',
      fontSize: 22
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Thinking of you.'),
        layers: []
      }
    ]
  };
}

export function seedBook(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#1a1520',
      textColor: '#f5f0e8',
      textAlign: 'center',
      fontSize: 24
    }),
    seedSections: [
      {
        slug: 'front',
        doc: tipTapDoc(
          tipTapHeading('Untitled Volume', 1),
          tipTapParagraphs('A working title', 'Author')
        ),
        layers: []
      },
      {
        slug: 'body',
        doc: tipTapDoc(
          tipTapHeading('Chapter 1', 2),
          tipTapParagraphs('The first paragraph of the work begins here.')
        ),
        layers: []
      }
    ]
  };
}

export function seedArticle(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#ffffff',
      fontSize: 17
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapDoc(
          tipTapHeading('Essay title', 1),
          tipTapParagraphs(
            'Open with the stake — text is primary.',
            'Optional hero media is secondary to the article.'
          )
        ),
        layers: []
      }
    ]
  };
}

export function seedMusic(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#0b0b0b',
      textColor: '#fafafa',
      textAlign: 'center',
      fontSize: 20
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapDoc(
          tipTapHeading('Track title', 1),
          tipTapParagraphs('Artist name')
        ),
        layers: [
          imageLayer('layer_cover', STARTER_ASSETS.musicCover, {
            x: 168,
            y: 120,
            w: 400,
            h: 400,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'audio',
        doc: tipTapParagraphs('Attach your audio file here.'),
        layers: []
      }
    ]
  };
}

export function seedEvent(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#111827',
      textColor: '#f9fafb',
      textAlign: 'left',
      fontSize: 18
    }),
    seedSections: [
      {
        slug: 'details',
        doc: tipTapDoc(
          tipTapHeading('Event', 1),
          tipTapParagraphs(
            'title:Launch night',
            'startAt:2026-10-01T19:00:00-04:00',
            'endAt:2026-10-01T22:00:00-04:00',
            'timeZone:America/New_York',
            'placeLabel:Main hall (label only — attach geoProofRef, never lat/lng)',
            'details:Doors at 6:30. Structured fields are for humans and agents.'
          )
        ),
        layers: [
          textLayer('layer_when', '2026-10-01 · 19:00–22:00 · America/New_York', {
            x: 48,
            y: 120,
            w: 720,
            h: 40,
            zIndex: 1
          }),
          textLayer('layer_where', 'Main hall', {
            x: 48,
            y: 180,
            w: 720,
            h: 36,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

export function seedSchedule(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#ffffff',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'agenda',
        doc: tipTapDoc(
          tipTapHeading('Run of show', 2),
          tipTapParagraphs('title:Today’s agenda', 'timeZone:America/New_York'),
          bulletList(
            '09:00 — Open (15m)',
            '11:00 — Deep work (120m)',
            '15:00 — Review (45m)',
            '17:00 — Close (15m)'
          )
        ),
        layers: []
      }
    ]
  };
}

export function seedCalendar(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#f8fafc',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapDoc(
          tipTapHeading('September', 1),
          tipTapParagraphs(
            'Calendar shell — list or embed Event atoms here.',
            'Grid layout is a later viewer; IR is the event index.'
          )
        ),
        layers: []
      },
      {
        slug: 'events',
        doc: tipTapDoc(
          tipTapHeading('Events', 2),
          bulletList(
            'eventRef: (time.event doc)',
            'eventRef: (time.event doc)',
            'Mon — Kickoff · Wed — Draft · Fri — Ship'
          )
        ),
        layers: []
      }
    ]
  };
}

export function seedKnowledgeClaim(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0c0a09',
      textColor: '#fafaf9',
      fontSize: 20,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'claims',
        doc: tipTapParagraphs(
          'dataPointId:age_over_18',
          'proofRef:(zkp_slot)',
          'Never store raw age, email, name, or coordinates in this IR.'
        ),
        layers: [
          textLayer('layer_title', 'Knowledge claim', {
            x: 24,
            y: 120,
            w: 312,
            h: 36,
            zIndex: 1
          }),
          textLayer('layer_claim', 'Bound to standard data-point + ZKP', {
            x: 24,
            y: 180,
            w: 312,
            h: 80,
            zIndex: 1
          }),
          textLayer('layer_geo', 'Optional: attach geoProofRef to any asset — not a Place template', {
            x: 24,
            y: 280,
            w: 312,
            h: 72,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

export function seedRegister(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#fafafa',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14
    }),
    seedSections: [
      {
        slug: 'rows',
        doc: tipTapParagraphs(
          'id | label | notes',
          'row-1 | Example | Optional note'
        ),
        layers: [
          textLayer('layer_header', 'Register', {
            x: 48,
            y: 40,
            w: 240,
            h: 36,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

export function seedAssetKey(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#0f172a',
      textColor: '#e2e8f0',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14
    }),
    seedSections: [
      {
        slug: 'grant',
        doc: tipTapParagraphs(
          'asset: (id)',
          'scope: personal',
          'price: —'
        ),
        layers: [
          textLayer('layer_header', 'Asset key', {
            x: 48,
            y: 40,
            w: 280,
            h: 36,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'proof',
        doc: tipTapParagraphs('license-key proof placeholder'),
        layers: []
      }
    ]
  };
}

/** Placeholder docId rewritten to a minted table primitive on create — see seedRefs. */
export { SEED_TABLE_DOC_PLACEHOLDER } from './seedRefs.js';

export type SeedAspect = 'portrait' | 'landscape' | 'square';

function socialGeom(aspect: SeedAspect): { w: number; h: number } {
  if (aspect === 'landscape') return { w: 640, h: 360 };
  if (aspect === 'square') return { w: 360, h: 360 };
  return { w: 360, h: 640 };
}

export function seedNoteBasicPortrait(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0a0a0a',
      fontSize: 40,
      textAlign: 'left',
      padding: 40,
      textColor: '#fafafa'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Before you post, check the safe zone.',
          'Portrait Note — text is the asset. Keep hooks in the center band.'
        ),
        layers: [
          textLayer(
            'layer_eyebrow',
            'NOTE',
            { x: 28, y: 96, w: 304, h: 28, zIndex: 1 },
            { backgroundColor: 'transparent' }
          ),
          textLayer('layer_hook', 'Before you post,', {
            x: 28,
            y: 200,
            w: 304,
            h: 48,
            zIndex: 2
          }),
          textLayer('layer_body', 'check the safe zone.', {
            x: 28,
            y: 260,
            w: 304,
            h: 72,
            zIndex: 2
          }),
          textLayer(
            'layer_sub',
            'Keep hooks in the center band. Top and bottom belong to the feed chrome.',
            { x: 28, y: 360, w: 304, h: 96, zIndex: 2 }
          )
        ]
      }
    ]
  };
}

/** Twitter-style text block on light ground. */
export function seedNoteTextTileLight(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#e7e5e4',
      textColor: '#0c0a09',
      fontSize: 28,
      textAlign: 'left',
      dropShadowBlur: 0,
      padding: 24
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'One clear thought.',
          'Light tile — high contrast block, like a status card.'
        ),
        layers: [
          textLayer(
            'layer_card',
            'One clear thought.\n\nLight tile — high contrast block, like a status card.',
            { x: 28, y: 180, w: 304, h: 220, zIndex: 2 },
            {
              backgroundColor: '#ffffff',
              strokeColor: '#d6d3d1',
              strokeWidth: 1,
              positionLocked: true
            }
          )
        ]
      }
    ]
  };
}

/** Twitter-style text block on dark ground. */
export function seedNoteTextTileDark(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0c0a09',
      textColor: '#fafaf9',
      fontSize: 28,
      textAlign: 'left',
      dropShadowBlur: 0,
      padding: 24
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'One clear thought.',
          'Dark tile — status card on black, readable in the feed.'
        ),
        layers: [
          textLayer(
            'layer_card',
            'One clear thought.\n\nDark tile — status card on black, readable in the feed.',
            { x: 28, y: 180, w: 304, h: 220, zIndex: 2 },
            {
              backgroundColor: '#1c1917',
              strokeColor: '#44403c',
              strokeWidth: 1,
              positionLocked: true
            }
          )
        ]
      }
    ]
  };
}

export function seedNoteBasicLandscape(): SeedBundle {
  const g = socialGeom('landscape');
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#101010',
      fontSize: 36,
      textAlign: 'left',
      padding: 32
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Landscape Note — headline and sub, editorial balance.'),
        layers: [
          textLayer('layer_headline', 'Headline that carries the frame.', {
            x: 40,
            y: 100,
            w: g.w - 80,
            h: 80,
            zIndex: 2
          }),
          textLayer('layer_sub', 'Sub-message sits beside, not over a photo.', {
            x: 40,
            y: 200,
            w: g.w - 80,
            h: 48,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

/** Text-dominant on quiet media (scrim). Fails if gallery reads as Post. */
export function seedNoteMediaPortrait(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#111',
      backgroundImage: STARTER_ASSETS.captionBg,
      fontSize: 34,
      textAlign: 'left',
      textColor: '#fafafa'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'The words are the post.',
          'Media is atmosphere — crop away the text and the post should feel incomplete.'
        ),
        layers: [
          imageLayer('layer_backdrop', STARTER_ASSETS.captionBg, {
            x: 0,
            y: 0,
            w: 360,
            h: 640,
            zIndex: 1
          }),
          textLayer(
            'layer_card',
            'The words are the post.\n\nMedia is atmosphere — crop away the text and the post should feel incomplete.',
            { x: 24, y: 200, w: 312, h: 240, zIndex: 3 },
            {
              backgroundColor: 'rgba(0,0,0,0.78)',
              positionLocked: true
            }
          )
        ]
      }
    ]
  };
}

export function seedNoteMediaLandscape(): SeedBundle {
  const g = socialGeom('landscape');
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0a0a0a',
      fontSize: 32,
      textAlign: 'left'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Split: media left, text card right — text still wins.'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.imagePost, {
            x: 0,
            y: 0,
            w: Math.round(g.w * 0.48),
            h: g.h,
            zIndex: 1
          }),
          textLayer('layer_card', 'Readable text block — not a corner caption.', {
            x: Math.round(g.w * 0.5),
            y: 80,
            w: Math.round(g.w * 0.45),
            h: 200,
            zIndex: 2
          }, { backgroundColor: 'rgba(12,12,12,0.92)' })
        ]
      }
    ]
  };
}

export function seedPostImageAspect(aspect: SeedAspect): SeedBundle {
  const g = socialGeom(aspect);
  const src = STARTER_ASSETS.imagePost;
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#000',
      fontSize: 22,
      textAlign: 'left',
      padding: 16
    }),
    seedSections: [
      {
        slug: 'attachments',
        doc: tipTapParagraphs(''),
        layers: [
          imageLayer('layer_media', src, {
            x: 0,
            y: 0,
            w: g.w,
            h: g.h,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'caption',
        doc: tipTapParagraphs('Optional caption.'),
        layers: [
          textLayer('layer_caption', 'Optional caption.', {
            x: 16,
            y: g.h + 8,
            w: g.w - 32,
            h: 40,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

export function seedPostVideoAspect(aspect: SeedAspect): SeedBundle {
  const g = socialGeom(aspect);
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#050505',
      fontSize: 22,
      textAlign: 'center'
    }),
    seedSections: [
      {
        slug: 'attachments',
        doc: tipTapParagraphs(''),
        layers: [
          videoLayer('layer_media', STARTER_ASSETS.videoPost, {
            x: 0,
            y: 0,
            w: g.w,
            h: g.h,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'caption',
        doc: tipTapParagraphs('Swap in your clip.'),
        layers: [
          textLayer('layer_caption', 'Swap in your clip.', {
            x: 24,
            y: Math.max(24, g.h - 72),
            w: g.w - 48,
            h: 40,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

export function seedQuote(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#1c1917',
      fontSize: 36,
      textAlign: 'center',
      fontFamily: 'Georgia, serif'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('"A line worth keeping."', '— Speaker'),
        layers: [
          textLayer('layer_quote', '"A line worth keeping."', {
            x: 32,
            y: 200,
            w: 296,
            h: 160,
            zIndex: 2
          }),
          textLayer('layer_byline', '— Speaker', {
            x: 32,
            y: 400,
            w: 296,
            h: 40,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

export function seedLink(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#fafaf9',
      textColor: '#1c1917',
      fontSize: 20,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('example.com', 'Page title', 'Two-line snippet of the linked page.'),
        layers: [
          textLayer('layer_domain', 'example.com', {
            x: 24,
            y: 24,
            w: 312,
            h: 28,
            zIndex: 1
          }, { backgroundColor: '#e7e5e4' }),
          textLayer('layer_title', 'Page title', {
            x: 24,
            y: 72,
            w: 312,
            h: 48,
            zIndex: 1
          }),
          textLayer('layer_snippet', 'Two-line snippet of the linked page.', {
            x: 24,
            y: 132,
            w: 312,
            h: 64,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

/** Poll compound — embeds seed table placeholder + vote stickers (handlers stub). */
export function seedPoll(): SeedBundle {
  const tableId = SEED_TABLE_DOC_PLACEHOLDER;
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0f172a',
      fontSize: 28,
      textAlign: 'left'
    }),
    seedSections: [
      {
        slug: 'prompt',
        doc: tipTapParagraphs('Which should we ship next?'),
        layers: [
          textLayer('layer_prompt', 'Which should we ship next?', {
            x: 24,
            y: 32,
            w: 312,
            h: 64,
            zIndex: 1
          }),
          {
            id: 'layer_table_embed',
            kind: 'embed',
            name: 'Results',
            x: 24,
            y: 120,
            w: 312,
            h: 160,
            zIndex: 2,
            refDocId: tableId,
            refSectionSlug: 'grid',
            positionLocked: true,
            backgroundColor: '#1e293b',
            strokeColor: '#334155',
            strokeWidth: 1
          },
          {
            id: 'sticker_opt_a',
            kind: 'interactive',
            name: 'Vote A',
            x: 24,
            y: 300,
            w: 312,
            h: 44,
            zIndex: 5,
            behavior: 'poll.vote',
            bindDocId: tableId,
            bindRowId: 'opt_a',
            label: 'Option A',
            positionLocked: true,
            backgroundColor: '#2563eb'
          },
          {
            id: 'sticker_opt_b',
            kind: 'interactive',
            name: 'Vote B',
            x: 24,
            y: 356,
            w: 312,
            h: 44,
            zIndex: 5,
            behavior: 'poll.vote',
            bindDocId: tableId,
            bindRowId: 'opt_b',
            label: 'Option B',
            positionLocked: true,
            backgroundColor: '#2563eb'
          },
          textLayer('layer_status', 'Votes log into the bound table (runtime later).', {
            x: 24,
            y: 420,
            w: 312,
            h: 40,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

export function seedComparison(): SeedBundle {
  const tableId = SEED_TABLE_DOC_PLACEHOLDER;
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#111827',
      fontSize: 22,
      textAlign: 'left'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Comparison matrix — data from cloud table.'),
        layers: [
          textLayer('layer_header', 'Compare', {
            x: 24,
            y: 24,
            w: 312,
            h: 36,
            zIndex: 1
          }),
          {
            id: 'layer_matrix',
            kind: 'embed',
            name: 'Matrix',
            x: 16,
            y: 80,
            w: 328,
            h: 280,
            zIndex: 2,
            refDocId: tableId,
            refSectionSlug: 'grid',
            positionLocked: true,
            backgroundColor: '#1f2937',
            strokeColor: '#4b5563',
            strokeWidth: 1
          },
          textLayer('layer_summary', 'Summary from table tallies / cells.', {
            x: 24,
            y: 380,
            w: 312,
            h: 48,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

export function seedMetric(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#fafaf9',
      textColor: '#0a0a0a',
      fontSize: 64,
      textAlign: 'center',
      dropShadowBlur: 0,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'metric:activation_rate',
          'value:128',
          'unit:percent',
          'delta:+12',
          'period:vs_last'
        ),
        layers: [
          textLayer('layer_label', 'Activation rate', {
            x: 40,
            y: 140,
            w: 280,
            h: 36,
            zIndex: 2
          }),
          textLayer('layer_value', '128%', {
            x: 40,
            y: 200,
            w: 280,
            h: 110,
            zIndex: 2
          }),
          textLayer('layer_delta', '+12% vs last period', {
            x: 40,
            y: 330,
            w: 280,
            h: 40,
            zIndex: 2
          })
        ]
      }
    ]
  };
}

export function seedCode(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0d1117',
      textColor: '#e6edf3',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 16,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('typescript', 'const x = 1;'),
        layers: [
          textLayer('layer_chrome', 'ts  ·  Copy', {
            x: 16,
            y: 16,
            w: 328,
            h: 32,
            zIndex: 1
          }, { backgroundColor: '#161b22' }),
          textLayer('layer_code', 'const x = 1;', {
            x: 16,
            y: 56,
            w: 328,
            h: 200,
            zIndex: 1
          }, { backgroundColor: '#0d1117' })
        ]
      }
    ]
  };
}

export function seedProfile(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#fafaf9',
      textColor: '#1c1917',
      fontSize: 22,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Display Name', 'Role', 'Short bio.'),
        layers: [
          textLayer('layer_name', 'Display Name', {
            x: 100,
            y: 40,
            w: 220,
            h: 36,
            zIndex: 1
          }),
          textLayer('layer_role', 'Role · verified', {
            x: 100,
            y: 80,
            w: 220,
            h: 28,
            zIndex: 1
          }),
          textLayer('layer_bio', 'Short bio for the contributor spotlight.', {
            x: 24,
            y: 140,
            w: 312,
            h: 80,
            zIndex: 1
          })
        ]
      }
    ]
  };
}

export function seedAudio(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#121018',
      fontSize: 20,
      textAlign: 'left',
      textColor: '#f5f5f4'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Audio-only is valid.',
          'Attach a published music/audio SoT when ready; cover art is optional.'
        ),
        layers: [
          textLayer('layer_title', 'Untitled audio', {
            x: 24,
            y: 160,
            w: 312,
            h: 40,
            zIndex: 1
          }),
          textLayer('layer_player', '▶  play  ·  0:00', {
            x: 24,
            y: 240,
            w: 312,
            h: 64,
            zIndex: 1
          }, { backgroundColor: '#1f1b2e' }),
          textLayer(
            'layer_hint',
            'Audio-only OK — add a companion visual template later if the feed needs a face.',
            { x: 24, y: 340, w: 312, h: 80, zIndex: 1 }
          )
        ]
      }
    ]
  };
}

export function seedFrame(): SeedBundle {
  const tableId = SEED_TABLE_DOC_PLACEHOLDER;
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#18181b',
      fontSize: 20,
      textAlign: 'left'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Interactive frame — embed + stickers.'),
        layers: [
          {
            id: 'layer_embed',
            kind: 'embed',
            name: 'Stage',
            x: 20,
            y: 48,
            w: 320,
            h: 280,
            zIndex: 1,
            refDocId: tableId,
            refSectionSlug: 'grid',
            positionLocked: true,
            backgroundColor: '#27272a',
            strokeColor: '#52525b',
            strokeWidth: 1
          },
          {
            id: 'sticker_cta',
            kind: 'interactive',
            name: 'CTA',
            x: 20,
            y: 350,
            w: 320,
            h: 44,
            zIndex: 5,
            behavior: 'cta.open',
            bindDocId: tableId,
            label: 'Open',
            positionLocked: true,
            backgroundColor: '#a1a1aa'
          }
        ]
      }
    ]
  };
}

export function seedFeedEmbed(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#09090b',
      textColor: '#fafafa',
      fontSize: 16,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'header',
        doc: tipTapParagraphs('L5 chrome · header'),
        layers: [
          textLayer('layer_header', 'Community · Live stream', {
            x: 12,
            y: 8,
            w: 336,
            h: 36,
            zIndex: 1
          }, { backgroundColor: '#18181b' })
        ]
      },
      {
        slug: 'stream',
        doc: tipTapParagraphs(
          'feedEmbedSlot:iframe',
          'Bind community.feed — this is a live aggregator slot, not longform chapters.'
        ),
        layers: [
          textLayer(
            'layer_iframe',
            '⟦ iframe / framed stream ⟧\ncommunity.feed_embed',
            {
              x: 12,
              y: 56,
              w: 336,
              h: 280,
              zIndex: 1
            },
            { backgroundColor: '#27272a', strokeColor: '#52525b', strokeWidth: 1 }
          )
        ]
      },
      {
        slug: 'footer',
        doc: tipTapParagraphs('Toolbar · links · CTA'),
        layers: [
          textLayer('layer_footer', 'Home · Feed · About', {
            x: 12,
            y: 360,
            w: 336,
            h: 40,
            zIndex: 1
          }, { backgroundColor: '#18181b' })
        ]
      }
    ]
  };
}

export function seedTablePrimitive(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#fff',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14
    }),
    seedSections: [tableSectionFromPayload('grid', emptyPollTable())]
  };
}
