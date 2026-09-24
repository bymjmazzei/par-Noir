/** Rich seed IR builders for platform starters (Pexels media via STARTER_ASSETS). */

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
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level },
        content: text ? [{ type: 'text', text }] : []
      }
    ]
  };
}

export function tipTapDoc(...nodes: PenTipTapNode[]): PenTipTapNode {
  return {
    type: 'doc',
    content: nodes.flatMap((n) => (n.type === 'doc' ? n.content || [] : [n]))
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
    positionLocked: extra?.positionLocked ?? false,
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
  partial: Partial<PenPagePresentation> & { backgroundImage?: string }
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

export function seedNoteBasic(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.noteHero,
      backgroundColor: '#0a0a0a',
      fontSize: 44,
      textAlign: 'center'
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'A short line that lands.',
          'Replace this copy — keep it clear for browse.'
        ),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.noteHero, {
            x: 0,
            y: 0,
            w: 360,
            h: 480,
            zIndex: 1
          }),
          textLayer(
            'layer_caption',
            'A short line that lands.',
            { x: 24, y: 360, w: 312, h: 96, zIndex: 2 },
            {
              positionLocked: true,
              backgroundColor: 'rgba(0,0,0,0.35)'
            }
          )
        ]
      }
    ]
  };
}

export function seedNoteArticle(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.articleHero,
      backgroundColor: '#101820',
      fontFamily: 'Georgia',
      fontSize: 36,
      textAlign: 'left',
      padding: 28
    }),
    seedSections: [
      {
        slug: 'title',
        doc: tipTapParagraphs('The point, in one line'),
        layers: [
          imageLayer('layer_hero', STARTER_ASSETS.articleHero, {
            x: 0,
            y: 0,
            w: 360,
            h: 200,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'The point, in one line',
            { x: 20, y: 140, w: 320, h: 56, zIndex: 2 },
            { positionLocked: true, backgroundColor: 'rgba(0,0,0,0.45)' }
          )
        ]
      },
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Lead with the claim. Keep paragraphs short.',
          'Add the detail that earns the scroll.'
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
      backgroundImage: STARTER_ASSETS.captionBg,
      backgroundColor: '#1c1410',
      fontSize: 32,
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
            h: 420,
            zIndex: 1
          }),
          textLayer(
            'layer_caption',
            'Say it in one breath.',
            { x: 28, y: 300, w: 304, h: 80, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'attachments',
        doc: tipTapParagraphs(''),
        layers: []
      }
    ]
  };
}

export function seedPostImage(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#000000',
      backgroundImage: STARTER_ASSETS.imagePost,
      fontSize: 28,
      textAlign: 'left',
      padding: 24
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
          textLayer(
            'layer_caption',
            'Optional caption under the frame.',
            { x: 20, y: 460, w: 320, h: 64, zIndex: 2 },
            { positionLocked: true }
          )
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
      backgroundImage: STARTER_ASSETS.videoPoster,
      fontSize: 28,
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
        doc: tipTapParagraphs('Tap play — then swap in your clip.'),
        layers: [
          textLayer(
            'layer_caption',
            'Tap play — then swap in your clip.',
            { x: 24, y: 560, w: 312, h: 64, zIndex: 2 },
            { positionLocked: true, backgroundColor: 'rgba(0,0,0,0.4)' }
          )
        ]
      }
    ]
  };
}

