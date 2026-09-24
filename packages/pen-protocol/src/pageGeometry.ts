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
export const DEFAULT_FLOW_WORKSPACE_HEIGHT_PX = 720;
export const DEFAULT_PAGE_PADDING_PX = 40;
export const MIN_LAYER_SIZE_PX = 24;

/** Below this short-side, Attach treats the prior frame as a stub and grows to a usable media size. */
export const MEDIA_ATTACH_MIN_SIDE_PX = 120;

/** Default video frame aspect (width / height). */
export const DEFAULT_VIDEO_ASPECT = 16 / 9;
/** Fallback image aspect when natural size is unknown. */
export const DEFAULT_IMAGE_ASPECT = 1;

export const PAGE_GUTTER_PX = 16;

export type PageSheetDims = {
  /** Fixed column width, or null when Flow fills the container. */
  pageWidthPx: number | null;
  /** Print page height, or Flow min-height when set; null = content-driven. */
  pageHeightPx: number | null;
  /** Flow open width — sheet is 100% of parent. */
  fillWidth: boolean;
  /** true when Letter/A4 — show page bands / breaks */
  paged: boolean;
};

export function resolvePagePaddingPx(padding?: number | null): number {
  return Math.max(8, Math.min(72, Number(padding) || DEFAULT_PAGE_PADDING_PX));
}

export function isFlowWorkspaceOpen(widthPx?: number | null): boolean {
  return widthPx == null;
}

export function pageSheetDims(
  layout: PenPageLayout | undefined,
  flow?: { widthPx?: number | null; heightPx?: number | null }
): PageSheetDims {
  if (layout === 'letter') {
    return {
      pageWidthPx: LETTER_WIDTH_PX,
      pageHeightPx: LETTER_HEIGHT_PX,
      fillWidth: false,
      paged: true
    };
  }
  if (layout === 'a4') {
    return {
      pageWidthPx: A4_WIDTH_PX,
      pageHeightPx: A4_HEIGHT_PX,
      fillWidth: false,
      paged: true
    };
  }
  const open = isFlowWorkspaceOpen(flow?.widthPx);
  if (open) {
    const h =
      flow?.heightPx == null
        ? null
        : Math.max(240, Math.min(4000, Math.round(Number(flow.heightPx))));
    return { pageWidthPx: null, pageHeightPx: h, fillWidth: true, paged: false };
  }
  const w = Math.max(
    320,
    Math.min(1600, Math.round(Number(flow?.widthPx) || DEFAULT_FLOW_WORKSPACE_WIDTH_PX))
  );
  const h =
    flow?.heightPx == null
      ? null
      : Math.max(240, Math.min(4000, Math.round(Number(flow.heightPx))));
  return { pageWidthPx: w, pageHeightPx: h, fillWidth: false, paged: false };
}

/** Content box inside Body padding (layer coordinate space). */
export function contentBoxSize(
  sheet: PageSheetDims,
  paddingPx: number,
  contentHeightPx: number,
  /**
   * Used width of the sheet element (clientWidth). Required for open Flow;
   * also required for Letter/A4 when CSS `max-width:100%` shrinks the page
   * below the nominal print width — float insets must match the used box.
   */
  measuredWidthPx?: number
): { width: number; height: number } {
  const nominalOuter = sheet.pageWidthPx;
  const measured =
    measuredWidthPx != null && measuredWidthPx > 0
      ? Math.round(measuredWidthPx)
      : undefined;
  const outerW = Math.max(
    320,
    measured != null && nominalOuter != null
      ? Math.min(nominalOuter, measured)
      : (nominalOuter ?? measured ?? DEFAULT_FLOW_WORKSPACE_WIDTH_PX)
  );
  const width = Math.max(MIN_LAYER_SIZE_PX, outerW - 2 * paddingPx);
  const minH = sheet.paged && sheet.pageHeightPx
    ? Math.max(MIN_LAYER_SIZE_PX, sheet.pageHeightPx - 2 * paddingPx)
    : sheet.pageHeightPx
      ? Math.max(MIN_LAYER_SIZE_PX, sheet.pageHeightPx - 2 * paddingPx)
      : Math.max(240, contentHeightPx);
  const height = Math.max(minH, contentHeightPx);
  return { width, height };
}

