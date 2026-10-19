/** Shared layer builders for curated widget starters and platform post templates. */
import { socialPresentation, type SeedBundle } from '../starterSeeds.js';
import { plainDoc } from '../widgetElements.js';
import type { PenLayerAnimation, PenPageLayer, PenPagePresentation, PenTipTapNode } from '../types.js';
import { scaledContent } from '../layers.js';

export const CURATED_SANS = 'Montserrat, Helvetica, sans-serif';
export const CURATED_SERIF = 'Source Serif 4, Georgia, serif';
export const CURATED_MONO = 'Courier New, monospace';

export type Box = { x: number; y: number; w: number; h: number; z: number };
export type Look = { fill: string; color: string };
export type Font = {
  family?: 'sans' | 'serif' | 'mono';
  size: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
};

export function box(x: number, y: number, w: number, h: number, z: number): Box {
  return { x, y, w, h, z };
}

export type Frame = { w: number; h: number };

/** Social page sizes; each matches a gallery aspect. */
export const FRAMES = {
  portrait: { w: 360, h: 640 },
  landscape: { w: 640, h: 360 },
  square: { w: 360, h: 360 }
} as const satisfies Record<string, Frame>;

/**
 * Browse chrome painted over a social page, as fractions of the phone screen.
 * Must match apps/pen index.css (`.pen-phone-*`) and feed-tile `engagementRailLayout`.
 */
export const FEED_CHROME = {
  topRail: 0.06,
  bottomNav: 0.08,
  caption: { left: 0.03, right: 0.18, bottom: 0.08, height: 0.1 },
  /** Rail sits `bottom` up from the screen edge and never rises past `top`; icons scale with screen height. */
  rail: { right: 0.02, top: 0.5, bottom: 0.2, iconOfHeight: (0.9 * 0.3) / (6 + 5 * 0.28), countOverhang: 0.12 }
} as const;

export type ChromeZone = { name: 'feed rail' | 'bottom nav' | 'caption' | 'engagement rail'; x: number; y: number; w: number; h: number };

/**
 * Where browse chrome covers a page, in page pixels. Portrait and square pages sit in a 9:16 phone
 * (square letterboxed on center); landscape fills a 16:9 phone.
 */
export function feedChromeZones(frame: Frame): ChromeZone[] {
  const W = frame.w;
  const H = frame.w > frame.h ? frame.h : (frame.w * 16) / 9;
  const top = (H - frame.h) / 2;
  const { caption, rail } = FEED_CHROME;
  const railIcon = H * rail.iconOfHeight;
  const railLeft = W * (1 - rail.right) - railIcon * (1 + rail.countOverhang);
  const zones: ChromeZone[] = [
    { name: 'feed rail', x: 0, y: 0, w: W, h: H * FEED_CHROME.topRail },
    { name: 'bottom nav', x: 0, y: H * (1 - FEED_CHROME.bottomNav), w: W, h: H * FEED_CHROME.bottomNav },
    {
      name: 'caption',
      x: W * caption.left,
      y: H * (1 - caption.bottom - caption.height),
      w: W * (1 - caption.left - caption.right),
      h: H * caption.height
    },
    { name: 'engagement rail', x: railLeft, y: H * rail.top, w: W - railLeft, h: H * (1 - rail.top - rail.bottom) }
  ];
  return zones
    .map((zone) => {
      const y0 = Math.max(0, zone.y - top);
      const y1 = Math.min(frame.h, zone.y + zone.h - top);
      return { ...zone, y: y0, h: y1 - y0 };
    })
    .filter((zone) => zone.h > 0);
}

export type Theme = {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  primary: Look;
  ghost: Look;
  field: Look;
};

