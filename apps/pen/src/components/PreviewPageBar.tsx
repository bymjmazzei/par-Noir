/** Pagination toolbar for the live preview: orientation, page field, page list. */

import {
  Children,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode
} from 'react';
import {
  SCREEN_PAGE_WIDTH_PX,
  screenStripWidthPx,
  type PenPagePresentation,
  type PenPageOrientation,
  type PenPageView,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { pageFrameStyle } from './LayerObjectToolbar';

const THUMB_W = 280;

/** Space between pages in a horizontal strip. Matches the strip layout math. */
export const PREVIEW_STRIP_GAP_PX = 12;

function PageCut({ axis }: { axis: 'x' | 'y' }) {
  const vertical = axis === 'y';
  return (
    <div
      data-page-seam={vertical ? undefined : ''}
      data-page-break={vertical ? '' : undefined}
      aria-hidden
      className={`pointer-events-none absolute z-30 ${
        vertical ? 'bottom-0 left-0 right-0' : 'bottom-0 right-0 top-0'
      }`}
      style={
        vertical
          ? {
              height: 2,
              backgroundImage:
                'repeating-linear-gradient(to right, rgba(255,255,255,0.95) 0 2px, transparent 2px 7px), repeating-linear-gradient(to right, rgba(0,0,0,0.72) 0 2px, transparent 2px 7px)',
              backgroundSize: '7px 1px, 7px 1px',
              backgroundPosition: '0 0, 0 1px',
              backgroundRepeat: 'repeat-x'
            }
          : {
              width: 2,
              backgroundImage:
                'repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0 2px, transparent 2px 7px), repeating-linear-gradient(to bottom, rgba(0,0,0,0.72) 0 2px, transparent 2px 7px)',
              backgroundSize: '1px 7px, 1px 7px',
              backgroundPosition: '0 0, 1px 0',
              backgroundRepeat: 'repeat-y'
            }
      }
    />
  );
}

export function PreviewPageStrip({
  pageView,
  pageCount,
  pageWidthPx = SCREEN_PAGE_WIDTH_PX,
  pageHeightPx,
  background,
  pageBreak = false,
  children
}: {
  pageView: PenPageView;
  pageCount: number;
  pageWidthPx?: number;
  pageHeightPx?: number;
  /** Painted once across a screen strip. */
  background?: CSSProperties;
  /** Flow pages have no gutter, so vertical stacks draw a cut between them. */
  pageBreak?: boolean;
  children: ReactNode;
}) {
  const screen = pageView === 'screen';
  const width = screen ? screenStripWidthPx(pageCount, pageWidthPx) : undefined;
  const items = Children.toArray(children);
  return (
    <div
      data-page-view={pageView}
      data-screen-background={screen ? 'strip' : undefined}
      className={
        pageView === 'vertical'
          ? 'flex w-max shrink-0 flex-col items-center'
          : pageView === 'horizontal'
            ? 'mx-auto flex w-max shrink-0 flex-row items-center justify-center'
            : 'flex w-max shrink-0 flex-row items-stretch justify-center'
      }
      style={
        screen
          ? {
              width,
              ...(pageHeightPx ? { height: pageHeightPx } : {}),
              ...(background || {})
            }
          : pageView === 'horizontal' || pageView === 'vertical'
            ? { gap: PREVIEW_STRIP_GAP_PX }
            : undefined
      }
    >
      {screen
        ? items.map((child, index) => (
            <div
              key={index}
              className="relative shrink-0"
              style={{
                width: pageWidthPx,
                ...(pageHeightPx ? { height: pageHeightPx } : {})
              }}
            >
              {child}
              {index < items.length - 1 ? <PageCut axis="x" /> : null}
            </div>
          ))
        : pageBreak
          ? items.map((child, index) => (
              <div key={index} className="relative shrink-0">
                {child}
                {index < items.length - 1 ? <PageCut axis="y" /> : null}
              </div>
            ))
          : children}
    </div>
  );
}

export function pageTileAxis(pageView: PenPageView): 'vertical' | 'horizontal' {
  return pageView === 'vertical' ? 'vertical' : 'horizontal';
}

/** Uniform scale from a held page size into the pane. The page's layout size does not change. */
export function previewFitScale(
  designW: number,
  designH: number,
  slotW: number,
  slotH: number
): number {
  if (!(designW > 0) || !(designH > 0) || !(slotW > 0) || !(slotH > 0)) return 1;
  return Math.min(slotW / designW, slotH / designH);
}

export const PREVIEW_ZOOM_MIN = 0.25;
export const PREVIEW_ZOOM_MAX = 4;

export function clampPreviewZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const stepped = Math.round(value * 100) / 100;
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, stepped));
}