export type LayerRect = { x: number; y: number; w: number; h: number };

/**
 * Fit a rectangle of the given aspect (width/height) inside maxW×maxH (contain).
 * Never returns below MIN_LAYER_SIZE_PX on either side when the box allows it.
 */
export function fitAspectInBox(
  aspect: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const boxW = Math.max(MIN_LAYER_SIZE_PX, maxW);
  const boxH = Math.max(MIN_LAYER_SIZE_PX, maxH);
  const hFromW = boxW / a;
  if (hFromW <= boxH + 1e-6) {
    return { w: boxW, h: Math.max(MIN_LAYER_SIZE_PX, hFromW) };
  }
  return { w: Math.max(MIN_LAYER_SIZE_PX, boxH * a), h: boxH };
}

/**
 * Place media inside an object-layer container with locked aspect, then keep it
 * on the template page. Centers within the prior container when it shrinks.
 */
export function fitMediaLayerIntoContainer(
  container: LayerRect,
  aspect: number,
  pageW: number,
  pageH: number
): LayerRect {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  let { w, h } = fitAspectInBox(a, container.w, container.h);
  // Also fit to the full page (scale down if the container itself is oversized).
  const pageFit = fitAspectInBox(a, pageW, pageH);
  if (w > pageFit.w || h > pageFit.h) {
    w = pageFit.w;
    h = pageFit.h;
  }
  const x = container.x + (container.w - w) / 2;
  const y = container.y + (container.h - h) / 2;
  return clampLayerRect({ x, y, w, h }, pageW, pageH);
}

/**
 * Size a media frame on Attach / natural-aspect reshape.
 * Tiny text stubs (Layers +) must grow to a usable size — never stay ~line-height.
 */
export function sizeMediaLayerForAttach(
  container: LayerRect,
  aspect: number,
  pageW: number,
  pageH: number
): LayerRect {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const shortSide = Math.min(container.w, container.h);
  if (shortSide >= MEDIA_ATTACH_MIN_SIDE_PX) {
    return fitMediaLayerIntoContainer(container, a, pageW, pageH);
  }
  // Preferred box on the page (~half content), then contain aspect inside it.
  const preferW = Math.min(pageW * 0.5, a >= 1 ? 280 : 200);
  const preferH = Math.min(pageH * 0.5, a >= 1 ? 200 : 360);
  const { w, h } = fitAspectInBox(a, preferW, preferH);
  const cx = container.x + container.w / 2;
  const cy = container.y + container.h / 2;
  return clampLayerRect(
    { x: cx - w / 2, y: cy - h / 2, w, h },
    pageW,
    pageH
  );
}

/**
 * SE-corner resize that keeps aspect = orig.w / orig.h.
 * Uses the dominant drag axis so proportions stay locked while resizing.
 */
export function resizeSeKeepAspect(
  orig: LayerRect,
  dx: number,
  dy: number
): { w: number; h: number } {
  const scaleW = (orig.w + dx) / Math.max(1, orig.w);
  const scaleH = (orig.h + dy) / Math.max(1, orig.h);
  const scale = Math.abs(dx) >= Math.abs(dy) ? scaleW : scaleH;
  const minScale = MIN_LAYER_SIZE_PX / Math.max(orig.w, orig.h, 1);
  const s = Math.max(minScale, scale);
  return {
    w: Math.max(MIN_LAYER_SIZE_PX, orig.w * s),
    h: Math.max(MIN_LAYER_SIZE_PX, orig.h * s)
  };
}

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

/**
 * Pick the CSS float side so body text uses the wider gutter.
 * Float toward the tighter edge (object hugs that side); prose fills the larger gap.
 * Equivalent to comparing the object center to the content midline — callers must
 * pass the *used* content width (see contentBoxSize + measured sheet width).
 */
export function wrapSideFromGeom(
  x: number,
  w: number,
  contentW: number
): 'left' | 'right' {
  const cw = Math.max(1, contentW);
  const leftGap = Math.max(0, x);
  const rightGap = Math.max(0, cw - x - Math.max(0, w));
  return leftGap <= rightGap ? 'left' : 'right';
}