/** Named palettes; widgets pick one and override where the art needs it. */
export const themes = {
  ink: {
    bg: '#0b0b0c',
    ink: '#f5f5f4',
    muted: 'rgba(245,245,244,0.62)',
    accent: '#facc15',
    primary: { fill: '#facc15', color: '#0b0b0c' },
    ghost: { fill: 'rgba(255,255,255,0.1)', color: '#f5f5f4' },
    field: { fill: '#1c1c1f', color: '#f5f5f4' }
  },
  paper: {
    bg: '#f6f1e7',
    ink: '#1c1917',
    muted: '#78716c',
    accent: '#b45309',
    primary: { fill: '#1c1917', color: '#f6f1e7' },
    ghost: { fill: '#ffffff', color: '#1c1917' },
    field: { fill: '#ffffff', color: '#1c1917' }
  },
  sunset: {
    bg: '#7c2d12',
    ink: '#fff7ed',
    muted: 'rgba(255,247,237,0.72)',
    accent: '#fdba74',
    primary: { fill: '#fff7ed', color: '#7c2d12' },
    ghost: { fill: 'rgba(255,255,255,0.16)', color: '#fff7ed' },
    field: { fill: '#fff7ed', color: '#431407' }
  },
  forest: {
    bg: '#052e16',
    ink: '#ecfdf5',
    muted: 'rgba(236,253,245,0.68)',
    accent: '#86efac',
    primary: { fill: '#86efac', color: '#052e16' },
    ghost: { fill: 'rgba(255,255,255,0.12)', color: '#ecfdf5' },
    field: { fill: '#ecfdf5', color: '#052e16' }
  },
  night: {
    bg: '#0f172a',
    ink: '#e2e8f0',
    muted: 'rgba(226,232,240,0.62)',
    accent: '#818cf8',
    primary: { fill: '#818cf8', color: '#0f172a' },
    ghost: { fill: 'rgba(255,255,255,0.1)', color: '#e2e8f0' },
    field: { fill: '#1e293b', color: '#e2e8f0' }
  },
  citrus: {
    bg: '#fef9c3',
    ink: '#1a2e05',
    muted: '#4d7c0f',
    accent: '#65a30d',
    primary: { fill: '#1a2e05', color: '#fef9c3' },
    ghost: { fill: '#ffffff', color: '#1a2e05' },
    field: { fill: '#ffffff', color: '#1a2e05' }
  },
  rose: {
    bg: '#fff1f2',
    ink: '#4c0519',
    muted: '#9f1239',
    accent: '#e11d48',
    primary: { fill: '#e11d48', color: '#ffffff' },
    ghost: { fill: '#ffffff', color: '#4c0519' },
    field: { fill: '#ffffff', color: '#4c0519' }
  },
  slate: {
    bg: '#e2e8f0',
    ink: '#0f172a',
    muted: '#475569',
    accent: '#0369a1',
    primary: { fill: '#0f172a', color: '#ffffff' },
    ghost: { fill: '#ffffff', color: '#0f172a' },
    field: { fill: '#ffffff', color: '#0f172a' }
  }
} satisfies Record<string, Theme>;

function familyOf(font: Font): string {
  if (font.family === 'serif') return CURATED_SERIF;
  if (font.family === 'mono') return CURATED_MONO;
  return CURATED_SANS;
}

/** Each string in `content` becomes its own paragraph. */
export function richDoc(content: string | string[], font: Font): PenTipTapNode {
  const lines = Array.isArray(content) ? content : [content];
  const marks: NonNullable<PenTipTapNode['marks']> = [
    { type: 'textStyle', attrs: { fontFamily: familyOf(font), fontSize: `${font.size}px`, color: font.color } }
  ];
  if (font.bold) marks.push({ type: 'bold' });
  if (font.italic) marks.push({ type: 'italic' });
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      ...(font.align && font.align !== 'left' ? { attrs: { textAlign: font.align } } : {}),
      content: line ? [{ type: 'text', text: line, marks }] : []
    }))
  };
}

/** Editor text layers pad their content by 8px; authored boxes are the visible text area. */
const TEXT_PAD_PX = 8;

function padTextLayers(layers: PenPageLayer[], frame?: Frame, skip?: (layer: PenPageLayer) => boolean): PenPageLayer[] {
  const art = layers.find((layer) => layer.widgetElement === 'html');
  const frameW = frame?.w ?? art?.w ?? 360;
  const frameH = frame?.h ?? art?.h ?? 360;
  return layers.map((layer) => {
    if (layer.widgetElement !== 'text' || layer.backgroundColor !== 'transparent') return layer;
    if (skip?.(layer)) return layer;
    const x = Math.max(0, layer.x - TEXT_PAD_PX);
    const y = Math.max(0, layer.y - TEXT_PAD_PX);
    const right = Math.min(frameW, layer.x + layer.w + TEXT_PAD_PX);
    const bottom = Math.min(frameH, layer.y + layer.h + TEXT_PAD_PX);
    return { ...layer, x, y, w: right - x, h: bottom - y };
  });
}

export function curatedCardSeed(layers: PenPageLayer[]): SeedBundle {
  layers = padTextLayers(layers);
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined,
      fontFamily: CURATED_SERIF,
      fontSize: 28,
      textAlign: 'left',
      textColor: '#141414',
      padding: 0,
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0
    }),
    seedSections: [{ slug: 'card', doc: plainDoc(''), layers }]
  };
}

