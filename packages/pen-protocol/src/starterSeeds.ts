/** Format-first seed IR for platform Social + kit starters. */

import type {
  PenPageLayer,
  PenPageLayout,
  PenPagePresentation,
  PenSectionContent,
  PenTipTapMark,
  PenTipTapNode
} from './types.js';
import { STARTER_ASSETS } from './starterAssets.js';
import { emptyPollTable, tableSectionFromPayload } from './table.js';
import { SEED_TABLE_DOC_PLACEHOLDER } from './seedRefs.js';

const CHARCOAL = '#0c0c0c';
const PAPER = '#f4f1ec';
const INK = '#141414';
const TEAL = '#0f766e';
const GOLD = '#b8956c';
const MUTED = '#6b6560';
const CARD = '#171717';
const PAPER_CARD = '#ffffff';

const SANS = 'Montserrat, Helvetica, sans-serif';
const SERIF = 'Source Serif 4, Georgia, serif';
const MONO = 'Courier New, monospace';

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

function tipTapStyled(
  text: string,
  opts: {
    fontSize?: number | string;
    fontFamily?: string;
    color?: string;
    bold?: boolean;
  } = {}
): PenTipTapNode {
  const attrs: Record<string, unknown> = {};
  if (opts.fontSize != null) {
    attrs.fontSize =
      typeof opts.fontSize === 'number' ? `${opts.fontSize}px` : opts.fontSize;
  }
  if (opts.fontFamily) attrs.fontFamily = opts.fontFamily;
  if (opts.color) attrs.color = opts.color;
  const marks: PenTipTapMark[] = [];
  if (Object.keys(attrs).length) marks.push({ type: 'textStyle', attrs });
  if (opts.bold) marks.push({ type: 'bold' });
  const markBag = marks.length ? { marks } : {};
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line, ...markBag }] : []
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
    fontFamily: partial.fontFamily || SANS,
    fontSize: partial.fontSize ?? 42,
    textColor: partial.textColor || PAPER,
    textStyle: partial.textStyle || 'plain',
    dropShadowColor: partial.dropShadowColor || '#000000',
    dropShadowBlur: partial.dropShadowBlur ?? 12,
    dropShadowOffsetX: partial.dropShadowOffsetX ?? 2,
    dropShadowOffsetY: partial.dropShadowOffsetY ?? 2,
    backgroundColor: partial.backgroundColor || CHARCOAL,
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
    fontFamily: partial.fontFamily || SERIF,
    fontSize: partial.fontSize ?? 18,
    textColor: partial.textColor || INK,
    textStyle: partial.textStyle || 'plain',
    dropShadowColor: '#000000',
    dropShadowBlur: 0,
    dropShadowOffsetX: 0,
    dropShadowOffsetY: 0,
    backgroundColor: partial.backgroundColor || PAPER,
    backgroundImage: partial.backgroundImage,
    backgroundGradient: partial.backgroundGradient,
    textAlign: partial.textAlign || 'left',
    padding: partial.padding ?? 48
  };
}

