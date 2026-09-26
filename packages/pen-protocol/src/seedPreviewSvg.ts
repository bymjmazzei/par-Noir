/**
 * Flatten Social seed IR (inert layers only) to SVG gallery posters.
 * Interactive stickers are excluded — dual-export contract (actionPartition).
 */

import { sectionWithoutActionLayers } from './actionPartition.js';
import { docToPlainText } from './richDoc.js';
import type { PenPageLayer, PenPagePresentation, PenSectionContent } from './types.js';
import type { PenTemplate } from './templates.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canvasSize(aspect?: '9/16' | '16/9' | '1/1'): { w: number; h: number } {
  if (aspect === '16/9') return { w: 640, h: 360 };
  if (aspect === '1/1') return { w: 360, h: 360 };
  return { w: 360, h: 640 };
}

function layerText(layer: PenPageLayer): string {
  if (layer.kind === 'interactive' && layer.label) return layer.label;
  if (layer.kind === 'embed') return layer.name || 'Embedded';
  if (layer.textDoc) return docToPlainText(layer.textDoc).trim();
  return '';
}

function fontSizeFromDoc(layer: PenPageLayer, fallback: number): number {
  const doc = layer.textDoc;
  const marks = doc?.content?.[0]?.content?.[0]?.marks;
  if (!marks) return fallback;
  for (const m of marks) {
    if (m.type === 'textStyle' && m.attrs && typeof m.attrs.fontSize === 'string') {
      const n = parseFloat(m.attrs.fontSize);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return fallback;
}

function fontFamilyFromDoc(layer: PenPageLayer, fallback: string): string {
  const doc = layer.textDoc;
  const marks = doc?.content?.[0]?.content?.[0]?.marks;
  if (!marks) return fallback;
  for (const m of marks) {
    if (m.type === 'textStyle' && m.attrs && typeof m.attrs.fontFamily === 'string') {
      return m.attrs.fontFamily;
    }
  }
  return fallback;
}

function textColorFromDoc(layer: PenPageLayer, fallback: string): string {
  const doc = layer.textDoc;
  const marks = doc?.content?.[0]?.content?.[0]?.marks;
  if (!marks) return fallback;
  for (const m of marks) {
    if (m.type === 'textStyle' && m.attrs && typeof m.attrs.color === 'string') {
      return m.attrs.color;
    }
  }
  return fallback;
}

function renderLayer(
  layer: PenPageLayer,
  pres: PenPagePresentation,
  filterId: string
): string {
  if (layer.visible === false) return '';
  const x = layer.x;
  const y = layer.y;
  const w = layer.w;
  const h = layer.h;
  const parts: string[] = [];
  const fill = layer.backgroundColor || 'none';
  const stroke = layer.strokeColor
    ? ` stroke="${esc(layer.strokeColor)}" stroke-width="${layer.strokeWidth || 1}"`
    : '';
  const opacity =
    layer.opacity != null && layer.opacity < 100 ? ` opacity="${layer.opacity / 100}"` : '';
  const filter =
    layer.shadowBlur && layer.shadowBlur > 0 ? ` filter="url(#${filterId})"` : '';

  if (layer.kind === 'image' || layer.kind === 'video') {
    const mediaFill = layer.kind === 'video' ? '#1a1a1a' : '#2a2a2a';
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${mediaFill}"${opacity}/>`
    );
    if (layer.imageSrc || layer.videoSrc) {
      // External URLs may not load in all contexts; show graded plate + label.
      const label = layer.kind === 'video' ? 'VIDEO' : 'PHOTO';
      parts.push(
        `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff88" font-family="Montserrat, Helvetica, sans-serif" font-size="14" font-weight="600" letter-spacing="0.12em">${label}</text>`
      );
    }
    return parts.join('\n');
  }

  if (layer.kind === 'embed') {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${esc(
        fill === 'none' ? '#1e293b' : fill
      )}"${stroke}${opacity}${filter}/>`
    );
    const label = esc(layer.name || 'Table');
    parts.push(
      `<text x="${x + 16}" y="${y + 28}" fill="#94a3b8" font-family="Montserrat, Helvetica, sans-serif" font-size="12">${label}</text>`
    );
    return parts.join('\n');
  }

  // text / decorative
  if (fill !== 'none' && fill !== 'transparent') {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${esc(
        fill
      )}"${stroke}${opacity}${filter}/>`
    );
  } else if (stroke) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none"${stroke}${opacity}/>`
    );
  }

  const text = layerText(layer);
  if (text) {
    const fs = fontSizeFromDoc(layer, Math.min(pres.fontSize || 18, 42));
    const ff = esc(fontFamilyFromDoc(layer, pres.fontFamily || 'Georgia, serif'));
    const color = esc(textColorFromDoc(layer, pres.textColor || '#ffffff'));
    const lines = text.split(/\n/).filter(Boolean);
    const lineH = fs * 1.25;
    const startY = y + Math.min(fs + 8, h * 0.35);
    lines.slice(0, 8).forEach((line, i) => {
      const ty = startY + i * lineH;
      if (ty > y + h - 4) return;
      parts.push(
        `<text x="${x + 12}" y="${ty}" fill="${color}" font-family="${ff}" font-size="${fs}" xml:space="preserve">${esc(
          line.length > 42 ? `${line.slice(0, 40)}…` : line
        )}</text>`
      );
    });
  }

  return parts.join('\n');
}