/** The art layer defines the poster frame: 360 wide, 360 / 640 / 120 tall. */
export function artLayer(id: string, htmlSource: string, h = 360, w = 360): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'html', name: 'Art', x: 0, y: 0, w, h, zIndex: 1, positionLocked: false, htmlSource };
}

/** Full-page background art sized to the page frame. */
export function pageArt(id: string, htmlSource: string, frame: Frame): PenPageLayer {
  return artLayer(id, htmlSource, frame.h, frame.w);
}

/**
 * A media spot drawn as art. Attach on the layer swaps in the author's photo or clip.
 * Names start with Photo, Clip, Avatar, or Track.
 */
export function slotLayer(id: string, b: Box, name: string, htmlSource: string, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'html', name, x: b.x, y: b.y, w: b.w, h: b.h, zIndex: b.z, positionLocked: false, htmlSource, ...extra };
}

/** Intro (and optional outro) animation sampled at playback. */
export function motion(layer: PenPageLayer, animation: PenLayerAnimation): PenPageLayer {
  return { ...layer, motion: { keys: [], animation: { durationSec: 0.5, ...animation } } };
}

/** Folds `children` into one group folder; bounds are recomputed when the page is sealed. */
export function groupLayers(id: string, name: string, children: PenPageLayer[]): PenPageLayer[] {
  const z = Math.max(...children.map((layer) => layer.zIndex)) + 1;
  const group: PenPageLayer = { id, kind: 'group', name, x: 0, y: 0, w: 0, h: 0, zIndex: z, backgroundColor: 'transparent' };
  return [group, ...children.map((layer) => ({ ...layer, parentGroupId: id }))];
}

/**
 * Places a curated widget seed on a page as one group, scaled from `at`.
 * Ids are prefixed so several widgets can share a page.
 */
export function embedWidget(
  prefix: string,
  widgetTemplateId: string,
  name: string,
  seed: () => SeedBundle,
  at: { x: number; y: number; scale?: number; z: number }
): PenPageLayer[] {
  const scale = at.scale ?? 1;
  const layers = seed().seedSections[0]?.layers ?? [];
  const reId = (id: string) => `${prefix}_${id}`;
  const children = layers.map((layer) => ({
    ...layer,
    id: reId(layer.id),
    parentGroupId: prefix,
    x: at.x + layer.x * scale,
    y: at.y + layer.y * scale,
    w: layer.w * scale,
    h: layer.h * scale,
    zIndex: at.z + layer.zIndex,
    ...(scale !== 1 ? { contentScale: scaledContent(layer.contentScale, scale) } : {}),
    ...(layer.revealLayerId ? { revealLayerId: reId(layer.revealLayerId) } : {}),
    ...(layer.bindRowId ? { bindRowId: reId(layer.bindRowId) } : {})
  }));
  const group: PenPageLayer = {
    id: prefix,
    kind: 'group',
    name,
    widgetTemplateId,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    zIndex: Math.max(...children.map((layer) => layer.zIndex)) + 1,
    backgroundColor: 'transparent'
  };
  return [group, ...children];
}

function sealGroups(layers: PenPageLayer[]): PenPageLayer[] {
  return layers.map((layer) => {
    if (layer.kind !== 'group') return layer;
    const members = layers.filter((member) => member.parentGroupId === layer.id);
    if (!members.length) return layer;
    const x = Math.min(...members.map((m) => m.x));
    const y = Math.min(...members.map((m) => m.y));
    const w = Math.max(...members.map((m) => m.x + m.w)) - x;
    const h = Math.max(...members.map((m) => m.y + m.h)) - y;
    return { ...layer, x, y, w, h };
  });
}

/**
 * A finished social page set: each entry is one swipeable page at `frame` size.
 * Embedded widgets arrive padded already, so only authored text is padded here.
 */
export function pageSeed(
  frame: Frame,
  pages: Array<{ slug: string; layers: PenPageLayer[] }>,
  presentation: Partial<PenPagePresentation> = {}
): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: '#0b0b0c',
      fontFamily: CURATED_SERIF,
      fontSize: 28,
      textAlign: 'left',
      textColor: '#f5f5f4',
      padding: 0,
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0,
      ...presentation
    }),
    seedSections: pages.map((page) => {
      const embedded = new Set(page.layers.filter((l) => l.kind === 'group' && l.widgetTemplateId).map((l) => l.id));
      const padded = padTextLayers(page.layers, frame, (layer) => Boolean(layer.parentGroupId && embedded.has(layer.parentGroupId)));
      return { slug: page.slug, doc: plainDoc(''), layers: sealGroups(padded) };
    })
  };
}