export type PreviewStripLayout = {
  docW: number;
  docH: number;
  /** Center of the page that stays in the middle of the view, in strip pixels. */
  focusX: number;
  focusY: number;
  /** Scale from page pixels into this strip (screen view-all fit). */
  extentScale: number;
  /** Distance from each end of the strip to that end page's center. */
  edgeX: number;
  edgeY: number;
  origin: (index: number) => { x: number; y: number };
};

/** Unscaled strip box. The focused page is the active page, or the whole spread in view-all. */
export function previewStripLayout(input: {
  pageView: PenPageView;
  pageCount: number;
  pageW: number;
  pageH: number;
  activeIndex: number;
  screenAllPages: boolean;
  screenFit: number;
}): PreviewStripLayout {
  const pageW = Math.max(0, input.pageW);
  const pageH = Math.max(0, input.pageH);
  const count = Math.max(1, Math.round(input.pageCount) || 1);
  const index = Math.min(count - 1, Math.max(0, Math.round(input.activeIndex) || 0));
  if (input.pageView === 'vertical') {
    const step = pageH + PREVIEW_STRIP_GAP_PX;
    return {
      docW: pageW,
      docH: pageH * count + PREVIEW_STRIP_GAP_PX * Math.max(0, count - 1),
      focusX: pageW / 2,
      focusY: index * step + pageH / 2,
      extentScale: 1,
      edgeX: pageW / 2,
      edgeY: pageH / 2,
      origin: (i) => ({ x: 0, y: i * step })
    };
  }
  if (input.pageView === 'horizontal') {
    const step = pageW + PREVIEW_STRIP_GAP_PX;
    return {
      docW: pageW * count + PREVIEW_STRIP_GAP_PX * Math.max(0, count - 1),
      docH: pageH,
      focusX: index * step + pageW / 2,
      focusY: pageH / 2,
      extentScale: 1,
      edgeX: pageW / 2,
      edgeY: pageH / 2,
      origin: (i) => ({ x: i * step, y: 0 })
    };
  }
  const fit =
    input.screenAllPages && Number.isFinite(input.screenFit) && input.screenFit > 0
      ? input.screenFit
      : 1;
  const docW = pageW * count * fit;
  const docH = pageH * fit;
  return {
    docW,
    docH,
    focusX: input.screenAllPages ? docW / 2 : index * pageW * fit + (pageW * fit) / 2,
    focusY: docH / 2,
    extentScale: fit,
    edgeX: (pageW * fit) / 2,
    edgeY: (pageH * fit) / 2,
    origin: (i) => ({ x: i * pageW * fit, y: 0 })
  };
}

/** A page-local guide position, in workspace-frame pixels. */
export function workspaceGuideFrame(along: number, lead: number, zoom: number): number {
  const z = zoom > 0 ? zoom : 1;
  return lead + along * z;
}

/** Inverse of workspaceGuideFrame. */
export function workspaceGuideAlong(frame: number, lead: number, zoom: number): number {
  const z = zoom > 0 ? zoom : 1;
  return (frame - lead) / z;
}

export type PreviewWorkspace = {
  zoom: number;
  docW: number;
  docH: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  overLeft: number;
  overRight: number;
  overTop: number;
  overBottom: number;
  contentW: number;
  contentH: number;
  scrollLeft: number;
  scrollTop: number;
};

