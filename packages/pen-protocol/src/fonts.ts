/**
 * Curated + catalog fonts shared by full Pen editor and Pen Mini.
 * Custom/owner fonts live in cloud indexes — not in this module.
 */

import { PEN_GOOGLE_FONTS_ALL } from './googleFontFamilies.js';
import type { PenDocManifest, PenSectionContent, PenTipTapNode } from './types.js';

export { PEN_GOOGLE_FONTS_ALL };
export type { PenGoogleFontFamily } from './googleFontFamilies.js';

/** Web-safe / system fonts always shown in the picker. */
export const PEN_SYSTEM_FONTS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Impact',
  'Comic Sans MS',
  'Trebuchet MS'
] as const;

/** Featured Google fonts shown before expand-all. */
export const PEN_GOOGLE_FONTS_FEATURED = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Source Serif 4',
  'Merriweather'
] as const;

/**
 * @deprecated Prefer PEN_SYSTEM_FONTS + PEN_GOOGLE_FONTS_FEATURED.
 * Flat list kept for any remaining single-array call sites.
 */
export const PEN_FONT_FAMILIES = [
  ...PEN_SYSTEM_FONTS,
  ...PEN_GOOGLE_FONTS_FEATURED
] as const;

export type PenSystemFont = (typeof PEN_SYSTEM_FONTS)[number];
export type PenGoogleFontFeatured = (typeof PEN_GOOGLE_FONTS_FEATURED)[number];
export type PenFontFamily = (typeof PEN_FONT_FAMILIES)[number];

export const PEN_FONT_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72] as const;

/** Owner My Fonts localStorage buffer key (pn-scoped). */
export function personalFontsStorageKey(pnIdentifier: string): string {
  return `pen_personal_fonts_v1:${pnIdentifier}`;
}

export interface PenFontIndexEntry {
  fontId: string;
  family: string;
  fileName: string;
  mime: string;
  createdAt: string;
}

/** Doc-manifest reference for custom fonts actively used in the doc. */
export interface PenUsedCustomFont {
  fontId: string;
  family: string;
}

const SYSTEM_SET = new Set<string>(PEN_SYSTEM_FONTS);
const GOOGLE_FEATURED_SET = new Set<string>(PEN_GOOGLE_FONTS_FEATURED);
const GOOGLE_ALL_SET = new Set<string>(PEN_GOOGLE_FONTS_ALL as readonly string[]);

export function isSystemPenFont(family: string): boolean {
  return SYSTEM_SET.has(family);
}

export function isGooglePenFont(family: string): boolean {
  return GOOGLE_ALL_SET.has(family) || GOOGLE_FEATURED_SET.has(family);
}

export function isPlatformPenFont(family: string): boolean {
  return isSystemPenFont(family) || isGooglePenFont(family);
}

/** True when family is not a known system/Google platform font (likely custom). */
export function isCustomPenFont(family: string | null | undefined): boolean {
  const f = String(family || '').trim();
  if (!f) return false;
  return !isPlatformPenFont(f);
}

function walkTipTapFamilies(node: PenTipTapNode | undefined, out: Set<string>): void {
  if (!node) return;
  if (node.marks) {
    for (const m of node.marks) {
      if (m.type === 'textStyle' && m.attrs && typeof m.attrs.fontFamily === 'string') {
        const fam = m.attrs.fontFamily.trim();
        if (fam) out.add(fam);
      }
    }
  }
  if (node.content) {
    for (const child of node.content) walkTipTapFamilies(child, out);
  }
}

/** Collect distinct fontFamily strings from TipTap docs + page presentation. */
export function collectFontFamiliesFromDoc(params: {
  sections: PenSectionContent[];
  pagePresentationFontFamily?: string | null;
}): string[] {
  const out = new Set<string>();
  const pageFam = String(params.pagePresentationFontFamily || '').trim();
  if (pageFam) out.add(pageFam);
  for (const section of params.sections) {
    walkTipTapFamilies(section.doc, out);
    for (const layer of section.layers || []) {
      walkTipTapFamilies(layer.textDoc, out);
    }
  }
  return [...out];
}

/**
 * Build usedCustomFonts for the manifest from doc content + known owner index.
 * Only families that match a custom index entry (or are clearly non-platform) are kept.
 */
export function collectUsedCustomFonts(params: {
  sections: PenSectionContent[];
  manifest?: Pick<PenDocManifest, 'pagePresentation' | 'usedCustomFonts'> | null;
  /** Owner / known custom fonts (fontId + family). */
  customIndex: Array<Pick<PenFontIndexEntry, 'fontId' | 'family'>>;
}): PenUsedCustomFont[] {
  const families = collectFontFamiliesFromDoc({
    sections: params.sections,
    pagePresentationFontFamily: params.manifest?.pagePresentation?.fontFamily
  });
  const byFamily = new Map<string, string>();
  for (const e of params.customIndex) {
    if (e.family && e.fontId) byFamily.set(e.family, e.fontId);
  }
  // Preserve prior fontIds when family still used but index unavailable (peer open).
  for (const prev of params.manifest?.usedCustomFonts || []) {
    if (prev.family && prev.fontId && !byFamily.has(prev.family)) {
      byFamily.set(prev.family, prev.fontId);
    }
  }
  const used: PenUsedCustomFont[] = [];
  const seen = new Set<string>();
  for (const family of families) {
    if (!isCustomPenFont(family)) continue;
    const fontId = byFamily.get(family);
    if (!fontId) continue;
    if (seen.has(fontId)) continue;
    seen.add(fontId);
    used.push({ fontId, family });
  }
  return used;
}

/** Google Fonts CSS2 stylesheet URL for one or more families (on-demand load). */
export function googleFontsCssUrl(families: string[]): string | null {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))];
  const google = unique.filter((f) => isGooglePenFont(f));
  if (!google.length) return null;
  const q = google
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
