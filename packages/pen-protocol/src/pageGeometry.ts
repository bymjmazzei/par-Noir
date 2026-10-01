/**
 * Page sheet dimensions + layer geometry in content-box CSS pixels.
 * Layer x/y/w/h are absolute CSS px inside Body padding — independent of pageLayout.
 */

import type {
  PenPageLayer,
  PenPageLayout,
  PenPageOrientation,
  PenPageSizeId,
  PenSectionContent
} from './types.js';

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
/** Gray workspace kept around a fixed page so a layer can sit outside the frame. */
export const EDITOR_PASTEBOARD_PX = 120;

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

/**
 * Letter, A4, and fixed ratios (9:16 and the rest) can park a layer on the
 * pasteboard. Open Flow has no frame, so its layers stay inside the panel.
 */
export function pageAllowsPasteboard(
  layout: PenPageLayout | undefined,
  widthPx?: number | null
): boolean {
  return previewPageUsesGutter(layout, widthPx);
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

type PageSizePreset = PageSizeChoice & { landscapeLabel?: string };

/** Phone CSS px. Ratio pages are authored at this size. */
export const MOBILE_SHORT_PX = 360;
/** Earlier ratio pages used a 1080px short side. */
const LEGACY_RATIO_SHORT_PX = 1080;

/**
 * Portrait dimensions. Horizontal orientation swaps them, so 9:16 becomes 16:9.
 * Ratios use a phone-width short side. Paper uses print inches at 96dpi.
 */
export const PAGE_SIZE_PRESETS: PageSizePreset[] = [
  { id: 'flow', label: 'Flow', layout: 'flow', widthPx: null, heightPx: null },
  { id: 'ratio-9-16', label: '9:16', landscapeLabel: '16:9', layout: 'flow', widthPx: MOBILE_SHORT_PX, heightPx: 640 },
  { id: 'ratio-1-1', label: '1:1', layout: 'flow', widthPx: MOBILE_SHORT_PX, heightPx: MOBILE_SHORT_PX },
  { id: 'ratio-4-5', label: '4:5', landscapeLabel: '5:4', layout: 'flow', widthPx: MOBILE_SHORT_PX, heightPx: 450 },
  { id: 'ratio-3-2', label: '2:3', landscapeLabel: '3:2', layout: 'flow', widthPx: MOBILE_SHORT_PX, heightPx: 540 },
  { id: 'ratio-4-3', label: '3:4', landscapeLabel: '4:3', layout: 'flow', widthPx: MOBILE_SHORT_PX, heightPx: 480 },
  { id: 'letter', label: 'Letter', layout: 'letter', widthPx: LETTER_WIDTH_PX, heightPx: LETTER_HEIGHT_PX },
  {
    id: 'legal',
    label: 'Legal',
    layout: 'flow',
    widthPx: Math.round(8.5 * CSS_PX_PER_IN),
    heightPx: Math.round(14 * CSS_PX_PER_IN)
  },
  { id: 'a4', label: 'A4', layout: 'a4', widthPx: A4_WIDTH_PX, heightPx: A4_HEIGHT_PX }
];

export function pageIsLandscape(orientation?: PenPageOrientation | null): boolean {
  return orientation === 'landscape';
}

function canonicalSizeId(sizeId?: string | null): PageSizeId | null {
  if (sizeId === 'ratio-16-9') return 'ratio-9-16';
  if (sizeId === 'custom') return 'custom';
  if (PAGE_SIZE_PRESETS.some((item) => item.id === sizeId)) return sizeId as PageSizeId;
  return null;
}

function presetById(id: PageSizeId): PageSizePreset | undefined {
  return PAGE_SIZE_PRESETS.find((item) => item.id === id);
}

function dimsMatchPair(
  pairW: number | null,
  pairH: number | null,
  width: number,
  height: number
): boolean {
  if (pairW == null || pairH == null) return false;
  return (pairW === width && pairH === height) || (pairW === height && pairH === width);
}

function dimsMatchPreset(preset: PageSizePreset, width: number, height: number): boolean {
  return dimsMatchPair(preset.widthPx, preset.heightPx, width, height);
}

function legacyRatioPair(preset: PageSizePreset): { widthPx: number; heightPx: number } | null {
  if (!preset.id.startsWith('ratio-') || preset.widthPx == null || preset.heightPx == null) return null;
  const scale = LEGACY_RATIO_SHORT_PX / MOBILE_SHORT_PX;
  return {
    widthPx: Math.round(preset.widthPx * scale),
    heightPx: Math.round(preset.heightPx * scale)
  };
}

function dimsMatchRatio(preset: PageSizePreset, width: number, height: number): boolean {
  if (!preset.id.startsWith('ratio-')) return false;
  if (dimsMatchPreset(preset, width, height)) return true;
  const legacy = legacyRatioPair(preset);
  return legacy != null && dimsMatchPair(legacy.widthPx, legacy.heightPx, width, height);
}

/** Current phone size for a ratio, oriented like the stored page. */
function mobileRatioDims(
  widthPx?: number | null,
  heightPx?: number | null,
  sizeId?: string | null
): { widthPx: number; heightPx: number } | null {
  if (sizeId === 'custom') return null;
  const w = Math.round(Number(widthPx));
  const h = Math.round(Number(heightPx));
  const id = canonicalSizeId(sizeId);
  const named = id && id.startsWith('ratio-') ? presetById(id) : undefined;
  const matched =
    named || PAGE_SIZE_PRESETS.find((item) => dimsMatchRatio(item, w, h));
  if (!matched || matched.widthPx == null || matched.heightPx == null) return null;
  if (matched.widthPx === matched.heightPx) {
    return { widthPx: matched.widthPx, heightPx: matched.heightPx };
  }
  const landscape = Number.isFinite(w) && Number.isFinite(h) && w > h;
  return landscape
    ? { widthPx: matched.heightPx, heightPx: matched.widthPx }
    : { widthPx: matched.widthPx, heightPx: matched.heightPx };
}

function labelForOrient(preset: PageSizePreset, landscape: boolean): string {
  return landscape && preset.landscapeLabel ? preset.landscapeLabel : preset.label;
}

function choiceFromPreset(preset: PageSizePreset, width?: number | null, height?: number | null): PageSizeChoice {
  const roundedW = Math.round(Number(width));
  const roundedH = Math.round(Number(height));
  const mobile = preset.id.startsWith('ratio-')
    ? mobileRatioDims(roundedW, roundedH, preset.id)
    : null;
  const known = dimsMatchPreset(preset, roundedW, roundedH);
  const widthPx = mobile ? mobile.widthPx : known ? roundedW : preset.widthPx;
  const heightPx = mobile ? mobile.heightPx : known ? roundedH : preset.heightPx;
  const landscape = widthPx != null && heightPx != null && widthPx > heightPx;
  return {
    id: preset.id,
    label: labelForOrient(preset, landscape),
    layout: preset.layout,
    widthPx,
    heightPx
  };
}

/** Apply portrait or landscape on top of a ratio. Landscape swaps the axes. */
export function orientPageSize(
  choice: PageSizeChoice,
  orientation?: PenPageOrientation | null
): PageSizeChoice {
  const landscape = pageIsLandscape(orientation);
  if (choice.id === 'custom') {
    if (choice.widthPx == null || choice.heightPx == null || choice.widthPx === choice.heightPx) return choice;
    const isLandscape = choice.widthPx > choice.heightPx;
    if (landscape === isLandscape) return choice;
    return { ...choice, widthPx: choice.heightPx, heightPx: choice.widthPx };
  }
  const preset = presetById(choice.id);
  if (!preset || preset.widthPx == null || preset.heightPx == null) return choice;
  if (!landscape || preset.widthPx === preset.heightPx) return choiceFromPreset(preset, preset.widthPx, preset.heightPx);
  return choiceFromPreset(preset, preset.heightPx, preset.widthPx);
}

export function matchPageSize(
  layout: PenPageLayout | undefined,
  widthPx?: number | null,
  heightPx?: number | null,
  sizeId?: string | null
): PageSizeChoice {
  const id = canonicalSizeId(sizeId);
  if (id === 'custom') {
    const width = clampPageSizePx(Number(widthPx) || DEFAULT_FLOW_WORKSPACE_WIDTH_PX);
    const height = clampPageSizePx(Number(heightPx) || DEFAULT_FLOW_WORKSPACE_HEIGHT_PX);
    return { id: 'custom', label: 'Custom', layout: 'flow', widthPx: width, heightPx: height };
  }
  const width = Math.round(Number(widthPx));
  const height = Math.round(Number(heightPx));
  const named = id ? presetById(id) : undefined;
  if (named && named.widthPx != null && dimsMatchPreset(named, width, height)) {
    return choiceFromPreset(named, width, height);
  }
  if (layout === 'letter') return choiceFromPreset(presetById('letter')!, widthPx, heightPx);
  if (layout === 'a4') return choiceFromPreset(presetById('a4')!, widthPx, heightPx);
  if (isFlowWorkspaceOpen(widthPx)) return choiceFromPreset(presetById('flow')!);
  const preset = PAGE_SIZE_PRESETS.find((item) =>
    item.id.startsWith('ratio-') ? dimsMatchRatio(item, width, height) : dimsMatchPreset(item, width, height)
  );
  if (preset) return choiceFromPreset(preset, width, height);
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
    sizeId?: string | null;
  },
  orientation?: PenPageOrientation | null
): PageSizeChoice {
  if (id !== 'custom') {
    const preset = presetById(id) || PAGE_SIZE_PRESETS[0]!;
    return orientPageSize(choiceFromPreset(preset), orientation);
  }
  const matched = matchPageSize(
    current?.layout || 'flow',
    current?.widthPx,
    current?.heightPx,
    current?.sizeId
  );
  const base: PageSizeChoice =
    matched.widthPx != null && matched.heightPx != null
      ? { id: 'custom', label: 'Custom', layout: 'flow', widthPx: matched.widthPx, heightPx: matched.heightPx }
      : {
          id: 'custom',
          label: 'Custom',
          layout: 'flow',
          widthPx: DEFAULT_FLOW_WORKSPACE_WIDTH_PX,
          heightPx: DEFAULT_FLOW_WORKSPACE_HEIGHT_PX
        };
  return orientPageSize(base, orientation);
}

