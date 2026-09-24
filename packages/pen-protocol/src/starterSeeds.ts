/** Format-first seed IR for platform starters (see PEN_FORM_FORMAT_SURVEY.md). */

import type {
  PenPageLayer,
  PenPageLayout,
  PenPagePresentation,
  PenSectionContent,
  PenTipTapNode
} from './types.js';
import { STARTER_ASSETS } from './starterAssets.js';

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
            'Attach → From Pen to embed the main doc.',
            'penEmbed: (choose primary doc)'
          )
        ),
        layers: []
      },
      {
        slug: 'sources',
        doc: tipTapDoc(
          tipTapHeading('Sources', 3),
          bulletList(
            'ref: (source doc A)',
            'ref: (source doc B)',
            'Add more refs as needed'
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
        slug: 'featured',
        doc: tipTapDoc(
          tipTapHeading('Featured stream', 2),
          tipTapParagraphs('Embed or link your community.feed here.')
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
          tipTapParagraphs('Personal + work')
        ),
        layers: []
      },
      {
        slug: 'events',
        doc: tipTapDoc(
          tipTapHeading('Events', 2),
          bulletList('Mon — Kickoff', 'Wed — Draft due', 'Fri — Ship')
        ),
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
      textAlign: 'center',
      fontSize: 20
    }),
    seedSections: [
      {
        slug: 'details',
        doc: tipTapDoc(
          tipTapHeading('Event name', 1),
          tipTapParagraphs('Saturday · 7:00pm', 'Venue / link', 'Details…')
        ),
        layers: []
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
          tipTapHeading('Today’s agenda', 2),
          bulletList(
            '09:00 — Open',
            '11:00 — Deep work',
            '15:00 — Review',
            '17:00 — Close'
          )
        ),
        layers: []
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
