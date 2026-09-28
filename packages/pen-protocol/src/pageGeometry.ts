/**
 * Page sheet dimensions + layer geometry in content-box CSS pixels.
 * Layer x/y/w/h are absolute CSS px inside Body padding — independent of pageLayout.
 */

import type { PenPageLayer, PenPageLayout, PenPageSizeId, PenSectionContent } from './types.js';

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
/** Gray frame around a preview page. Flow fills the pane, so it uses none. */
export const PREVIEW_PAGE_GUTTER_PX = 28;

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

/** Fixed pages, including custom and named ratios, keep the gray frame. Open Flow does not. */
export function previewPageUsesGutter(
  layout: PenPageLayout | undefined,
  widthPx?: number | null
): boolean {
  return !((layout || 'flow') === 'flow' && isFlowWorkspaceOpen(widthPx));
}

export const MIN_PAGE_SIZE_PX = 64;
export const MAX_PAGE_SIZE_PX = 4096;

export function clampPageSizePx(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_FLOW_WORKSPACE_WIDTH_PX;
  return Math.max(MIN_PAGE_SIZE_PX, Math.min(MAX_PAGE_SIZE_PX, Math.round(px)));
}

export type PageSizeId = PenPageSizeId;

export type PageSizeChoice = {
  id: PageSizeId;
  label: string;
  layout: PenPageLayout;
  widthPx: number | null;
  heightPx: number | null;
};

/** Named sizes. Paper uses print inches at 96dpi. Ratios use a 1080px short side. */
export const PAGE_SIZE_PRESETS: PageSizeChoice[] = [
  { id: 'flow', label: 'Flow', layout: 'flow', widthPx: null, heightPx: null },
  { id: 'ratio-9-16', label: '9:16', layout: 'flow', widthPx: 1080, heightPx: 1920 },
  { id: 'ratio-16-9', label: '16:9', layout: 'flow', widthPx: 1920, heightPx: 1080 },
  { id: 'ratio-1-1', label: '1:1', layout: 'flow', widthPx: 1080, heightPx: 1080 },
  { id: 'ratio-4-5', label: '4:5', layout: 'flow', widthPx: 1080, heightPx: 1350 },
  { id: 'ratio-3-2', label: '3:2', layout: 'flow', widthPx: 1620, heightPx: 1080 },
  { id: 'ratio-4-3', label: '4:3', layout: 'flow', widthPx: 1440, heightPx: 1080 },
  { id: 'letter', label: 'Letter', layout: 'letter', widthPx: null, heightPx: null },
  { id: 'legal', label: 'Legal', layout: 'flow', widthPx: Math.round(8.5 * CSS_PX_PER_IN), heightPx: Math.round(14 * CSS_PX_PER_IN) },
  { id: 'a4', label: 'A4', layout: 'a4', widthPx: null, heightPx: null }
];

export function matchPageSize(
  layout: PenPageLayout | undefined,
  widthPx?: number | null,
  heightPx?: number | null,
  sizeId?: PageSizeId | null
): PageSizeChoice {
  if (sizeId === 'custom') {
    const width = clampPageSizePx(Number(widthPx) || DEFAULT_FLOW_WORKSPACE_WIDTH_PX);
    const height = clampPageSizePx(Number(heightPx) || DEFAULT_FLOW_WORKSPACE_HEIGHT_PX);
    return { id: 'custom', label: 'Custom', layout: 'flow', widthPx: width, heightPx: height };
  }
  if (layout === 'letter') return PAGE_SIZE_PRESETS.find((item) => item.id === 'letter')!;
  if (layout === 'a4') return PAGE_SIZE_PRESETS.find((item) => item.id === 'a4')!;
  if (isFlowWorkspaceOpen(widthPx)) return PAGE_SIZE_PRESETS.find((item) => item.id === 'flow')!;
  const width = Math.round(Number(widthPx));
  const height = Math.round(Number(heightPx));
  const preset = PAGE_SIZE_PRESETS.find(
    (item) => item.layout === 'flow' && item.widthPx === width && item.heightPx === height
  );
  if (preset) return preset;
  return {
    id: 'custom',
    label: 'Custom',
    layout: 'flow',
    widthPx: clampPageSizePx(width),
    heightPx: clampPageSizePx(Number.isFinite(height) ? height : DEFAULT_FLOW_WORKSPACE_HEIGHT_PX)
  };
}

