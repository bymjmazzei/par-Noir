/** Shared seed helpers, the Set starter, and kit seeds (table, register, asset key). */

import type {
  PenPageLayer,
  PenPageLayout,
  PenPagePresentation,
  PenSectionContent,
  PenTipTapMark,
  PenTipTapNode
} from './types.js';
import { emptyPollTable, tableSectionFromPayload } from './table.js';

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
          textLayer(
            'layer_cover',
            '',
            { x: 0, y: 0, w: 360, h: 280, zIndex: 1 },
            {
              backgroundGradient: `linear-gradient(135deg, ${TEAL} 0%, #1c1917 70%)`,
              textDoc: tipTapParagraphs('')
            }
          ),
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
