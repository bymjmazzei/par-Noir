/** Pagination toolbar for the live preview: add a page, tiles, hover preview, view. */

import { Children, useState, type CSSProperties, type ReactNode } from 'react';
import {
  SCREEN_PAGE_WIDTH_PX,
  screenStripWidthPx,
  type PenPagePresentation,
  type PenPageView,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { pageFrameStyle } from './LayerObjectToolbar';

const VIEWS: Array<{ id: PenPageView; label: string }> = [
  { id: 'vertical', label: 'Vertical' },
  { id: 'horizontal', label: 'Horizontal' },
  { id: 'screen', label: 'Screen' }
];

const THUMB_W = 280;

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
          ? 'flex w-full flex-col items-center'
          : pageView === 'horizontal'
            ? 'flex h-full w-max flex-row items-center gap-3'
            : 'flex w-max flex-row items-stretch'
      }
      style={
        screen
          ? {
              width,
              ...(pageHeightPx ? { height: pageHeightPx } : {}),
              ...(background || {})
            }
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

function PageHoverPreview({
  section,
  presentation
}: {
  section: PenSectionContent;
  presentation: PenPagePresentation;
}) {
  const contentW = 640;
  const scale = THUMB_W / contentW;
  const layers = (section.layers || []).filter((layer) => layer.visible !== false && !layer.bodyWrap);
  const maxY = layers.reduce((max, layer) => Math.max(max, layer.y + layer.h), 180);
  const height = Math.min(360, Math.max(160, Math.round((maxY + 48) * scale)));
  return (
    <div
      className="pointer-events-none relative overflow-hidden border border-stone-300 shadow-lg"
      style={{ width: THUMB_W, height, ...pageFrameStyle(presentation) }}
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

export function PreviewPageBar({
  pages,
  activeSlug,
  pageView,
  presentation,
  onSelect,
  onAddPage,
  onDeletePage,
  onFlip,
  onPageView,
  viewLocked = false,
  onToggleViewLock
}: {
  pages: Array<{ slug: string; title: string; section?: PenSectionContent }>;
  activeSlug: string;
  pageView: PenPageView;
  presentation: PenPagePresentation;
  onSelect: (slug: string) => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  onFlip: (direction: -1 | 1) => void;
  onPageView: (view: PenPageView) => void;
  viewLocked?: boolean;
  onToggleViewLock: () => void;
}) {
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const hover = pages.find((page) => page.slug === hoverSlug);
  const activeIndex = Math.max(0, pages.findIndex((page) => page.slug === activeSlug));
  const canDelete = pages.length > 1;

  return (
    <div
      role="toolbar"
      aria-label="Pages"
      className="flex shrink-0 items-center gap-2 border-t border-stone-300 bg-stone-50 px-2 py-1.5"
    >
      <button
        type="button"
        aria-label="Add page"
        className="shrink-0 rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100"
        onClick={onAddPage}
      >
        Add page
      </button>
      <button
        type="button"
        aria-label="Delete page"
        disabled={!canDelete}
        className="shrink-0 rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
        onClick={onDeletePage}
      >
        Delete page
      </button>
      <button
        type="button"
        aria-label="Previous page"
        disabled={activeIndex <= 0}
        className="shrink-0 rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
        onClick={() => onFlip(-1)}
      >
        Prev
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {pages.map((page, index) => {
          const active = page.slug === activeSlug;
          return (
            <div
              key={page.slug}
              className="relative shrink-0"
              onMouseEnter={() => setHoverSlug(page.slug)}
              onMouseLeave={() => setHoverSlug((current) => (current === page.slug ? null : current))}
            >
              <button
                type="button"
                aria-label={page.title}
                aria-pressed={active}
                className={`rounded border px-2 py-1 text-[11px] ${
                  active
                    ? 'border-stone-800 bg-white font-semibold text-stone-900'
                    : 'border-stone-300 bg-white text-stone-600 hover:border-stone-500'
                }`}
                onClick={() => onSelect(page.slug)}
              >
                {page.title || `Page ${index + 1}`}
              </button>
              {hover?.slug === page.slug && page.section && (
                <div className="absolute bottom-full left-0 z-40 mb-2">
                  <PageHoverPreview section={page.section} presentation={presentation} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Next page"
        disabled={activeIndex >= pages.length - 1}
        className="shrink-0 rounded bg-white px-2 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
        onClick={() => onFlip(1)}
      >
        Next
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-label={view.label}
            aria-pressed={pageView === view.id}
            disabled={viewLocked}
            className={`rounded px-2 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              pageView === view.id
                ? 'bg-stone-800 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
            onClick={() => {
              if (!viewLocked) onPageView(view.id);
            }}
          >
            {view.label}
          </button>
        ))}
        <button
          type="button"
          aria-label={viewLocked ? 'Unlock view' : 'Lock view'}
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
  );
}