type WorkspaceAxis = {
  padBefore: number;
  padAfter: number;
  overBefore: number;
  overAfter: number;
  content: number;
  scroll: number;
};

/** End pads match, so the last page has the same margin as the first. Overhang grows only the side a layer occupies. */
function workspaceAxis(
  strip: number,
  focusCenter: number,
  edge: number,
  overBefore: number,
  overAfter: number,
  view: number
): WorkspaceAxis {
  const size = Math.max(0, Math.round(strip));
  const focus = Math.min(size, Math.max(0, focusCenter));
  const end = Math.min(size / 2, Math.max(0, edge));
  const before = Math.max(0, Math.ceil(overBefore));
  const after = Math.max(0, Math.ceil(overAfter));
  const viewPx = Math.max(0, Math.round(view));
  let padBefore = Math.max(0, Math.round(viewPx / 2 - (before + end)));
  let padAfter = Math.max(0, Math.round(viewPx / 2 - (after + end)));
  let content = padBefore + before + size + after + padAfter;
  const slack = content - viewPx;
  if (viewPx > 0 && slack > 0 && slack <= 1) {
    if (padAfter >= slack) padAfter -= slack;
    else if (padBefore >= slack) padBefore -= slack;
    content = padBefore + before + size + after + padAfter;
  }
  const maxScroll = Math.max(0, content - viewPx);
  const scroll = Math.min(maxScroll, Math.max(0, Math.round(padBefore + before + focus - viewPx / 2)));
  return { padBefore, padAfter, overBefore: before, overAfter: after, content, scroll };
}

/**
 * Scrollable workspace is the zoomed strip plus layers past its edges.
 * Scroll rests on the document center, not the center of that workspace.
 */
export function previewWorkspaceLayout(input: {
  docW: number;
  docH: number;
  focusX: number;
  focusY: number;
  /** Inset from each strip end to that end page's center. Defaults to the focus inset. */
  edgeX?: number;
  edgeY?: number;
  extents: { left: number; right: number; top: number; bottom: number };
  zoom: number;
  /** Pane fit. Applied after the user zoom so a small pane does not reflow the page. */
  fit?: number;
  viewW: number;
  viewH: number;
}): PreviewWorkspace {
  const fit = input.fit != null && input.fit > 0 ? input.fit : 1;
  const zoom = clampPreviewZoom(input.zoom) * fit;
  const docW = Math.max(0, input.docW) * zoom;
  const docH = Math.max(0, input.docH) * zoom;
  const edgeX = (input.edgeX ?? Math.min(input.focusX, Math.max(0, input.docW - input.focusX))) * zoom;
  const edgeY = (input.edgeY ?? Math.min(input.focusY, Math.max(0, input.docH - input.focusY))) * zoom;
  const x = workspaceAxis(
    docW,
    input.focusX * zoom,
    edgeX,
    input.extents.left * zoom,
    input.extents.right * zoom,
    input.viewW
  );
  const y = workspaceAxis(
    docH,
    input.focusY * zoom,
    edgeY,
    input.extents.top * zoom,
    input.extents.bottom * zoom,
    input.viewH
  );
  return {
    zoom,
    docW: Math.round(docW),
    docH: Math.round(docH),
    padLeft: x.padBefore,
    padRight: x.padAfter,
    padTop: y.padBefore,
    padBottom: y.padAfter,
    overLeft: x.overBefore,
    overRight: x.overAfter,
    overTop: y.overBefore,
    overBottom: y.overAfter,
    contentW: x.content,
    contentH: y.content,
    scrollLeft: x.scroll,
    scrollTop: y.scroll
  };
}

export type GuideSpan = { left: number; right: number; top: number; bottom: number };