export type SeedBundle = {
  seedSections: PenSectionContent[];
  seedPagePresentation: PenPagePresentation;
  seedPageLayout?: PenPageLayout;
};

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
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(165deg, ${CHARCOAL} 0%, #161412 55%, #1a1814 100%)`,
      fontSize: 36,
      textAlign: 'left',
      textColor: PAPER,
      padding: 32,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Still thinking about that quiet hallway.',
          'Three people walked past and none of them looked up.'
        ),
        layers: [
          textLayer(
            'layer_accent',
            '',
            { x: 0, y: 0, w: 8, h: 640, zIndex: 1 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_eyebrow',
            'STATUS',
            { x: 36, y: 72, w: 280, h: 28, zIndex: 2 },
            {
              textDoc: tipTapStyled('STATUS', {
                fontSize: 11,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_hook',
            'Still thinking about that quiet hallway.',
            { x: 36, y: 180, w: 292, h: 120, zIndex: 3 },
            {
              textDoc: tipTapStyled('Still thinking about that quiet hallway.', {
                fontSize: 32,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_body',
            'Three people walked past and none of them looked up.',
            { x: 36, y: 320, w: 292, h: 96, zIndex: 3 },
            {
              textDoc: tipTapStyled(
                'Three people walked past and none of them looked up.',
                { fontSize: 17, fontFamily: SANS, color: '#c8c2ba' }
              )
            }
          ),
          textLayer(
            'layer_rule',
            '',
            { x: 36, y: 440, w: 72, h: 3, zIndex: 2 },
            { backgroundColor: GOLD, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_meta',
            'Tue · evening',
            { x: 36, y: 460, w: 200, h: 28, zIndex: 2 },
            {
              textDoc: tipTapStyled('Tue · evening', {
                fontSize: 12,
                fontFamily: SANS,
                color: MUTED
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedNoteTextTileLight(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#e8e4de',
      backgroundGradient: 'linear-gradient(180deg, #ebe7e1 0%, #ddd8d0 100%)',
      textColor: INK,
      fontSize: 22,
      textAlign: 'left',
      dropShadowBlur: 0,
      padding: 24
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Shipping the boring path first.',
          'Everything flashy can wait until the spine holds.'
        ),
        layers: [
          textLayer(
            'layer_card',
            'Shipping the boring path first.\n\nEverything flashy can wait until the spine holds.',
            { x: 28, y: 160, w: 304, h: 280, zIndex: 2 },
            {
              backgroundColor: PAPER_CARD,
              strokeColor: '#d4cfc7',
              strokeWidth: 1,
              shadowColor: 'rgba(20,20,20,0.12)',
              shadowBlur: 24,
              shadowOffsetY: 8,
              textDoc: tipTapStyled(
                'Shipping the boring path first.\n\nEverything flashy can wait until the spine holds.',
                { fontSize: 20, fontFamily: SANS, color: INK }
              )
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 28, y: 160, w: 304, h: 4, zIndex: 3 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          )
        ]
      }
    ]
  };
}

export function seedNoteTextTileDark(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #141210 100%)`,
      textColor: PAPER,
      fontSize: 22,
      textAlign: 'left',
      dropShadowBlur: 0,
      padding: 24
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Unread messages can wait.',
          'Finish the thought you started at lunch.'
        ),
        layers: [
          textLayer(
            'layer_card',
            'Unread messages can wait.\n\nFinish the thought you started at lunch.',
            { x: 28, y: 160, w: 304, h: 280, zIndex: 2 },
            {
              backgroundColor: CARD,
              strokeColor: '#2a2824',
              strokeWidth: 1,
              shadowColor: 'rgba(0,0,0,0.45)',
              shadowBlur: 28,
              shadowOffsetY: 10,
              textDoc: tipTapStyled(
                'Unread messages can wait.\n\nFinish the thought you started at lunch.',
                { fontSize: 20, fontFamily: SANS, color: PAPER }
              )
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 28, y: 160, w: 304, h: 4, zIndex: 3 },
            { backgroundColor: GOLD, textDoc: tipTapParagraphs('') }
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
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(90deg, ${CHARCOAL} 0%, #15130f 100%)`,
      fontSize: 32,
      textAlign: 'left',
      textColor: PAPER,
      padding: 28,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'The week only makes sense in reverse.',
          'Monday was noise. Friday is the thesis.'
        ),
        layers: [
          textLayer(
            'layer_accent',
            '',
            { x: 0, y: 0, w: 10, h: g.h, zIndex: 1 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_headline',
            'The week only makes sense in reverse.',
            { x: 48, y: 88, w: g.w - 96, h: 88, zIndex: 2 },
            {
              textDoc: tipTapStyled('The week only makes sense in reverse.', {
                fontSize: 34,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_sub',
            'Monday was noise. Friday is the thesis.',
            { x: 48, y: 200, w: g.w - 160, h: 48, zIndex: 2 },
            {
              textDoc: tipTapStyled('Monday was noise. Friday is the thesis.', {
                fontSize: 16,
                fontFamily: SANS,
                color: '#b8b2aa'
              })
            }
          ),
          textLayer(
            'layer_rule',
            '',
            { x: 48, y: 268, w: 56, h: 3, zIndex: 2 },
            { backgroundColor: GOLD, textDoc: tipTapParagraphs('') }
          )
        ]
      }
    ]
  };
}

export function seedNoteMediaPortrait(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundImage: STARTER_ASSETS.captionBg,
      fontSize: 28,
      textAlign: 'left',
      textColor: PAPER
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'The words are the post.',
          'Atmosphere only — without the card, nothing remains.'
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
            'layer_scrim',
            '',
            { x: 0, y: 0, w: 360, h: 640, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(12,12,12,0.35) 0%, rgba(12,12,12,0.72) 100%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_card',
            'The words are the post.\n\nAtmosphere only — without the card, nothing remains.',
            { x: 24, y: 200, w: 312, h: 240, zIndex: 3 },
            {
              backgroundColor: 'rgba(12,12,12,0.88)',
              strokeColor: 'rgba(184,149,108,0.35)',
              strokeWidth: 1,
              shadowColor: 'rgba(0,0,0,0.5)',
              shadowBlur: 20,
              shadowOffsetY: 8,
              textDoc: tipTapStyled(
                'The words are the post.\n\nAtmosphere only — without the card, nothing remains.',
                { fontSize: 20, fontFamily: SERIF, color: PAPER }
              )
            }
          )
        ]
      }
    ]
  };
}

export function seedNoteMediaLandscape(): SeedBundle {
  const g = socialGeom('landscape');
  const mediaW = Math.round(g.w * 0.48);
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      fontSize: 28,
      textAlign: 'left',
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Split frame: photo as weather, text as claim.',
          'Crop the words and the post collapses.'
        ),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.imagePost, {
            x: 0,
            y: 0,
            w: mediaW,
            h: g.h,
            zIndex: 1
          }),
          textLayer(
            'layer_card',
            'Split frame: photo as weather, text as claim.\n\nCrop the words and the post collapses.',
            {
              x: mediaW + 16,
              y: 48,
              w: g.w - mediaW - 32,
              h: g.h - 96,
              zIndex: 2
            },
            {
              backgroundColor: 'rgba(12,12,12,0.94)',
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled(
                'Split frame: photo as weather, text as claim.\n\nCrop the words and the post collapses.',
                { fontSize: 18, fontFamily: SANS, color: PAPER }
              )
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
      backgroundColor: PAPER,
      backgroundGradient: `linear-gradient(180deg, ${PAPER} 0%, #ebe6df 100%)`,
      fontSize: 18,
      textAlign: 'left',
      textColor: INK,
      dropShadowBlur: 0,
      padding: 28
    }),
    seedSections: [
      {
        slug: 'title',
        doc: tipTapParagraphs('Why quiet tools win the week'),
        layers: [
          textLayer(
            'layer_kicker',
            'ESSAY',
            { x: 28, y: 36, w: 120, h: 24, zIndex: 2 },
            {
              textDoc: tipTapStyled('ESSAY', {
                fontSize: 11,
                fontFamily: SANS,
                color: TEAL,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_title',
            'Why quiet tools win the week',
            { x: 28, y: 72, w: 304, h: 100, zIndex: 2 },
            {
              textDoc: tipTapStyled('Why quiet tools win the week', {
                fontSize: 28,
                fontFamily: SERIF,
                color: INK,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_rule',
            '',
            { x: 28, y: 184, w: 48, h: 3, zIndex: 2 },
            { backgroundColor: GOLD, textDoc: tipTapParagraphs('') }
          )
        ]
      },
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Lead with the claim: most work fails from interruption, not from lack of ideas.',
          'Keep paragraphs short. Detail that earns the scroll comes second — one concrete scene beats three abstractions.'
        ),
        layers: [
          textLayer(
            'layer_lead',
            'Lead with the claim: most work fails from interruption, not from lack of ideas.',
            { x: 28, y: 220, w: 304, h: 120, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'Lead with the claim: most work fails from interruption, not from lack of ideas.',
                { fontSize: 16, fontFamily: SERIF, color: INK }
              )
            }
          ),
          textLayer(
            'layer_body',
            'Keep paragraphs short. Detail that earns the scroll comes second — one concrete scene beats three abstractions.',
            { x: 28, y: 360, w: 304, h: 160, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'Keep paragraphs short. Detail that earns the scroll comes second — one concrete scene beats three abstractions.',
                { fontSize: 15, fontFamily: SANS, color: '#3a3530' }
              )
            }
          ),
          textLayer(
            'layer_footer_bar',
            '',
            { x: 0, y: 600, w: 360, h: 40, zIndex: 1 },
            { backgroundColor: CHARCOAL, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_footer',
            '6 min read',
            { x: 28, y: 608, w: 160, h: 24, zIndex: 2 },
            {
              textDoc: tipTapStyled('6 min read', {
                fontSize: 11,
                fontFamily: SANS,
                color: GOLD
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedPostCaption(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundImage: STARTER_ASSETS.captionBg,
      fontSize: 26,
      textAlign: 'center',
      textColor: PAPER
    }),
    seedSections: [
      {
        slug: 'caption',
        doc: tipTapParagraphs('Leave before the night turns loud.'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.captionBg, {
            x: 0,
            y: 0,
            w: 360,
            h: 480,
            zIndex: 1
          }),
          textLayer(
            'layer_scrim',
            '',
            { x: 0, y: 280, w: 360, h: 200, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(12,12,12,0) 0%, rgba(12,12,12,0.92) 70%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_caption',
            'Leave before the night turns loud.',
            { x: 28, y: 360, w: 304, h: 80, zIndex: 3 },
            {
              textDoc: tipTapStyled('Leave before the night turns loud.', {
                fontSize: 26,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          )
        ]
      },
      { slug: 'attachments', doc: tipTapParagraphs(''), layers: [] }
    ]
  };
}

export function seedPostImageAspect(aspect: SeedAspect): SeedBundle {
  const g = socialGeom(aspect);
  const captionY = Math.max(24, g.h - 72);
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#000000',
      fontSize: 18,
      textAlign: 'left',
      textColor: PAPER,
      padding: 16,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'attachments',
        doc: tipTapParagraphs(''),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.imagePost, {
            x: 0,
            y: 0,
            w: g.w,
            h: g.h,
            zIndex: 1
          }),
          textLayer(
            'layer_edge',
            '',
            { x: 0, y: 0, w: 6, h: g.h, zIndex: 2 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          )
        ]
      },
      {
        slug: 'caption',
        doc: tipTapParagraphs('Golden hour on the loading dock.'),
        layers: [
          textLayer(
            'layer_caption_scrim',
            '',
            { x: 0, y: captionY - 16, w: g.w, h: g.h - captionY + 16, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_caption',
            'Golden hour on the loading dock.',
            { x: 20, y: captionY, w: g.w - 40, h: 40, zIndex: 3 },
            {
              textDoc: tipTapStyled('Golden hour on the loading dock.', {
                fontSize: 15,
                fontFamily: SANS,
                color: PAPER
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedPostVideoAspect(aspect: SeedAspect): SeedBundle {
  const g = socialGeom(aspect);
  const mediaH = aspect === 'portrait' ? Math.max(400, g.h) : g.h;
  const captionY = Math.max(24, mediaH - 80);
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#050505',
      fontSize: 18,
      textAlign: 'center',
      textColor: PAPER
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
            h: mediaH,
            zIndex: 1
          })
        ]
      },
      {
        slug: 'caption',
        doc: tipTapParagraphs('Cut on the inhale.'),
        layers: [
          textLayer(
            'layer_caption_scrim',
            '',
            { x: 0, y: captionY - 24, w: g.w, h: 104, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(5,5,5,0) 0%, rgba(5,5,5,0.85) 100%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_caption',
            'Cut on the inhale.',
            { x: 24, y: captionY, w: g.w - 48, h: 40, zIndex: 3 },
            {
              textDoc: tipTapStyled('Cut on the inhale.', {
                fontSize: 16,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }
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
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(160deg, ${CHARCOAL} 0%, #14181a 100%)`,
      textAlign: 'left',
      fontSize: 28,
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'slide-1',
        doc: tipTapDoc(
          tipTapHeading('Open with a claim', 2),
          tipTapParagraphs('This page is note-like: words carry the beat.')
        ),
        layers: [
          textLayer(
            'layer_page_mark',
            '01',
            { x: 28, y: 48, w: 80, h: 36, zIndex: 2 },
            {
              textDoc: tipTapStyled('01', {
                fontSize: 14,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_title',
            'Open with a claim',
            { x: 28, y: 200, w: 304, h: 80, zIndex: 2 },
            {
              textDoc: tipTapStyled('Open with a claim', {
                fontSize: 34,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_body',
            'This page is note-like: words carry the beat. Swipe for media.',
            { x: 28, y: 300, w: 304, h: 96, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'This page is note-like: words carry the beat. Swipe for media.',
                { fontSize: 16, fontFamily: SANS, color: '#b8b2aa' }
              )
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 28, y: 420, w: 64, h: 3, zIndex: 2 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          )
        ]
      },
      {
        slug: 'slide-2',
        doc: tipTapParagraphs('Then show the scene'),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.collection2, {
            x: 0,
            y: 0,
            w: 360,
            h: 480,
            zIndex: 1
          }),
          textLayer(
            'layer_scrim',
            '',
            { x: 0, y: 320, w: 360, h: 160, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(12,12,12,0) 0%, rgba(12,12,12,0.9) 80%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_page_mark',
            '02',
            { x: 28, y: 360, w: 80, h: 28, zIndex: 3 },
            {
              textDoc: tipTapStyled('02', {
                fontSize: 12,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_caption',
            'Then show the scene',
            { x: 28, y: 400, w: 304, h: 48, zIndex: 3 },
            {
              textDoc: tipTapStyled('Then show the scene', {
                fontSize: 22,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
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
      backgroundColor: CHARCOAL,
      fontSize: 32,
      textColor: PAPER
    }),
    seedSections: [
      {
        slug: 'cover',
        doc: tipTapParagraphs("Tonight's story"),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.storyCover, {
            x: 0,
            y: 0,
            w: 360,
            h: 640,
            zIndex: 1
          }),
          textLayer(
            'layer_scrim',
            '',
            { x: 0, y: 360, w: 360, h: 280, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(12,12,12,0) 0%, rgba(12,12,12,0.92) 55%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_kicker',
            'STORY',
            { x: 28, y: 460, w: 120, h: 24, zIndex: 3 },
            {
              textDoc: tipTapStyled('STORY', {
                fontSize: 11,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_title',
            "Tonight's story",
            { x: 28, y: 500, w: 304, h: 64, zIndex: 3 },
            {
              textDoc: tipTapStyled("Tonight's story", {
                fontSize: 32,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          )
        ]
      },
      {
        slug: 'pages',
        doc: tipTapParagraphs(
          'Beat two — still vertical.',
          'Keep each beat short enough to hold a thumb.'
        ),
        layers: [
          imageLayer('layer_media', STARTER_ASSETS.storyPage, {
            x: 0,
            y: 0,
            w: 360,
            h: 640,
            zIndex: 1
          }),
          textLayer(
            'layer_card',
            'Beat two — still vertical.\n\nKeep each beat short enough to hold a thumb.',
            { x: 24, y: 420, w: 312, h: 160, zIndex: 3 },
            {
              backgroundColor: 'rgba(12,12,12,0.86)',
              strokeColor: 'rgba(15,118,110,0.4)',
              strokeWidth: 1,
              textDoc: tipTapStyled(
                'Beat two — still vertical.\n\nKeep each beat short enough to hold a thumb.',
                { fontSize: 17, fontFamily: SANS, color: PAPER }
              )
            }
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
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #12100e 100%)`,
      textAlign: 'left',
      fontSize: 22,
      textColor: PAPER,
      padding: 24,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'primary',
        doc: tipTapDoc(
          tipTapHeading('Primary', 2),
          tipTapParagraphs('Set = multi-media assembly. Primary leads; sources orbit.')
        ),
        layers: [
          imageLayer('layer_cover', STARTER_ASSETS.setPrimary, {
            x: 0,
            y: 0,
            w: 360,
            h: 280,
            zIndex: 1
          }),
          textLayer(
            'layer_scrim',
            '',
            { x: 0, y: 180, w: 360, h: 100, zIndex: 2 },
            {
              backgroundGradient:
                'linear-gradient(180deg, rgba(12,12,12,0) 0%, rgba(12,12,12,0.95) 100%)',
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_label',
            'PRIMARY',
            { x: 24, y: 220, w: 140, h: 24, zIndex: 3 },
            {
              textDoc: tipTapStyled('PRIMARY', {
                fontSize: 11,
                fontFamily: SANS,
                color: TEAL,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_title',
            'Field notes, assembled',
            { x: 24, y: 248, w: 312, h: 40, zIndex: 3 },
            {
              textDoc: tipTapStyled('Field notes, assembled', {
                fontSize: 22,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_blurb',
            'Mix image, note, and audio refs — not a same-type slide deck.',
            { x: 24, y: 320, w: 312, h: 72, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'Mix image, note, and audio refs — not a same-type slide deck.',
                { fontSize: 14, fontFamily: SANS, color: '#b8b2aa' }
              )
            }
          )
        ]
      },
      {
        slug: 'sources',
        doc: tipTapDoc(
          tipTapHeading('Sources', 3),
          tipTapParagraphs('Embeds from other templates / posts.')
        ),
        layers: [
          textLayer(
            'layer_header',
            'SOURCES',
            { x: 24, y: 36, w: 200, h: 28, zIndex: 2 },
            {
              textDoc: tipTapStyled('SOURCES', {
                fontSize: 12,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_src_a',
            'Image post — loading dock light',
            { x: 24, y: 88, w: 312, h: 56, zIndex: 2 },
            {
              backgroundColor: CARD,
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled('Image post — loading dock light', {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }
          ),
          textLayer(
            'layer_src_b',
            'Metric — weekly activation',
            { x: 24, y: 160, w: 312, h: 56, zIndex: 2 },
            {
              backgroundColor: CARD,
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled('Metric — weekly activation', {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }
          ),
          textLayer(
            'layer_src_c',
            'Audio — late sketch, take 3',
            { x: 24, y: 232, w: 312, h: 56, zIndex: 2 },
            {
              backgroundColor: CARD,
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled('Audio — late sketch, take 3', {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }
          ),
          textLayer(
            'layer_hint',
            'Attach → From Pen to bind each source.',
            { x: 24, y: 320, w: 312, h: 40, zIndex: 2 },
            {
              textDoc: tipTapStyled('Attach → From Pen to bind each source.', {
                fontSize: 12,
                fontFamily: SANS,
                color: MUTED
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedQuote(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(165deg, ${CHARCOAL} 0%, #161412 100%)`,
      fontSize: 32,
      textAlign: 'left',
      fontFamily: SERIF,
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          '"Clarity is a kindness you practice in public."',
          '— Ada Okonkwo'
        ),
        layers: [
          textLayer(
            'layer_mark',
            '"',
            { x: 24, y: 80, w: 80, h: 80, zIndex: 1 },
            {
              textDoc: tipTapStyled('"', {
                fontSize: 96,
                fontFamily: SERIF,
                color: TEAL
              })
            }
          ),
          textLayer(
            'layer_quote',
            'Clarity is a kindness you practice in public.',
            { x: 32, y: 200, w: 296, h: 180, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'Clarity is a kindness you practice in public.',
                { fontSize: 28, fontFamily: SERIF, color: PAPER }
              )
            }
          ),
          textLayer(
            'layer_rule',
            '',
            { x: 32, y: 420, w: 48, h: 2, zIndex: 2 },
            { backgroundColor: GOLD, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_byline',
            '— Ada Okonkwo',
            { x: 32, y: 444, w: 296, h: 36, zIndex: 2 },
            {
              textDoc: tipTapStyled('— Ada Okonkwo', {
                fontSize: 14,
                fontFamily: SANS,
                color: GOLD
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedLink(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: PAPER,
      backgroundGradient: `linear-gradient(180deg, ${PAPER} 0%, #e8e3dc 100%)`,
      textColor: INK,
      fontSize: 18,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'parnoir.com',
          'Identity without a landlord',
          'How Layer 1 keeps persons at the root of the stack.'
        ),
        layers: [
          textLayer(
            'layer_card',
            '',
            { x: 20, y: 120, w: 320, h: 280, zIndex: 1 },
            {
              backgroundColor: PAPER_CARD,
              strokeColor: '#d4cfc7',
              strokeWidth: 1,
              shadowColor: 'rgba(20,20,20,0.1)',
              shadowBlur: 20,
              shadowOffsetY: 8,
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_domain',
            'parnoir.com',
            { x: 40, y: 148, w: 280, h: 28, zIndex: 2 },
            {
              backgroundColor: '#ebe7e1',
              textDoc: tipTapStyled('parnoir.com', {
                fontSize: 12,
                fontFamily: SANS,
                color: TEAL,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_title',
            'Identity without a landlord',
            { x: 40, y: 200, w: 280, h: 72, zIndex: 2 },
            {
              textDoc: tipTapStyled('Identity without a landlord', {
                fontSize: 22,
                fontFamily: SERIF,
                color: INK,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_snippet',
            'How Layer 1 keeps persons at the root of the stack.',
            { x: 40, y: 290, w: 280, h: 64, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'How Layer 1 keeps persons at the root of the stack.',
                { fontSize: 14, fontFamily: SANS, color: MUTED }
              )
            }
          )
        ]
      }
    ]
  };
}

export function seedPoll(): SeedBundle {
  const tableId = SEED_TABLE_DOC_PLACEHOLDER;
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #101816 100%)`,
      fontSize: 24,
      textAlign: 'left',
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'prompt',
        doc: tipTapParagraphs('Which should we ship next?'),
        layers: [
          textLayer(
            'layer_kicker',
            'POLL',
            { x: 24, y: 28, w: 100, h: 24, zIndex: 1 },
            {
              textDoc: tipTapStyled('POLL', {
                fontSize: 11,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_prompt',
            'Which should we ship next?',
            { x: 24, y: 60, w: 312, h: 56, zIndex: 1 },
            {
              textDoc: tipTapStyled('Which should we ship next?', {
                fontSize: 24,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          {
            id: 'layer_table_embed',
            kind: 'embed',
            name: 'Results',
            x: 24,
            y: 136,
            w: 312,
            h: 120,
            zIndex: 2,
            refDocId: tableId,
            refSectionSlug: 'grid',
            positionLocked: true,
            backgroundColor: CARD,
            strokeColor: '#2a2824',
            strokeWidth: 1
          },
          textLayer(
            'layer_opt_a_chrome',
            'Messaging polish',
            { x: 24, y: 280, w: 312, h: 48, zIndex: 3 },
            {
              backgroundColor: '#1a2422',
              strokeColor: TEAL,
              strokeWidth: 1,
              textDoc: tipTapStyled('Messaging polish', {
                fontSize: 15,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_opt_b_chrome',
            'Pen Mini templates',
            { x: 24, y: 340, w: 312, h: 48, zIndex: 3 },
            {
              backgroundColor: '#1a2422',
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled('Pen Mini templates', {
                fontSize: 15,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }
          ),
          {
            id: 'sticker_opt_a',
            kind: 'interactive',
            name: 'Vote A',
            x: 24,
            y: 280,
            w: 312,
            h: 48,
            zIndex: 5,
            behavior: 'poll.vote',
            bindDocId: tableId,
            bindRowId: 'opt_a',
            label: 'Messaging polish',
            positionLocked: true,
            backgroundColor: 'rgba(15,118,110,0.55)'
          },
          {
            id: 'sticker_opt_b',
            kind: 'interactive',
            name: 'Vote B',
            x: 24,
            y: 340,
            w: 312,
            h: 48,
            zIndex: 5,
            behavior: 'poll.vote',
            bindDocId: tableId,
            bindRowId: 'opt_b',
            label: 'Pen Mini templates',
            positionLocked: true,
            backgroundColor: 'rgba(184,149,108,0.35)'
          },
          textLayer(
            'layer_status',
            'Votes write into the bound table.',
            { x: 24, y: 412, w: 312, h: 32, zIndex: 1 },
            {
              textDoc: tipTapStyled('Votes write into the bound table.', {
                fontSize: 12,
                fontFamily: SANS,
                color: MUTED
              })
            }
          )
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
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #121412 100%)`,
      fontSize: 20,
      textAlign: 'left',
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Draft A vs Draft B — scores from the bound table.'),
        layers: [
          textLayer(
            'layer_header',
            'Compare',
            { x: 24, y: 28, w: 312, h: 36, zIndex: 1 },
            {
              textDoc: tipTapStyled('Compare', {
                fontSize: 22,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_col_a',
            'Draft A',
            { x: 24, y: 80, w: 148, h: 32, zIndex: 1 },
            {
              backgroundColor: '#1a2422',
              textDoc: tipTapStyled('Draft A', {
                fontSize: 13,
                fontFamily: SANS,
                color: TEAL,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_col_b',
            'Draft B',
            { x: 188, y: 80, w: 148, h: 32, zIndex: 1 },
            {
              backgroundColor: '#221e18',
              textDoc: tipTapStyled('Draft B', {
                fontSize: 13,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          {
            id: 'layer_matrix',
            kind: 'embed',
            name: 'Matrix',
            x: 16,
            y: 128,
            w: 328,
            h: 280,
            zIndex: 2,
            refDocId: tableId,
            refSectionSlug: 'grid',
            positionLocked: true,
            backgroundColor: CARD,
            strokeColor: '#2a2824',
            strokeWidth: 1
          },
          textLayer(
            'layer_summary',
            'Clarity +8 · Pace −2 · Retention +5',
            { x: 24, y: 432, w: 312, h: 40, zIndex: 1 },
            {
              textDoc: tipTapStyled('Clarity +8 · Pace −2 · Retention +5', {
                fontSize: 13,
                fontFamily: SANS,
                color: '#b8b2aa'
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedMetric(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: PAPER,
      backgroundGradient: `linear-gradient(165deg, ${PAPER} 0%, #e6e1d9 100%)`,
      textColor: INK,
      fontSize: 64,
      textAlign: 'center',
      dropShadowBlur: 0,
      fontFamily: SANS
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'metric:activation_rate',
          'value:68',
          'unit:percent',
          'delta:+12',
          'period:vs_last'
        ),
        layers: [
          textLayer(
            'layer_card',
            '',
            { x: 28, y: 140, w: 304, h: 320, zIndex: 1 },
            {
              backgroundColor: PAPER_CARD,
              strokeColor: '#d4cfc7',
              strokeWidth: 1,
              shadowColor: 'rgba(20,20,20,0.1)',
              shadowBlur: 24,
              shadowOffsetY: 10,
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 28, y: 140, w: 304, h: 5, zIndex: 2 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_label',
            'Activation rate',
            { x: 48, y: 180, w: 264, h: 32, zIndex: 2 },
            {
              textDoc: tipTapStyled('Activation rate', {
                fontSize: 14,
                fontFamily: SANS,
                color: MUTED,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_value',
            '68%',
            { x: 48, y: 230, w: 264, h: 100, zIndex: 2 },
            {
              textDoc: tipTapStyled('68%', {
                fontSize: 72,
                fontFamily: SANS,
                color: INK,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_delta',
            '+12% vs last period',
            { x: 48, y: 360, w: 264, h: 36, zIndex: 2 },
            {
              textDoc: tipTapStyled('+12% vs last period', {
                fontSize: 15,
                fontFamily: SANS,
                color: TEAL,
                bold: true
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedCode(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #0e1210 100%)`,
      textColor: PAPER,
      fontFamily: MONO,
      fontSize: 14,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'typescript',
          'const unlock = await prove({ file, name, pass });'
        ),
        layers: [
          textLayer(
            'layer_window',
            '',
            { x: 16, y: 80, w: 328, h: 360, zIndex: 1 },
            {
              backgroundColor: '#121614',
              strokeColor: '#2a322e',
              strokeWidth: 1,
              shadowColor: 'rgba(0,0,0,0.4)',
              shadowBlur: 20,
              shadowOffsetY: 8,
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_chrome',
            'ts  ·  unlock.ts',
            { x: 16, y: 80, w: 328, h: 36, zIndex: 2 },
            {
              backgroundColor: '#1a221e',
              textDoc: tipTapStyled('ts  ·  unlock.ts', {
                fontSize: 12,
                fontFamily: SANS,
                color: GOLD
              })
            }
          ),
          textLayer(
            'layer_code',
            "const unlock = await prove({\n  file, name, pass\n});",
            { x: 28, y: 140, w: 304, h: 200, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                "const unlock = await prove({\n  file, name, pass\n});",
                { fontSize: 14, fontFamily: MONO, color: '#d4ebe4' }
              )
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 16, y: 80, w: 4, h: 360, zIndex: 3 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          )
        ]
      }
    ]
  };
}

export function seedProfile(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: PAPER,
      backgroundGradient: `linear-gradient(180deg, ${PAPER} 0%, #e9e4dc 100%)`,
      textColor: INK,
      fontSize: 20,
      textAlign: 'left',
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs(
          'Mira Chen',
          'Product design · verified',
          'Builds quiet interfaces for loud problems.'
        ),
        layers: [
          textLayer(
            'layer_avatar',
            'MC',
            { x: 28, y: 80, w: 72, h: 72, zIndex: 2 },
            {
              backgroundColor: TEAL,
              textDoc: tipTapStyled('MC', {
                fontSize: 22,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_name',
            'Mira Chen',
            { x: 116, y: 88, w: 216, h: 36, zIndex: 2 },
            {
              textDoc: tipTapStyled('Mira Chen', {
                fontSize: 22,
                fontFamily: SERIF,
                color: INK,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_role',
            'Product design · verified',
            { x: 116, y: 128, w: 216, h: 28, zIndex: 2 },
            {
              textDoc: tipTapStyled('Product design · verified', {
                fontSize: 13,
                fontFamily: SANS,
                color: TEAL
              })
            }
          ),
          textLayer(
            'layer_rule',
            '',
            { x: 28, y: 180, w: 304, h: 1, zIndex: 1 },
            { backgroundColor: '#d4cfc7', textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_bio',
            'Builds quiet interfaces for loud problems. Currently shipping browse tiles.',
            { x: 28, y: 208, w: 304, h: 100, zIndex: 2 },
            {
              textDoc: tipTapStyled(
                'Builds quiet interfaces for loud problems. Currently shipping browse tiles.',
                { fontSize: 15, fontFamily: SANS, color: '#3a3530' }
              )
            }
          )
        ]
      }
    ]
  };
}

export function seedAudio(): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(160deg, ${CHARCOAL} 0%, #141210 100%)`,
      fontSize: 18,
      textAlign: 'left',
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Late sketch, take 3', '2:14 · sketch · private'),
        layers: [
          imageLayer('layer_cover', STARTER_ASSETS.musicCover, {
            x: 60,
            y: 72,
            w: 240,
            h: 240,
            zIndex: 1
          }),
          textLayer(
            'layer_cover_frame',
            '',
            { x: 60, y: 72, w: 240, h: 240, zIndex: 2 },
            {
              strokeColor: 'rgba(184,149,108,0.45)',
              strokeWidth: 1,
              textDoc: tipTapParagraphs('')
            }
          ),
          textLayer(
            'layer_title',
            'Late sketch, take 3',
            { x: 28, y: 340, w: 304, h: 40, zIndex: 2 },
            {
              textDoc: tipTapStyled('Late sketch, take 3', {
                fontSize: 22,
                fontFamily: SERIF,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_meta',
            '2:14 · sketch · private',
            { x: 28, y: 384, w: 304, h: 28, zIndex: 2 },
            {
              textDoc: tipTapStyled('2:14 · sketch · private', {
                fontSize: 13,
                fontFamily: SANS,
                color: MUTED
              })
            }
          ),
          textLayer(
            'layer_player',
            '▶   ●———————   0:42',
            { x: 28, y: 440, w: 304, h: 56, zIndex: 2 },
            {
              backgroundColor: CARD,
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled('▶   ●———————   0:42', {
                fontSize: 14,
                fontFamily: SANS,
                color: PAPER
              })
            }
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
      backgroundColor: CHARCOAL,
      backgroundGradient: `linear-gradient(180deg, ${CHARCOAL} 0%, #12100e 100%)`,
      fontSize: 18,
      textAlign: 'left',
      textColor: PAPER,
      dropShadowBlur: 0
    }),
    seedSections: [
      {
        slug: 'body',
        doc: tipTapParagraphs('Interactive frame — embed stage + CTA.'),
        layers: [
          textLayer(
            'layer_kicker',
            'FRAME',
            { x: 20, y: 20, w: 120, h: 24, zIndex: 1 },
            {
              textDoc: tipTapStyled('FRAME', {
                fontSize: 11,
                fontFamily: SANS,
                color: GOLD,
                bold: true
              })
            }
          ),
          {
            id: 'layer_embed',
            kind: 'embed',
            name: 'Stage',
            x: 20,
            y: 56,
            w: 320,
            h: 280,
            zIndex: 1,
            refDocId: tableId,
            refSectionSlug: 'grid',
            positionLocked: true,
            backgroundColor: CARD,
            strokeColor: '#2a2824',
            strokeWidth: 1,
            shadowColor: 'rgba(0,0,0,0.35)',
            shadowBlur: 16,
            shadowOffsetY: 6
          },
          textLayer(
            'layer_cta_chrome',
            'Open collection →',
            { x: 20, y: 360, w: 320, h: 48, zIndex: 3 },
            {
              backgroundColor: TEAL,
              textDoc: tipTapStyled('Open collection →', {
                fontSize: 15,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }
          ),
          {
            id: 'sticker_cta',
            kind: 'interactive',
            name: 'CTA',
            x: 20,
            y: 360,
            w: 320,
            h: 48,
            zIndex: 5,
            behavior: 'cta.open',
            bindDocId: tableId,
            label: 'Open collection →',
            positionLocked: true,
            backgroundColor: 'rgba(15,118,110,0.35)'
          },
          textLayer(
            'layer_hint',
            'Stickers bake out; chrome stays.',
            { x: 20, y: 428, w: 320, h: 28, zIndex: 1 },
            {
              textDoc: tipTapStyled('Stickers bake out; chrome stays.', {
                fontSize: 12,
                fontFamily: SANS,
                color: MUTED
              })
            }
          )
        ]
      }
    ]
  };
}

export function seedTablePrimitive(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: PAPER_CARD,
      fontFamily: MONO,
      fontSize: 14
    }),
    seedSections: [tableSectionFromPayload('grid', emptyPollTable())]
  };
}

export function seedRegister(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: PAPER,
      fontFamily: MONO,
      fontSize: 14,
      textColor: INK
    }),
    seedSections: [
      {
        slug: 'rows',
        doc: tipTapParagraphs(
          'id | label | notes',
          'row-1 | Launch checklist | Ready',
          'row-2 | Review queue | Open'
        ),
        layers: [
          textLayer(
            'layer_header',
            'Register',
            { x: 48, y: 40, w: 280, h: 36, zIndex: 1 },
            {
              textDoc: tipTapStyled('Register', {
                fontSize: 20,
                fontFamily: SANS,
                color: INK,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 48, y: 84, w: 48, h: 3, zIndex: 1 },
            { backgroundColor: TEAL, textDoc: tipTapParagraphs('') }
          )
        ]
      }
    ]
  };
}

export function seedAssetKey(): SeedBundle {
  return {
    seedPageLayout: 'letter',
    seedPagePresentation: paperPresentation({
      backgroundColor: CHARCOAL,
      textColor: PAPER,
      fontFamily: MONO,
      fontSize: 14
    }),
    seedSections: [
      {
        slug: 'grant',
        doc: tipTapParagraphs('asset: (id)', 'scope: personal', 'price: —'),
        layers: [
          textLayer(
            'layer_header',
            'Asset key',
            { x: 48, y: 40, w: 280, h: 36, zIndex: 1 },
            {
              textDoc: tipTapStyled('Asset key', {
                fontSize: 20,
                fontFamily: SANS,
                color: PAPER,
                bold: true
              })
            }
          ),
          textLayer(
            'layer_accent',
            '',
            { x: 48, y: 84, w: 48, h: 3, zIndex: 1 },
            { backgroundColor: GOLD, textDoc: tipTapParagraphs('') }
          ),
          textLayer(
            'layer_card',
            'asset: (id)\nscope: personal\nprice: —',
            { x: 48, y: 120, w: 400, h: 120, zIndex: 1 },
            {
              backgroundColor: CARD,
              strokeColor: '#2a2824',
              strokeWidth: 1,
              textDoc: tipTapStyled('asset: (id)\nscope: personal\nprice: —', {
                fontSize: 14,
                fontFamily: MONO,
                color: '#d4ebe4'
              })
            }
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
