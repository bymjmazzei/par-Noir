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
          ? 'flex w-max max-w-full flex-col items-center'
          : pageView === 'horizontal'
            ? 'mx-auto flex h-full w-max shrink-0 flex-row items-center justify-center gap-3'
            : 'flex w-max flex-row items-stretch justify-center'
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

export function pageTileAxis(pageView: PenPageView): 'vertical' | 'horizontal' {
  return pageView === 'vertical' ? 'vertical' : 'horizontal';
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

export function OrientationChoices({
  pageOrientation,
  pageView,
  viewLocked = false,
  onPageOrientation,
  onPageView,
  onToggleViewLock
}: {
  pageOrientation: PenPageOrientation;
  pageView: PenPageView;
  viewLocked?: boolean;
  onPageOrientation: (orientation: PenPageOrientation) => void;
  onPageView: (view: PenPageView) => void;
  onToggleViewLock: () => void;
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
  );
}

export function PreviewOrientationMenu({
  pageOrientation,
  pageView,
  viewLocked = false,
  onPageOrientation,
  onPageView,
  onToggleViewLock
}: {
  pageOrientation: PenPageOrientation;
  pageView: PenPageView;
  viewLocked?: boolean;
  onPageOrientation: (orientation: PenPageOrientation) => void;
  onPageView: (view: PenPageView) => void;
  onToggleViewLock: () => void;
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
            onPageOrientation={onPageOrientation}
            onPageView={onPageView}
            onToggleViewLock={onToggleViewLock}
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
