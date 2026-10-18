/** Shared layer builders for curated widget starters. */
import { socialPresentation, type SeedBundle } from '../starterSeeds.js';
import { plainDoc } from '../widgetElements.js';
import type { PenPageLayer, PenTipTapNode } from '../types.js';

export const CURATED_SANS = 'Montserrat, Helvetica, sans-serif';
export const CURATED_SERIF = 'Source Serif 4, Georgia, serif';

export const kickerStyle = { fontFamily: CURATED_SANS, fontSize: 11, color: '#fde68a', bold: true as const };
export const titleStyle = { fontFamily: CURATED_SERIF, fontSize: 24, color: '#ffffff', bold: true as const };
export const bodyStyle = { fontFamily: CURATED_SANS, fontSize: 14, color: '#ffffff', bold: true as const };

function styledDoc(text: string, style: { fontFamily: string; fontSize: number; color: string; bold?: boolean }): PenTipTapNode {
  const marks: NonNullable<PenTipTapNode['marks']> = [{ type: 'textStyle', attrs: { fontFamily: style.fontFamily, fontSize: `${style.fontSize}px`, color: style.color } }];
  if (style.bold) marks.push({ type: 'bold' });
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks }] }] };
}

export function curatedCardSeed(layers: PenPageLayer[]): SeedBundle {
  return {
    seedPageLayout: 'flow',
    seedPagePresentation: socialPresentation({
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined,
      fontFamily: 'Source Serif 4, Georgia, serif',
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

export function artLayer(id: string, htmlSource: string, h = 360): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'html', name: 'Art', x: 0, y: 0, w: 360, h, zIndex: 1, positionLocked: false, htmlSource };
}

export function artHtml(background: string, shapes: string): string {
  return `<style>html,body{margin:0;height:100%;overflow:hidden}body{background:${background}}.s{position:absolute;border-radius:50%}</style>${shapes}`;
}

export function textLayer(id: string, box: { x: number; y: number; w: number; h: number; z: number }, text: string, style: { fontFamily: string; fontSize: number; color: string; bold?: boolean }, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'text', name: text.slice(0, 24), x: box.x, y: box.y, w: box.w, h: box.h, zIndex: box.z, positionLocked: false, backgroundColor: 'transparent', textDoc: styledDoc(text, style), ...extra };
}

export function buttonLayer(id: string, box: { x: number; y: number; w: number; h: number; z: number }, face: string, look: { fill: string; color: string }, extra: Partial<PenPageLayer>): PenPageLayer {
  return { id, kind: 'interactive', widgetElement: 'button', name: face, label: face, x: box.x, y: box.y, w: box.w, h: box.h, zIndex: box.z, positionLocked: false, backgroundColor: look.fill, textColor: look.color, cornerRadius: Math.round(box.h / 2), textDoc: styledDoc(face, { fontFamily: CURATED_SANS, fontSize: 14, color: look.color, bold: true }), ...extra };
}

export function countdownLayer(id: string, box: { x: number; y: number; w: number; h: number; z: number }, color: string, days: number): PenPageLayer {
  return { id, kind: 'text', widgetElement: 'time', name: 'Countdown', x: box.x, y: box.y, w: box.w, h: box.h, zIndex: box.z, positionLocked: false, backgroundColor: 'transparent', textColor: color, timeFace: 'countdown', closesAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() };
}