export function seedCollectionBasic(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.collection1,
      backgroundColor: '#0d1b2a'
    }),
    seedSections: [
      {
        slug: 'slide-1',
        doc: tipTapParagraphs('First page'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.collection1, {
            x: 0,
            y: 0,
            w: 360,
            h: 480,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'First page',
            { x: 24, y: 400, w: 312, h: 56, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'slide-2',
        doc: tipTapParagraphs('Second page — swipe to see'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.collection2, {
            x: 0,
            y: 0,
            w: 360,
            h: 480,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Second page — swipe to see',
            { x: 24, y: 400, w: 312, h: 56, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      }
    ]
  };
}

export function seedCollectionStory(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.storyCover,
      backgroundColor: '#120a1a',
      fontSize: 40
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
          textLayer(
            'layer_title',
            'Tonight’s story',
            { x: 28, y: 500, w: 304, h: 72, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'pages',
        doc: tipTapParagraphs('The beat continues…'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.storyPage, {
            x: 0,
            y: 0,
            w: 360,
            h: 640,
            zIndex: 1
          }),
          textLayer(
            'layer_caption',
            'The beat continues…',
            { x: 28, y: 520, w: 304, h: 64, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      }
    ]
  };
}

export function seedSetBasic(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.setPrimary,
      backgroundColor: '#1a1a1a',
      textAlign: 'left'
    }),
    seedSections: [
      {
        slug: 'primary',
        doc: tipTapParagraphs('Primary piece'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.setPrimary, {
            x: 0,
            y: 0,
            w: 360,
            h: 280,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Primary piece',
            { x: 20, y: 220, w: 320, h: 48, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'sources',
        doc: tipTapParagraphs('Source A', 'Source B'),
        layers: []
      }
    ]
  };
}

export function seedFeedSelfHosted(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.feedHero,
      backgroundColor: '#111827',
      textAlign: 'left',
      fontSize: 34
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapParagraphs('My feed', 'What this space is for.'),
        layers: [
          imageLayer('layer_hero', STARTER_ASSETS.feedHero, {
            x: 0,
            y: 0,
            w: 360,
            h: 220,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'My feed',
            { x: 20, y: 160, w: 320, h: 48, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'rules',
        doc: tipTapParagraphs('Who can post', 'What belongs here'),
        layers: []
      }
    ]
  };
}

export function seedFeedCurated(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundImage: STARTER_ASSETS.feedCurated,
      backgroundColor: '#0f172a',
      textAlign: 'left'
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapParagraphs('Curated picks', 'Hand-chosen for this week.'),
        layers: [
          imageLayer('layer_hero', STARTER_ASSETS.feedCurated, {
            x: 0,
            y: 0,
            w: 360,
            h: 220,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Curated picks',
            { x: 20, y: 160, w: 320, h: 48, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'index',
        doc: tipTapParagraphs('1. Opening', '2. Feature', '3. Close'),
        layers: []
      }
    ]
  };
}

export function seedJournal(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundImage: STARTER_ASSETS.journal,
      backgroundColor: '#f4efe6',
      fontFamily: 'Georgia',
      fontSize: 17
    }),
    seedSections: [
      {
        slug: 'entries',
        doc: tipTapDoc(
          tipTapHeading('Thursday', 2),
          tipTapParagraphs(
            'Morning — what stuck.',
            'Evening — what I want to keep.'
          )
        ),
        layers: [
          imageLayer('layer_header', STARTER_ASSETS.journal, {
            x: 48,
            y: 40,
            w: 640,
            h: 160,
            zIndex: 1
          }),
          textLayer(
            'layer_date',
            'Thursday',
            { x: 64, y: 140, w: 280, h: 40, zIndex: 2 },
            { positionLocked: true, backgroundColor: 'rgba(255,255,255,0.7)' }
          )
        ]
      }
    ]
  };
}

export function seedList(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#ffffff',
      backgroundImage: STARTER_ASSETS.listHeader,
      fontFamily: 'Helvetica Neue',
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'items',
        doc: tipTapParagraphs('☐ First thing', '☐ Second thing', '☐ Third thing'),
        layers: [
          imageLayer('layer_header', STARTER_ASSETS.listHeader, {
            x: 48,
            y: 32,
            w: 640,
            h: 120,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Today',
            { x: 64, y: 100, w: 200, h: 36, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      }
    ]
  };
}

export function seedLetter(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: '#fffdf8',
      fontFamily: 'Georgia',
      fontSize: 17
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Dear friend,',
          'I hope this finds you well.',
          'With care,'
        ),
        layers: [
          imageLayer(
            'layer_letterhead',
            STARTER_ASSETS.letter,
            { x: 48, y: 36, w: 200, h: 80, zIndex: 1 },
            true
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
      backgroundImage: STARTER_ASSETS.cardNote,
      textAlign: 'center',
      fontSize: 20
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Thinking of you.'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.cardNote, {
            x: 80,
            y: 120,
            w: 576,
            h: 360,
            zIndex: 1
          }),
          textLayer(
            'layer_message',
            'Thinking of you.',
            { x: 120, y: 420, w: 496, h: 56, zIndex: 2 },
            { positionLocked: true, backgroundColor: 'rgba(0,0,0,0.35)' }
          )
        ]
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
      backgroundImage: STARTER_ASSETS.bookCover,
      textAlign: 'center',
      fontSize: 28
    }),
    seedSections: [
      {
        slug: 'front',
        doc: tipTapDoc(
          tipTapHeading('Untitled Volume', 1),
          tipTapParagraphs('A working title')
        ),
        layers: [
          imageLayer('layer_cover', STARTER_ASSETS.bookCover, {
            x: 120,
            y: 80,
            w: 496,
            h: 640,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Untitled Volume',
            { x: 140, y: 520, w: 456, h: 64, zIndex: 2 },
            { positionLocked: true, backgroundColor: 'rgba(0,0,0,0.45)' }
          )
        ]
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
      backgroundImage: STARTER_ASSETS.articleHero,
      fontSize: 17
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapDoc(
          tipTapHeading('Essay title', 1),
          tipTapParagraphs(
            'Open with the stake.',
            'Develop the argument in short blocks.'
          )
        ),
        layers: [
          imageLayer('layer_hero', STARTER_ASSETS.articleHero, {
            x: 48,
            y: 40,
            w: 640,
            h: 220,
            zIndex: 1
          })
        ]
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
      backgroundImage: STARTER_ASSETS.musicCover,
      textAlign: 'center',
      fontSize: 22
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapParagraphs('Track title', 'Artist name'),
        layers: [
          imageLayer('layer_cover', STARTER_ASSETS.musicCover, {
            x: 168,
            y: 80,
            w: 400,
            h: 400,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Track title',
            { x: 120, y: 500, w: 496, h: 40, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      },
      {
        slug: 'audio',
        doc: tipTapParagraphs('Attach your audio here.'),
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
      backgroundImage: STARTER_ASSETS.calendar,
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'meta',
        doc: tipTapParagraphs('September calendar', 'Personal + work'),
        layers: [
          imageLayer('layer_hero', STARTER_ASSETS.calendar, {
            x: 48,
            y: 36,
            w: 640,
            h: 180,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'events',
        doc: tipTapParagraphs('Mon — Kickoff', 'Wed — Draft due', 'Fri — Ship'),
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
      backgroundImage: STARTER_ASSETS.event,
      textAlign: 'center',
      fontSize: 22
    }),
    seedSections: [
      {
        slug: 'details',
        doc: tipTapParagraphs(
          'Event name',
          'Saturday · 7pm',
          'Venue / link'
        ),
        layers: [
          imageLayer('layer_hero', STARTER_ASSETS.event, {
            x: 48,
            y: 48,
            w: 640,
            h: 280,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Event name',
            { x: 80, y: 280, w: 576, h: 48, zIndex: 2 },
            { positionLocked: true, backgroundColor: 'rgba(0,0,0,0.5)' }
          )
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
      backgroundImage: STARTER_ASSETS.schedule,
      fontSize: 16
    }),
    seedSections: [
      {
        slug: 'agenda',
        doc: tipTapParagraphs(
          '09:00 — Open',
          '11:00 — Deep work',
          '15:00 — Review',
          '17:00 — Close'
        ),
        layers: [
          imageLayer('layer_header', STARTER_ASSETS.schedule, {
            x: 48,
            y: 32,
            w: 640,
            h: 140,
            zIndex: 1
          }),
          textLayer(
            'layer_title',
            'Today’s agenda',
            { x: 64, y: 120, w: 280, h: 36, zIndex: 2 },
            { positionLocked: true }
          )
        ]
      }
    ]
  };
}

/** Kit register — structural polish only (no stock hero). */
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
          textLayer(
            'layer_header',
            'Register',
            { x: 48, y: 40, w: 240, h: 36, zIndex: 1 },
            { positionLocked: true }
          )
        ]
      }
    ]
  };
}

/** Kit asset key — structural polish only. */
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
          textLayer(
            'layer_header',
            'Asset key',
            { x: 48, y: 40, w: 280, h: 36, zIndex: 1 },
            { positionLocked: true }
          )
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
