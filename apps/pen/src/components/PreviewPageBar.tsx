/** Pagination toolbar for the live preview: orientation, page field, page list. */

import { Children, useEffect, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
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

function ViewIcon({ view }: { view: PenPageView }) {
  if (view === 'horizontal') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="4.5" width="13" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
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
      <rect x="4.5" y="1.5" width="7" height="13" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
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
  onDeletePage: (slug: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onFlip: (direction: -1 | 1) => void;
  onPageView: (view: PenPageView) => void;
  viewLocked?: boolean;
  onToggleViewLock: () => void;
}) {
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [orientationOpen, setOrientationOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const activeIndex = Math.max(0, pages.findIndex((page) => page.slug === activeSlug));
  const active = pages[activeIndex];
  const activeLabel = active?.title || `Page ${activeIndex + 1}`;
  const [pageDraft, setPageDraft] = useState(String(activeIndex + 1));
  const hover = pages.find((page) => page.slug === hoverSlug);
  const canDelete = pages.length > 1;

  useEffect(() => {
    setPageDraft(String(activeIndex + 1));
  }, [activeIndex, pages.length]);

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
      className="flex shrink-0 items-center gap-2 border-t border-stone-300 bg-stone-50 px-2 py-1.5"
    >
      <div className="relative flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={VIEWS.find((view) => view.id === pageView)?.label || 'Vertical'}
          aria-expanded={orientationOpen}
          data-page-view={pageView}
          className="flex h-7 w-7 items-center justify-center rounded bg-white text-stone-800 hover:bg-stone-100"
          onClick={() => {
            setPagesOpen(false);
            setOrientationOpen((open) => !open);
          }}
        >
          <ViewIcon view={pageView} />
        </button>
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
        <div
          hidden={!orientationOpen}
          className="absolute bottom-full left-0 z-40 mb-1 flex gap-1 rounded border border-stone-300 bg-white p-1 shadow-lg"
        >
            {VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                aria-label={view.label}
                aria-pressed={pageView === view.id}
                disabled={viewLocked}
                className={`flex h-7 w-7 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40 ${
                  pageView === view.id ? 'bg-stone-800 text-white' : 'text-stone-700 hover:bg-stone-100'
                }`}
                onClick={() => {
                  if (viewLocked) return;
                  onPageView(view.id);
                  setOrientationOpen(false);
                }}
              >
                <ViewIcon view={view.id} />
              </button>
            ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
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
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Pages"
          aria-expanded={pagesOpen}
          className="max-w-[10rem] truncate rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-900 hover:border-stone-500"
          onClick={() => {
            setOrientationOpen(false);
            setPagesOpen((open) => !open);
          }}
        >
          {activeLabel}
        </button>
        <div
          hidden={!pagesOpen}
          className="absolute bottom-full right-0 z-40 mb-1 w-56 rounded border border-stone-300 bg-white p-1 shadow-lg"
        >
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
            {pages.map((page, index) => {
              const title = page.title || `Page ${index + 1}`;
              const selected = page.slug === activeSlug;
              return (
                <div
                  key={page.slug}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDrop={() => dropOn(index)}
                  className="relative"
                  onMouseEnter={() => setHoverSlug(page.slug)}
                  onMouseLeave={() => setHoverSlug((current) => (current === page.slug ? null : current))}
                >
                  <div className="flex items-center gap-1">
                    {deleteMode && (
                      <button
                        type="button"
                        aria-label={`Delete ${title}`}
                        disabled={!canDelete}
                        className="shrink-0 rounded px-1 text-[12px] text-stone-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => onDeletePage(page.slug)}
                      >
                        −
                      </button>
                    )}
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-[11px] ${
                        selected ? 'bg-stone-100 font-semibold text-stone-900' : 'text-stone-700 hover:bg-stone-50'
                      }`}
                      onClick={() => {
                        onSelect(page.slug);
                        setPagesOpen(false);
                      }}
                    >
                      {title}
                    </button>
                  </div>
                  {hover?.slug === page.slug && page.section && (
                    <div className="absolute right-full top-0 z-50 mr-2">
                      <PageHoverPreview section={page.section} presentation={presentation} />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