/** How far a guide on one page must run to cross the whole workspace. */
export function workspaceGuideSpan(input: {
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  overLeft: number;
  overRight: number;
  overTop: number;
  overBottom: number;
  zoom: number;
  originX: number;
  originY: number;
  pageW: number;
  pageH: number;
  docW: number;
  docH: number;
  spaceScale?: number;
}): GuideSpan {
  const zoom = input.zoom > 0 ? input.zoom : 1;
  const space = input.spaceScale && input.spaceScale > 0 ? input.spaceScale : 1;
  const unit = zoom * space;
  return {
    left: (input.padLeft + input.overLeft) / unit + input.originX,
    top: (input.padTop + input.overTop) / unit + input.originY,
    right: (input.padRight + input.overRight) / unit + Math.max(0, input.docW - input.originX - input.pageW),
    bottom: (input.padBottom + input.overBottom) / unit + Math.max(0, input.docH - input.originY - input.pageH)
  };
}

export function PreviewZoomControl({
  zoom,
  onZoom
}: {
  zoom: number;
  onZoom: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={rootRef} data-preview-zoom className="absolute bottom-3 right-3 z-40">
      {open ? (
        <div className="absolute bottom-full right-0 mb-1 flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1.5 shadow-lg">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            className="inline-flex h-6 w-6 items-center justify-center text-stone-600"
            onClick={() => onZoom(clampPreviewZoom(zoom - 0.1))}
          >
            −
          </button>
          <input
            aria-label="Zoom preview"
            title="Zoom preview"
            type="range"
            min={PREVIEW_ZOOM_MIN}
            max={PREVIEW_ZOOM_MAX}
            step={0.05}
            value={zoom}
            onChange={(event) => onZoom(clampPreviewZoom(Number(event.target.value)))}
            className="h-1 w-24 cursor-pointer appearance-none bg-stone-300 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-stone-500"
          />
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            className="inline-flex h-6 w-6 items-center justify-center text-stone-600"
            onClick={() => onZoom(clampPreviewZoom(zoom + 0.1))}
          >
            +
          </button>
          <span className="w-10 text-right text-[11px] tabular-nums text-stone-600">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Workspace zoom"
        aria-expanded={open}
        title="Zoom"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 shadow-sm"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </div>
  );
}

function PageHoverPreview({
  section,
  presentation,
  width = THUMB_W,
  flush = false
}: {
  section: PenSectionContent;
  presentation: PenPagePresentation;
  width?: number;
  /** Screen tiles share one strip, so each page has no own border. */
  flush?: boolean;
}) {
  const contentW = 640;
  const scale = width / contentW;
  const layers = (section.layers || []).filter(
    (layer) => layer.visible !== false && !layer.bodyWrap && layer.kind !== 'guide'
  );
  const maxY = layers.reduce((max, layer) => Math.max(max, layer.y + layer.h), 180);
  const height =
    width < 200
      ? Math.round(width * 1.29)
      : Math.min(360, Math.max(160, Math.round((maxY + 48) * scale)));
  return (
    <div
      className={`pointer-events-none relative overflow-hidden ${
        flush ? '' : `border border-stone-300 ${width < 200 ? '' : 'shadow-lg'}`
      }`}
      style={{ width, height, ...pageFrameStyle(presentation) }}
    >
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="absolute overflow-hidden text-[10px] leading-tight"
          style={{
            left: Math.round(layer.x * scale),
            top: Math.round(layer.y * scale),
            width: Math.max(8, Math.round(layer.w * scale)),
            height: Math.max(8, Math.round(layer.h * scale)),
            background: layer.backgroundColor || 'rgba(15,118,110,0.85)',
            color: layer.textColor || '#ffffff'
          }}
        >
          {layer.label || layer.name}
        </div>
      ))}
    </div>
  );
}

