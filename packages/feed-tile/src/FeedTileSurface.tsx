import type { CSSProperties, ReactNode } from 'react';
import { PenMediaPlayer } from './PenMediaPlayer.js';

export type FeedTilePage = {
  title?: string;
  bodyHtml?: string;
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

function PageSurface({ page, titleFallback }: { page: FeedTilePage; titleFallback: string }) {
  const surface: CSSProperties = {
    backgroundColor: page.backgroundColor || '#000000',
    color: page.textColor || '#FFFFFF'
  };
  const isVideo = page.mediaKind === 'video' && Boolean(page.mediaSrc);
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
        <div className="relative flex h-full flex-col justify-center px-6 text-center">
          <div className="line-clamp-[8] break-words text-lg font-semibold leading-snug">
            {page.title || titleFallback}
          </div>
          {page.bodyHtml ? (
            <div
              className="mt-3 line-clamp-6 text-sm opacity-90 [&_*]:text-inherit"
              dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
            />
          ) : null}
        </div>
      )}
      {page.mediaSrc ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
      ) : null}
    </div>
  );
}

/** Full-bleed 9:16 tile; multi-page uses horizontal scroll-snap. */
export function FeedTileSurface({
  model,
  mode = 'preview',
  compact
}: {
  model: FeedTileViewModel;
  mode?: 'preview' | 'live';
  compact?: boolean;
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

  return (
    <div
      data-pen-compose-export-root="feed"
      className={`relative overflow-hidden bg-black ${
        compact ? 'aspect-[9/16] w-full' : 'aspect-[9/16] h-full max-h-full w-full max-w-[22rem]'
      }`}
    >
      {multi ? (
        <div className="pen-feed-carousel flex h-full w-full overflow-x-auto overflow-y-hidden">
          {pages.map((page, i) => (
            <div key={i} className="pen-feed-carousel-page relative h-full w-full shrink-0 grow-0 basis-full">
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

      <EngagementRail mode={mode} />

      <div className="pointer-events-none absolute bottom-4 left-3 right-16 z-20 text-white drop-shadow-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold backdrop-blur-sm">
            You
          </div>
          <div className="min-w-0 text-[13px] font-semibold">You</div>
        </div>
        <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-white/95">
          {model.caption || model.title}
        </p>
      </div>
    </div>
  );
}

export { EngagementRail };