/** Stacks section seeds top to bottom, prefixing ids so each page stays unique. */
export function stackSections(page: string, sections: Array<() => SeedBundle>): PenPageLayer[] {
  const out: PenPageLayer[] = [];
  let top = 0;
  sections.forEach((seed, index) => {
    const layers = seed().seedSections[0]?.layers ?? [];
    const reId = (id: string) => `${page}_${index}_${id}`;
    let height = 0;
    for (const layer of layers) {
      if (layer.widgetElement === 'html') height = Math.max(height, layer.h);
      out.push({
        ...layer,
        id: reId(layer.id),
        y: layer.y + top,
        ...(layer.revealLayerId ? { revealLayerId: reId(layer.revealLayerId) } : {}),
        ...(layer.bindRowId ? { bindRowId: reId(layer.bindRowId) } : {})
      });
    }
    top += height;
  });
  return out;
}

/** `.s` is an absolute circle, `.r` an absolute block; `css` adds per-widget rules. */
export function artHtml(background: string, shapes: string, css = ''): string {
  return `<style>html,body{margin:0;height:100%;overflow:hidden}body{background:${background};position:relative}.s{position:absolute;border-radius:50%}.r{position:absolute}${css}</style>${shapes}`;
}

export function textLayer(id: string, b: Box, content: string | string[], font: Font, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  const first = Array.isArray(content) ? content[0] || '' : content;
  return {
    id,
    kind: 'text',
    widgetElement: 'text',
    name: first.slice(0, 24) || 'Text',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: false,
    backgroundColor: 'transparent',
    textDoc: richDoc(content, font),
    ...extra
  };
}

/** A filled text layer: cards, tiles, slides, reveal panels. */
export function panelLayer(
  id: string,
  b: Box,
  fill: string,
  content: string | string[],
  font: Font,
  extra: Partial<PenPageLayer> = {}
): PenPageLayer {
  return textLayer(id, b, content, font, {
    name: extra.name || 'Panel',
    backgroundColor: fill,
    cornerRadius: 12,
    ...extra
  });
}

export function buttonLayer(
  id: string,
  b: Box,
  face: string,
  look: Look,
  extra: Partial<PenPageLayer>,
  opts: { size?: number; radius?: number; stroke?: string } = {}
): PenPageLayer {
  return {
    id,
    kind: 'interactive',
    widgetElement: 'button',
    name: face,
    label: face,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: false,
    backgroundColor: look.fill,
    textColor: look.color,
    cornerRadius: opts.radius ?? Math.round(b.h / 2),
    ...(opts.stroke ? { strokeColor: opts.stroke, strokeWidth: 1 } : {}),
    textDoc: richDoc(face, { size: opts.size ?? 14, color: look.color, bold: true, align: 'center' }),
    ...extra
  };
}

export function inputLayer(id: string, b: Box, placeholder: string, look: Look, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'input',
    name: placeholder.replace(/…$/, '') || 'Field',
    label: placeholder,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: false,
    backgroundColor: look.fill,
    textColor: look.color,
    cornerRadius: 10,
    ...extra
  };
}

export function scoreLayer(id: string, b: Box, color: string, fill = 'transparent'): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'score',
    name: 'Score',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: false,
    backgroundColor: fill,
    textColor: color,
    cornerRadius: Math.round(b.h / 2)
  };
}

export function countdownLayer(id: string, b: Box, color: string, days: number, fill = 'transparent'): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'time',
    name: 'Countdown',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: false,
    backgroundColor: fill,
    textColor: color,
    cornerRadius: Math.round(b.h / 2),
    timeFace: 'countdown',
    closesAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  };
}

export function clockLayer(id: string, b: Box, color: string, time: string, fill = 'transparent'): PenPageLayer {
  return {
    id,
    kind: 'text',
    widgetElement: 'time',
    name: 'Clock',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    zIndex: b.z,
    positionLocked: false,
    backgroundColor: fill,
    textColor: color,
    cornerRadius: Math.round(b.h / 2),
    timeFace: 'clock',
    clockTime: time
  };
}

/** ISO start `days` from now at `hour`:00 local. */
export function eventStartIn(days: number, hour: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
