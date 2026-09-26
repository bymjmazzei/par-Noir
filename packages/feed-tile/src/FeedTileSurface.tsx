import type { CSSProperties, ReactNode } from 'react';
import { PenMediaPlayer } from './PenMediaPlayer.js';

export type FeedTilePage = {
  title?: string;
  bodyHtml?: string;
  /** Plain body for single-block text posters (preferred over stacking title+html). */
  bodyText?: string;
  mediaSrc?: string;
  /** When mediaSrc is a video URL. */
  mediaKind?: 'image' | 'video';
  backgroundColor?: string;
  textColor?: string;
};

export type FeedTileViewModel = {
  title: string;
  caption?: string;
  pages: FeedTilePage[];
  fileId?: string;
  posterUrl?: string;
  contentClass?: string;
  /** Multipage swipe axis — collections default x; longform units y. */
  pageSwipeAxis?: 'x' | 'y';
};

function EngagementRail({ mode }: { mode: 'preview' | 'live' }) {
  const Item = ({ label, children }: { label: string; children: ReactNode }) => (
    <div
      className="flex flex-col items-center gap-0.5 text-white drop-shadow-md"
      title={mode === 'preview' ? `${label} (preview)` : label}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
        {children}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wide text-white/80">
        {mode === 'preview' ? 'Preview' : label}
      </span>
    </div>
  );

  return (
    <div className="pointer-events-none absolute bottom-24 right-3 z-20 flex flex-col items-center gap-4">
      <Item label="Like">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      </Item>
      <Item label="Comment">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      </Item>
      <Item label="Share">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </Item>
      <Item label="Save">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </Item>
    </div>
  );
}

/** Strip tags for a single plain-text poster block (no title+html double paint). */
function plainFromHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function PageSurface({ page, titleFallback }: { page: FeedTilePage; titleFallback: string }) {
  const surface: CSSProperties = {
    backgroundColor: page.backgroundColor || '#000000',
    color: page.textColor || '#FFFFFF'
  };
  const isVideo = page.mediaKind === 'video' && Boolean(page.mediaSrc);
  const bodyText =
    (page.bodyText && page.bodyText.trim()) ||
    plainFromHtml(page.bodyHtml) ||
    page.title ||
    titleFallback;

  return (
    <div className="relative h-full w-full overflow-hidden" style={surface}>
      {page.mediaSrc ? (
        isVideo ? (
          <div className="absolute inset-0">
            <PenMediaPlayer src={page.mediaSrc} className="h-full w-full [&_video]:object-cover" />
          </div>
        ) : (
          <img src={page.mediaSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : (
        <div className="pen-feed-tile-body-safe relative flex h-full flex-col justify-center text-center">
          <div className="pen-feed-tile-body-text line-clamp-[10] whitespace-pre-wrap break-words font-semibold">
            {bodyText}
          </div>
        </div>
      )}
      {page.mediaSrc ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
      ) : null}
    </div>
  );
}

/** Full-bleed feed tile; multi-page uses horizontal scroll-snap. Aspect defaults to 9:16. */
export function FeedTileSurface({
  model,
  mode = 'preview',
  compact,
  hideEngagementRail = false,
  engagementOverlay,
  aspectRatio = '9/16'
}: {
  model: FeedTileViewModel;
  mode?: 'preview' | 'live';
  compact?: boolean;
  /** When true, omit decorative rail (caller renders live engagement outside or via overlay). */
  hideEngagementRail?: boolean;
  /**
   * Replaces decorative EngagementRail when set (e.g. browse-shaped live-preview chrome).
   * Preview-only — callers must not bake this into composed publish output.
   */
  engagementOverlay?: ReactNode;
  /** Tile aspect: 9/16 portrait, 16/9 landscape, 1/1 square. */
  aspectRatio?: '9/16' | '16/9' | '1/1';
}) {
  const pages =
    model.pages.length > 0
      ? model.pages
      : [
          {
            title: model.title,
            mediaSrc: model.posterUrl
          }
        ];
  const multi = pages.length > 1;
  const axis = model.pageSwipeAxis === 'y' ? 'y' : 'x';

  const engagement =
    engagementOverlay != null
      ? engagementOverlay
      : !hideEngagementRail
        ? <EngagementRail mode={mode} />
        : null;

  const aspectClass =
    aspectRatio === '16/9'
      ? 'aspect-[16/9]'
      : aspectRatio === '1/1'
        ? 'aspect-square'
        : 'aspect-[9/16]';

  const captionText = model.caption?.trim();
  const titleText = model.title?.trim() || '';
  const showCaption =
    Boolean(captionText) && captionText!.toLowerCase() !== titleText.toLowerCase();

  return (
    <div
      data-pen-compose-export-root="feed"
      className={`relative overflow-hidden bg-black ${
        compact
          ? `${aspectClass} w-full`
          : `${aspectClass} h-full max-h-full w-full max-w-[22rem]`
      }`}
    >
      {multi ? (
        <div
          className={
            axis === 'y'
              ? 'pen-feed-carousel flex h-full w-full flex-col overflow-x-hidden overflow-y-auto'
              : 'pen-feed-carousel flex h-full w-full overflow-x-auto overflow-y-hidden'
          }
          data-page-swipe-axis={axis}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              className={
                axis === 'y'
                  ? 'pen-feed-carousel-page relative h-full w-full shrink-0 grow-0 basis-full'
                  : 'pen-feed-carousel-page relative h-full w-full shrink-0 grow-0 basis-full'
              }
            >
              <PageSurface page={page} titleFallback={model.title} />
            </div>
          ))}
        </div>
      ) : (
        <PageSurface
          page={{
            ...pages[0],
            mediaSrc: pages[0]?.mediaSrc || model.posterUrl,
            mediaKind: pages[0]?.mediaKind
          }}
          titleFallback={model.title}
        />
      )}

      {engagement}

      {/* Browse-shaped caption: title + caption only (no profile avatar; dedupe equal caption). */}
      <div className="pen-feed-tile-caption pointer-events-none absolute bottom-4 left-0 right-20 z-20 text-white drop-shadow-md">
        {titleText ? (
          <h3 className="pen-feed-tile-caption-title mb-1 line-clamp-1 font-semibold">{titleText}</h3>
        ) : null}
        {showCaption ? (
          <p className="pen-feed-tile-caption-body line-clamp-2 leading-snug text-white/95">
            {captionText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { EngagementRail };
