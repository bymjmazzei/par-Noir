/**
 * Page sheet dimensions + layer geometry in content-box CSS pixels.
 * Layer x/y/w/h are absolute CSS px inside Body padding — independent of pageLayout.
 */

import type { PenPageLayer, PenPageLayout, PenSectionContent } from './types.js';

/** CSS px at 96dpi. */
export const CSS_PX_PER_IN = 96;
export const LETTER_WIDTH_PX = Math.round(8.5 * CSS_PX_PER_IN); // 816
export const LETTER_HEIGHT_PX = Math.round(11 * CSS_PX_PER_IN); // 1056
/** 210mm / 25.4 * 96 */
export const A4_WIDTH_PX = Math.round((210 / 25.4) * CSS_PX_PER_IN); // ~794
/** 297mm / 25.4 * 96 */
export const A4_HEIGHT_PX = Math.round((297 / 25.4) * CSS_PX_PER_IN); // ~1123

export const DEFAULT_FLOW_WORKSPACE_WIDTH_PX = 640;
export const DEFAULT_PAGE_PADDING_PX = 40;
export const MIN_LAYER_SIZE_PX = 24;
export const PAGE_GUTTER_PX = 16;

export type PageSheetDims = {
  pageWidthPx: number;
  pageHeightPx: number | null;
  /** true when Letter/A4 — show page bands / breaks */
  paged: boolean;
};

export function resolvePagePaddingPx(padding?: number | null): number {
  return Math.max(8, Math.min(72, Number(padding) || DEFAULT_PAGE_PADDING_PX));
}

export function pageSheetDims(
  layout: PenPageLayout | undefined,
  flowWorkspaceWidthPx?: number | null
): PageSheetDims {
  if (layout === 'letter') {
    return { pageWidthPx: LETTER_WIDTH_PX, pageHeightPx: LETTER_HEIGHT_PX, paged: true };
  }
  if (layout === 'a4') {
    return { pageWidthPx: A4_WIDTH_PX, pageHeightPx: A4_HEIGHT_PX, paged: true };
  }
  const w = Math.max(
    320,
    Math.min(1200, Math.round(Number(flowWorkspaceWidthPx) || DEFAULT_FLOW_WORKSPACE_WIDTH_PX))
  );
  return { pageWidthPx: w, pageHeightPx: null, paged: false };
}

/** Content box inside Body padding (layer coordinate space). */
export function contentBoxSize(
  sheet: PageSheetDims,
  paddingPx: number,
  contentHeightPx: number
): { width: number; height: number } {
  const width = Math.max(MIN_LAYER_SIZE_PX, sheet.pageWidthPx - 2 * paddingPx);
  const minH = sheet.pageHeightPx
    ? Math.max(MIN_LAYER_SIZE_PX, sheet.pageHeightPx - 2 * paddingPx)
    : Math.max(240, contentHeightPx);
  const height = Math.max(minH, contentHeightPx);
  return { width, height };
}

export type LayerRect = { x: number; y: number; w: number; h: number };

export function clampLayerRect(
  item: LayerRect,
  contentW: number,
  contentH: number
): LayerRect {
  const maxW = Math.max(MIN_LAYER_SIZE_PX, contentW);
  const maxH = Math.max(MIN_LAYER_SIZE_PX, contentH);
  const w = Math.min(maxW, Math.max(MIN_LAYER_SIZE_PX, item.w));
  const h = Math.min(maxH, Math.max(MIN_LAYER_SIZE_PX, item.h));
  const x = Math.min(Math.max(0, contentW - w), Math.max(0, item.x));
  const y = Math.min(Math.max(0, contentH - h), Math.max(0, item.y));
  return { x, y, w, h };
}

/** Snap layer center to content-box midlines (px). */
export function snapLayoutToContentCenter(
  item: LayerRect,
  contentW: number,
  contentH: number,
  opts?: { thresholdPx?: number; enabled?: boolean }
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  if (opts?.enabled === false) {
    return { x: item.x, y: item.y, snappedX: false, snappedY: false };
  }
  const thr = opts?.thresholdPx ?? 12;
  const midX = contentW / 2;
  const midY = contentH / 2;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  let x = item.x;
  let y = item.y;
  let snappedX = false;
  let snappedY = false;
  if (Math.abs(cx - midX) <= thr) {
    x = midX - item.w / 2;
    snappedX = true;
  }
  if (Math.abs(cy - midY) <= thr) {
    y = midY - item.h / 2;
    snappedY = true;
  }
  return { x, y, snappedX, snappedY };
}

/**
 * Legacy % → content-box px using Letter content box as the fixed reference
 * so size/position stay stable across pageLayout switches after migrate.
 */
export function legacyPercentToContentPx(
  pct: LayerRect,
  paddingPx: number = DEFAULT_PAGE_PADDING_PX
): LayerRect {
  const refW = LETTER_WIDTH_PX - 2 * paddingPx;
  const refH = LETTER_HEIGHT_PX - 2 * paddingPx;
  return {
    x: Math.round((Math.max(0, Math.min(100, pct.x)) / 100) * refW),
    y: Math.round((Math.max(0, Math.min(100, pct.y)) / 100) * refH),
    w: Math.round((Math.max(1, Math.min(100, pct.w)) / 100) * refW),
    h: Math.round((Math.max(1, Math.min(100, pct.h)) / 100) * refH)
  };
}

export function layerLooksLikePercentGeom(layer: PenPageLayer): boolean {
  return (
    layer.x >= 0 &&
    layer.y >= 0 &&
    layer.w > 0 &&
    layer.h > 0 &&
    layer.x <= 100 &&
    layer.y <= 100 &&
    layer.w <= 100 &&
    layer.h <= 100
  );
}

export function sectionNeedsLegacyGeomMigrate(section: PenSectionContent): boolean {
  if (section.layerGeom === 'px') return false;
  const layers = section.layers || [];
  if (!layers.length) return false;
  return layers.every(layerLooksLikePercentGeom);
}

/** One-shot: convert % layers to content-box px and mark section.layerGeom = 'px'. */
export function migrateSectionLayerGeomToPx(
  section: PenSectionContent,
  paddingPx: number = DEFAULT_PAGE_PADDING_PX
): PenSectionContent {
  if (!sectionNeedsLegacyGeomMigrate(section) && section.layerGeom === 'px') {
    return section;
  }
  if (!sectionNeedsLegacyGeomMigrate(section)) {
    // Empty or already-px-looking (values > 100): just stamp the unit.
    if ((section.layers || []).length === 0 || section.layerGeom === 'px') {
      return section.layerGeom === 'px' ? section : { ...section, layerGeom: 'px' };
    }
    return { ...section, layerGeom: 'px' };
  }
  const layers = (section.layers || []).map((l) => {
    const next = legacyPercentToContentPx(l, paddingPx);
    return { ...l, ...next };
  });
  return { ...section, layers, layerGeom: 'px' };
}

/** How many print pages to paint for a given content (outer) height. */
export function printPageCount(contentOuterHeightPx: number, pageHeightPx: number): number {
  if (pageHeightPx <= 0) return 1;
  return Math.max(1, Math.ceil(contentOuterHeightPx / pageHeightPx));
}

export function wrapSideFromGeom(
  x: number,
  w: number,
  contentW: number
): 'left' | 'right' {
  const mid = Math.max(1, contentW) / 2;
  return x + w / 2 < mid ? 'left' : 'right';
}
