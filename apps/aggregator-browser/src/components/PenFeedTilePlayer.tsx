import { FeedTileSurface, type FeedPlayback, type FeedTileViewModel } from '@par-noir/feed-tile';
import type { PenActionEffect } from '@par-noir/pen-protocol';

/** Pen feed tile centered in a feed slide; contain-fits the slide at the post's aspect. */
export function PenFeedTilePlayer({
  model,
  aspectRatio = '9/16',
  onEffect,
  onReportLink,
  playback
}: {
  model: FeedTileViewModel;
  aspectRatio?: '9/16' | '16/9' | '1/1';
  onEffect?: (effect: PenActionEffect) => void;
  onReportLink?: (url: string) => void;
  playback?: FeedPlayback;
}) {
  return (
    <div
      className="absolute inset-0 z-[5] flex h-full w-full items-center justify-center"
      style={{ containerType: 'size' }}
    >
      <FeedTileSurface
        model={model}
        mode="live"
        layout="feed"
        hideEngagementRail
        aspectRatio={aspectRatio}
        onEffect={onEffect}
        onReportLink={onReportLink}
        playback={playback}
      />
    </div>
  );
}