/** One size write: layout and dimensions change together. */
export function selectPageSize(
  id: PageSizeId,
  current?: {
    layout?: PenPageLayout | null;
    widthPx?: number | null;
    heightPx?: number | null;
    sizeId?: PageSizeId | null;
  }
): PageSizeChoice {
  if (id !== 'custom') {
    return PAGE_SIZE_PRESETS.find((item) => item.id === id) || PAGE_SIZE_PRESETS[0]!;
  }
  const matched = matchPageSize(
    current?.layout || 'flow',
    current?.widthPx,
    current?.heightPx,
    current?.sizeId
  );
  if (matched.id === 'custom') return matched;
  if (matched.id === 'letter') {
    return { id: 'custom', label: 'Custom', layout: 'flow', widthPx: LETTER_WIDTH_PX, heightPx: LETTER_HEIGHT_PX };
  }
  if (matched.id === 'a4') {
    return { id: 'custom', label: 'Custom', layout: 'flow', widthPx: A4_WIDTH_PX, heightPx: A4_HEIGHT_PX };
  }
  if (matched.widthPx != null && matched.heightPx != null) {
    return { id: 'custom', label: 'Custom', layout: 'flow', widthPx: matched.widthPx, heightPx: matched.heightPx };
  }
  return {
    id: 'custom',
    label: 'Custom',
    layout: 'flow',
    widthPx: DEFAULT_FLOW_WORKSPACE_WIDTH_PX,
    heightPx: DEFAULT_FLOW_WORKSPACE_HEIGHT_PX
  };
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
    const h = flow?.heightPx == null ? null : clampPageSizePx(Number(flow.heightPx));
    return { pageWidthPx: null, pageHeightPx: h, fillWidth: true, paged: false };
  }
  const w = clampPageSizePx(Number(flow?.widthPx) || DEFAULT_FLOW_WORKSPACE_WIDTH_PX);
  const h = flow?.heightPx == null ? null : clampPageSizePx(Number(flow.heightPx));
  return { pageWidthPx: w, pageHeightPx: h, fillWidth: false, paged: false };
}

/**
 * Page box for the live preview. Letter and A4 keep their paper aspect in
 * every view. The box is scaled to fit the panel, never stretched.
 * Open flow uses the panel itself.
 */
export function fittedPreviewPagePx(
  layout: PenPageLayout | undefined,
  panelWidthPx: number,
  panelHeightPx: number,
  flow?: { widthPx?: number | null; heightPx?: number | null }
): { width: number; height: number } {
  const sheet = pageSheetDims(layout, flow);
  const panelW = Math.max(0, Math.round(panelWidthPx) || 0);
  const panelH = Math.max(0, Math.round(panelHeightPx) || 0);
  if (sheet.fillWidth) {
    const width = panelW > 0 ? panelW : DEFAULT_FLOW_WORKSPACE_WIDTH_PX;
    if (sheet.pageHeightPx == null) {
      return {
        width,
        height: panelH > 0 ? panelH : DEFAULT_FLOW_WORKSPACE_HEIGHT_PX
      };
    }
    const boundH = panelH > 0 ? panelH : sheet.pageHeightPx;
    const scale = Math.min(1, boundH / sheet.pageHeightPx);
    return { width, height: Math.max(1, Math.round(sheet.pageHeightPx * scale)) };
  }
  const natW = sheet.pageWidthPx ?? DEFAULT_FLOW_WORKSPACE_WIDTH_PX;
  const natH = sheet.pageHeightPx ?? DEFAULT_FLOW_WORKSPACE_HEIGHT_PX;
  const boundW = panelW > 0 ? panelW : natW;
  const boundH = panelH > 0 ? panelH : natH;
  const scale = Math.min(boundW / natW, boundH / natH);
  return {
    width: Math.max(1, Math.round(natW * scale)),
    height: Math.max(1, Math.round(natH * scale))
  };
}

