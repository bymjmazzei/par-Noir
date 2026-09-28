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

export function PreviewPageStrip({
  pageView,
  pageCount,
  pageWidthPx = SCREEN_PAGE_WIDTH_PX,
  pageHeightPx,
  background,
  children
}: {
  pageView: PenPageView;
  pageCount: number;
  pageWidthPx?: number;
  pageHeightPx?: number;
  /** Painted once across a screen strip. */
  background?: CSSProperties;
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
              {index < items.length - 1 ? (
                <div
                  data-page-seam=""
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 right-0 top-0 z-20"
                  style={{
                    width: 2,
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0 2px, transparent 2px 7px), repeating-linear-gradient(to bottom, rgba(0,0,0,0.72) 0 2px, transparent 2px 7px)',
                    backgroundSize: '1px 7px, 1px 7px',
                    backgroundPosition: '0 0, 1px 0',
                    backgroundRepeat: 'repeat-y'
                  }}
                />
              ) : null}
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
  onPageView
}: {
  pages: Array<{ slug: string; title: string; section?: PenSectionContent }>;
  activeSlug: string;
  pageView: PenPageView;
  presentation: PenPagePresentation;
  onSelect: (slug: string) => void;
  onAddPage: () => void;
  onPageView: (view: PenPageView) => void;
}) {
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const hover = pages.find((page) => page.slug === hoverSlug);

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
      <div className="flex shrink-0 items-center gap-1">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-label={view.label}
            aria-pressed={pageView === view.id}
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              pageView === view.id
                ? 'bg-stone-800 text-white'
                : 'bg-white text-stone-700 hover:bg-stone-100'
            }`}
            onClick={() => onPageView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
    </div>
  );
}