export function pageSheetDims(
  layout: PenPageLayout | undefined,
  flow?: { widthPx?: number | null; heightPx?: number | null; sizeId?: string | null }
): PageSheetDims {
  if (layout === 'letter' || layout === 'a4') {
    const preset = presetById(layout)!;
    const width = Math.round(Number(flow?.widthPx));
    const height = Math.round(Number(flow?.heightPx));
    if (dimsMatchPreset(preset, width, height)) {
      return { pageWidthPx: width, pageHeightPx: height, fillWidth: false, paged: true };
    }
    return {
      pageWidthPx: preset.widthPx,
      pageHeightPx: preset.heightPx,
      fillWidth: false,
      paged: true
    };
  }
  const mobile = mobileRatioDims(flow?.widthPx, flow?.heightPx, flow?.sizeId);
  if (mobile) {
    return {
      pageWidthPx: mobile.widthPx,
      pageHeightPx: mobile.heightPx,
      fillWidth: false,
      paged: false
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
  const capped =
    measured != null && nominalOuter != null
      ? Math.min(nominalOuter, measured)
      : (nominalOuter ?? measured ?? DEFAULT_FLOW_WORKSPACE_WIDTH_PX);
  const outerW = measured != null ? capped : Math.max(320, capped);
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

/** Minimum size only. A non-flow layer may sit past the page. */
export function loosenLayerRect(item: LayerRect): LayerRect {
  return {
    ...item,
    w: Math.max(MIN_LAYER_SIZE_PX, item.w),
    h: Math.max(MIN_LAYER_SIZE_PX, item.h)
  };
}

/** Gray workspace around a page, wide enough to show layers that hang off it. */
export function pasteboardGutterPx(
  rects: Array<Pick<LayerRect, 'x' | 'y' | 'w' | 'h'>>,
  pageW: number,
  pageH: number,
  min = 48
): number {
  let over = 0;
  for (const rect of rects) {
    over = Math.max(over, -rect.x, -rect.y, rect.x + rect.w - pageW, rect.y + rect.h - pageH, 0);
  }
  return Math.max(min, Math.ceil(over));
}

export type PasteboardExtents = { left: number; right: number; top: number; bottom: number };

/** How far rects hang past each edge of a page or strip. Inside rects add nothing. */
export function pasteboardExtents(
  rects: Array<Pick<LayerRect, 'x' | 'y' | 'w' | 'h'>>,
  boundsW: number,
  boundsH: number
): PasteboardExtents {
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (const rect of rects) {
    if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) continue;
    left = Math.max(left, -rect.x);
    top = Math.max(top, -rect.y);
    right = Math.max(right, rect.x + rect.w - boundsW);
    bottom = Math.max(bottom, rect.y + rect.h - boundsH);
  }
  const ceil = (n: number) => Math.max(0, Math.ceil(n));
  return { left: ceil(left), right: ceil(right), top: ceil(top), bottom: ceil(bottom) };
}

/** Custom pages are a physical size. Pixels are not a measurement. */
export const PAGE_MEASURE_UNITS = ['in', 'cm', 'mm'] as const;

export type PageMeasureUnit = (typeof PAGE_MEASURE_UNITS)[number];

const PX_PER_UNIT: Record<PageMeasureUnit, number> = {
  in: CSS_PX_PER_IN,
  cm: CSS_PX_PER_IN / 2.54,
  mm: CSS_PX_PER_IN / 25.4
};

/** Display a stored CSS px length in the chosen unit. */
export function pxToMeasure(px: number, unit: PageMeasureUnit): number {
  const n = px / PX_PER_UNIT[unit];
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