/** Where a content-box layer sits on a screen strip (page edge is the origin). */
export function pageLayerToSheet(
  layer: { x: number; y: number },
  pageIndex: number,
  pageWidthPx: number,
  padPx: number
): { x: number; y: number } {
  return {
    x: pageIndex * pageWidthPx + padPx + layer.x,
    y: padPx + layer.y
  };
}

/** Inverse of pageLayerToSheet. Stored x/y stay in that page's content box. */
export function sheetLayerToPage(
  point: { x: number; y: number },
  pageIndex: number,
  pageWidthPx: number,
  padPx: number
): { x: number; y: number } {
  return {
    x: point.x - pageIndex * pageWidthPx - padPx,
    y: point.y - padPx
  };
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
  measuredWidthPx?: number,
  /** Used height of the sheet. Keeps letter/A4 aspect when the preview scales the page. */
  measuredHeightPx?: number
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
  const measuredH =
    measuredHeightPx != null && measuredHeightPx > 0 ? Math.round(measuredHeightPx) : undefined;
  const height =
    measuredH != null
      ? Math.max(MIN_LAYER_SIZE_PX, measuredH - 2 * paddingPx)
      : Math.max(minH, contentHeightPx);
  return { width, height };
}

/**
 * Open flow fills the preview panel. The drag box must use that panel, or
 * objects stop at the short content height while the panel continues below.
 * Content taller than the panel still wins so the sheet can scroll.
 */
export function openFlowDragHeightPx(
  contentInnerPx: number,
  panelClientHeightPx: number,
  paddingPx: number
): number {
  const panelInner = Math.max(0, Math.round(panelClientHeightPx) - 2 * paddingPx);
  return Math.max(0, contentInnerPx, panelInner);
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

export type PageMeasureUnit = 'px' | 'in' | 'cm' | 'mm';

const PX_PER_UNIT: Record<PageMeasureUnit, number> = {
  px: 1,
  in: CSS_PX_PER_IN,
  cm: CSS_PX_PER_IN / 2.54,
  mm: CSS_PX_PER_IN / 25.4
};

/** Display a stored CSS px length in the chosen unit. */
export function pxToMeasure(px: number, unit: PageMeasureUnit): number {
  const n = px / PX_PER_UNIT[unit];
  if (unit === 'px') return Math.round(n);
  if (unit === 'mm') return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

/** Store a typed measurement as CSS px. */
export function measureToPx(value: number, unit: PageMeasureUnit): number {
  return Math.round(value * PX_PER_UNIT[unit]);
}

function snapToTargets(
  origin: number,
  size: number,
  targets: number[],
  threshold: number
): { value: number; snapped: boolean } {
  let best = threshold + 1;
  let value = origin;
  for (const edge of [0, size / 2, size]) {
    for (const target of targets) {
      const delta = Math.abs(origin + edge - target);
      if (delta <= threshold && delta < best) {
        best = delta;
        value = target - edge;
      }
    }
  }
  return { value, snapped: best <= threshold };
}

/** Snap a layer to page midlines and any guide lines (px). */
export function snapLayoutToContentCenter(
  item: LayerRect,
  contentW: number,
  contentH: number,
  opts?: {
    thresholdPx?: number;
    enabled?: boolean;
    guides?: { x?: number[]; y?: number[] };
  }
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  if (opts?.enabled === false) {
    return { x: item.x, y: item.y, snappedX: false, snappedY: false };
  }
  const thr = opts?.thresholdPx ?? 12;
  const xSnap = snapToTargets(item.x, item.w, [contentW / 2, ...(opts?.guides?.x || [])], thr);
  const ySnap = snapToTargets(item.y, item.h, [contentH / 2, ...(opts?.guides?.y || [])], thr);
  return { x: xSnap.value, y: ySnap.value, snappedX: xSnap.snapped, snappedY: ySnap.snapped };
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