function OrientationIcon({ orientation }: { orientation: PenPageOrientation }) {
  if (orientation === 'landscape') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="4.5" width="13" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ScrollIcon({ view }: { view: PenPageView }) {
  if (view === 'horizontal') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="4.5" width="5" height="7" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9.5" y="4.5" width="5" height="7" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (view === 'screen') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="5.5" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="2.5" width="5.5" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="4.5" y="1.5" width="7" height="5" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.5" y="9.5" width="7" height="5" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const ORIENTATIONS: Array<{ id: PenPageOrientation; label: string }> = [
  { id: 'portrait', label: 'Portrait' },
  { id: 'landscape', label: 'Landscape' }
];

const SCROLLS: Array<{ id: PenPageView; label: string }> = [
  { id: 'vertical', label: 'Scroll vertically' },
  { id: 'horizontal', label: 'Scroll horizontally' },
  { id: 'screen', label: 'Screen' }
];

/** Screen is one published frame, so the rail sits on the right edge of the strip. */
export function engagementGuideOnPage(
  enabled: boolean,
  pageView: PenPageView,
  index: number,
  pageCount: number
): boolean {
  if (!enabled) return false;
  if (pageView === 'screen') return pageCount > 0 && index === pageCount - 1;
  return true;
}

export function OrientationChoices({
  pageOrientation,
  pageView,
  viewLocked = false,
  engagementGuide = false,
  onPageOrientation,
  onPageView,
  onToggleViewLock,
  onToggleEngagementGuide
}: {
  pageOrientation: PenPageOrientation;
  pageView: PenPageView;
  viewLocked?: boolean;
  engagementGuide?: boolean;
  onPageOrientation: (orientation: PenPageOrientation) => void;
  onPageView: (view: PenPageView) => void;
  onToggleViewLock: () => void;
  onToggleEngagementGuide?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1" role="group" aria-label="Orientation">
        {ORIENTATIONS.map((orientation) => (
          <button
            key={orientation.id}
            type="button"
            aria-label={orientation.label}
            title={orientation.label}
            aria-pressed={pageOrientation === orientation.id}
            disabled={viewLocked}
            className={`flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40 ${
              pageOrientation === orientation.id ? 'bg-stone-800 text-white' : 'text-stone-700 hover:bg-stone-100'
            }`}
            onClick={() => {
              if (viewLocked) return;
              onPageOrientation(orientation.id);
            }}
          >
            <OrientationIcon orientation={orientation.id} />
          </button>
        ))}
      </div>
      <div className="flex items-end gap-1">
        <div className="flex items-center gap-1" role="group" aria-label="Scroll">
          {SCROLLS.map((view) => (
            <button
              key={view.id}
              type="button"
              aria-label={view.label}
              title={view.label}
              aria-pressed={pageView === view.id}
              disabled={viewLocked}
              className={`flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40 ${
                pageView === view.id ? 'bg-stone-800 text-white' : 'text-stone-700 hover:bg-stone-100'
              }`}
              onClick={() => {
                if (viewLocked) return;
                onPageView(view.id);
              }}
            >
              <ScrollIcon view={view.id} />
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-label="Overlay engagement bar"
            title="Overlay the social engagement bar"
            aria-pressed={engagementGuide}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              engagementGuide ? 'bg-stone-800 text-white' : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
            onClick={onToggleEngagementGuide}
          >
            Engagement
          </button>
          <button
            type="button"
            aria-label={viewLocked ? 'Unlock view' : 'Lock view'}
            title={viewLocked ? 'Unlock view' : 'Lock view'}
            aria-pressed={viewLocked}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              viewLocked ? 'bg-stone-800 text-white' : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
            onClick={onToggleViewLock}
          >
            {viewLocked ? 'Locked' : 'Lock'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PreviewOrientationMenu({
  pageOrientation,
  pageView,
  viewLocked = false,
  engagementGuide = false,
  onPageOrientation,
  onPageView,
  onToggleViewLock,
  onToggleEngagementGuide
}: {
  pageOrientation: PenPageOrientation;
  pageView: PenPageView;
  viewLocked?: boolean;
  engagementGuide?: boolean;
  onPageOrientation: (orientation: PenPageOrientation) => void;
  onPageView: (view: PenPageView) => void;
  onToggleViewLock: () => void;
  onToggleEngagementGuide?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = pageOrientation === 'landscape' ? 'Landscape' : 'Portrait';
  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        data-page-orientation={pageOrientation}
        data-page-view={pageView}
        className="flex h-6 w-6 items-center justify-center rounded text-neutral-700 hover:text-black"
        onClick={() => setOpen((current) => !current)}
      >
        <OrientationIcon orientation={pageOrientation} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded border border-stone-300 bg-white p-1 shadow-lg">
          <OrientationChoices
            pageOrientation={pageOrientation}
            pageView={pageView}
            viewLocked={viewLocked}
            engagementGuide={engagementGuide}
            onPageOrientation={onPageOrientation}
            onPageView={onPageView}
            onToggleViewLock={onToggleViewLock}
            onToggleEngagementGuide={onToggleEngagementGuide}
          />
        </div>
      )}
    </div>
  );
}

export function PageFinderTiles({
  pageView,
  pages,
  activeSlug,
  presentation,
  deleteMode = false,
  canDelete = true,
  onDeletePage,
  onSelect,
  onDragStart,
  onDrop
}: {
  pageView: PenPageView;
  pages: Array<{ slug: string; title: string; section?: PenSectionContent }>;
  activeSlug: string;
  presentation: PenPagePresentation;
  deleteMode?: boolean;
  canDelete?: boolean;
  onDeletePage: (slug: string) => void;
  onSelect: (slug: string) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  const screen = pageView === 'screen';
  const axis = pageTileAxis(pageView);
  return (
    <div
      data-page-tiles={screen ? 'screen' : axis}
      className={`flex overflow-auto ${
        screen
          ? 'max-w-[70vw] flex-row gap-0'
          : axis === 'vertical'
            ? 'max-h-80 flex-col gap-1'
            : 'max-w-[70vw] flex-row gap-1'
      }`}
    >
      {pages.map((page, index) => {
        const title = page.title || `Page ${index + 1}`;
        const selected = page.slug === activeSlug;
        return (
          <div
            key={page.slug}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={(event: DragEvent) => event.preventDefault()}
            onDrop={() => onDrop(index)}
            className="relative shrink-0"
          >
            {deleteMode && (
              <button
                type="button"
                aria-label={`Delete ${title}`}
                disabled={!canDelete}
                className="absolute left-0 top-0 z-10 rounded bg-white/90 px-1 text-[12px] text-stone-600 hover:text-red-700 disabled:opacity-40"
                onClick={() => onDeletePage(page.slug)}
              >
                −
              </button>
            )}
            <div
              role="button"
              tabIndex={0}
              aria-label={title}
              aria-pressed={selected}
              className={`block cursor-pointer overflow-hidden ${
                screen
                  ? selected
                    ? 'ring-2 ring-inset ring-stone-800'
                    : ''
                  : `rounded ${selected ? 'ring-2 ring-stone-800' : 'ring-1 ring-stone-300'}`
              }`}
              onClick={() => onSelect(page.slug)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onSelect(page.slug);
              }}
            >
              {page.section ? (
                <PageHoverPreview
                  section={page.section}
                  presentation={presentation}
                  width={88}
                  flush={screen}
                />
              ) : (
                <span className="block w-[88px] px-2 py-6 text-[11px]">{title}</span>
              )}
            </div>
            {screen && index < pages.length - 1 ? <PageCut axis="x" /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function PreviewPageBar({
  pages,
  activeSlug,
  pageView,
  presentation,
  onSelect,
  onAddPage,
  onDeletePage,
  onReorder,
  onFlip,
  screenAllPages = false,
  onToggleScreenPages
}: {
  pages: Array<{ slug: string; title: string; section?: PenSectionContent }>;
  activeSlug: string;
  pageView: PenPageView;
  presentation: PenPagePresentation;
  onSelect: (slug: string) => void;
  onAddPage: () => void;
  onDeletePage: (slug: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onFlip: (direction: -1 | 1) => void;
  screenAllPages?: boolean;
  onToggleScreenPages?: () => void;
}) {
  const [pagesOpen, setPagesOpen] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const activeIndex = Math.max(0, pages.findIndex((page) => page.slug === activeSlug));
  const active = pages[activeIndex];
  const activeLabel = active?.title || `Page ${activeIndex + 1}`;
  const [pageDraft, setPageDraft] = useState(String(activeIndex + 1));
  const canDelete = pages.length > 1;

  useEffect(() => {
    setPageDraft(String(activeIndex + 1));
  }, [activeIndex, pages.length]);

  useEffect(() => {
    if (!pagesOpen) return;
    function onDoc(event: MouseEvent) {
      if (pagesRef.current?.contains(event.target as Node)) return;
      setPagesOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pagesOpen]);

  function commitPageNumber() {
    const n = Math.round(Number(pageDraft));
    if (!Number.isFinite(n) || pages.length === 0) {
      setPageDraft(String(activeIndex + 1));
      return;
    }
    const clamped = Math.min(pages.length, Math.max(1, n));
    setPageDraft(String(clamped));
    const next = pages[clamped - 1];
    if (next && next.slug !== activeSlug) onSelect(next.slug);
  }

  function dropOn(index: number) {
    if (dragIndex == null || dragIndex === index) return;
    onReorder(dragIndex, index);
    setDragIndex(null);
  }

  return (
    <div
      role="toolbar"
      aria-label="Pages"
      className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-stone-300 bg-stone-50 px-2 py-1.5"
    >
      <div ref={pagesRef} className="relative justify-self-start">
        <button
          type="button"
          aria-label="Pages"
          aria-expanded={pagesOpen}
          className="max-w-[10rem] truncate rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-900 hover:border-stone-500"
          onClick={() => setPagesOpen((open) => !open)}
        >
          {activeLabel}
        </button>
        {pagesOpen && (
          <div className="absolute bottom-full left-0 z-40 mb-1 max-w-[80vw] rounded border border-stone-300 bg-white p-1 shadow-lg">
            <div className="mb-1 flex items-center justify-end gap-1">
              <button
                type="button"
                aria-label="Delete pages"
                aria-pressed={deleteMode}
                className={`rounded px-2 py-0.5 text-[12px] font-medium ${
                  deleteMode ? 'bg-stone-800 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
                onClick={() => setDeleteMode((on) => !on)}
              >
                −
              </button>
              <button
                type="button"
                aria-label="Add page"
                className="rounded px-2 py-0.5 text-[12px] font-medium text-stone-700 hover:bg-stone-100"
                onClick={onAddPage}
              >
                +
              </button>
            </div>
            <PageFinderTiles
              pageView={pageView}
              pages={pages}
              activeSlug={activeSlug}
              presentation={presentation}
              deleteMode={deleteMode}
              canDelete={canDelete}
              onDeletePage={onDeletePage}
              onSelect={(slug) => {
                onSelect(slug);
                setPagesOpen(false);
              }}
              onDragStart={setDragIndex}
              onDrop={dropOn}
            />
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={activeIndex <= 0}
          className="rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
          onClick={() => onFlip(-1)}
        >
          ‹
        </button>
        <label className="flex items-center gap-1 text-[12px] text-stone-700">
          Page
          <input
            aria-label="Page number"
            inputMode="numeric"
            className="h-7 w-10 rounded border border-stone-300 bg-white text-center text-[12px] font-medium text-stone-900"
            value={pageDraft}
            onChange={(e) => setPageDraft(e.target.value)}
            onBlur={commitPageNumber}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          of {pages.length}
        </label>
        <button
          type="button"
          aria-label="Next page"
          disabled={activeIndex >= pages.length - 1}
          className="rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
          onClick={() => onFlip(1)}
        >
          ›
        </button>
      </div>
      <div className="justify-self-end">
        {pageView === 'screen' && onToggleScreenPages ? (
          <button
            type="button"
            aria-pressed={screenAllPages}
            aria-label={screenAllPages ? 'Current page' : 'View all'}
            title={screenAllPages ? 'Current page' : 'View all'}
            className="rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-900"
            onClick={onToggleScreenPages}
          >
            {screenAllPages ? 'Current page' : 'View all'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