/** SVG flatten for one section (action layers stripped). */
export function renderSectionPreviewSvg(input: {
  section: PenSectionContent;
  presentation: PenPagePresentation;
  galleryAspect?: '9/16' | '16/9' | '1/1';
}): string {
  const { w, h } = canvasSize(input.galleryAspect);
  const sec = sectionWithoutActionLayers(input.section);
  const pres = input.presentation;
  const bg = esc(pres.backgroundColor || '#0c0c0c');
  const gradient = pres.backgroundGradient
    ? `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${esc(
        pres.backgroundColor || '#0c0c0c'
      )}"/><stop offset="100%" stop-color="#1a1a1a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#pg)"/>`
    : `<rect width="100%" height="100%" fill="${bg}"/>`;

  const layers = [...(sec.layers || [])].sort((a, b) => a.zIndex - b.zIndex);
  const filters = layers
    .map((l, i) => {
      if (!l.shadowBlur) return '';
      const id = `sh${i}`;
      return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${
        l.shadowOffsetX || 0
      }" dy="${l.shadowOffsetY || 4}" stdDeviation="${Math.max(
        (l.shadowBlur || 8) / 3,
        1
      )}" flood-color="${esc(l.shadowColor || '#000')}" flood-opacity="0.45"/></filter>`;
    })
    .filter(Boolean)
    .join('');

  const body = layers
    .map((l, i) => renderLayer(l, pres, `sh${i}`))
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${filters}</defs>
${gradient}
${body}
</svg>
`;
}

/** Prefer first section with layers; else first section. */
export function renderTemplatePreviewSvg(template: PenTemplate): string | null {
  const sections = template.seedSections;
  if (!sections?.length) return null;
  const withLayers =
    sections.find((s) => (s.layers || []).some((l) => l.visible !== false)) || sections[0];
  if (!withLayers) return null;
  const presentation =
    template.seedPagePresentation ||
    ({
      fontFamily: 'Georgia, serif',
      fontSize: 24,
      textColor: '#ffffff',
      dropShadowColor: '#000',
      dropShadowBlur: 0,
      dropShadowOffsetX: 0,
      dropShadowOffsetY: 0,
      backgroundColor: '#0c0c0c',
      textAlign: 'left',
      padding: 24
    } satisfies PenPagePresentation);
  return renderSectionPreviewSvg({
    section: withLayers,
    presentation,
    galleryAspect: template.seedGalleryAspect
  });
}
