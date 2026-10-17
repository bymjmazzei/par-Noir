import { FeedTileSurface, type FeedTileViewModel } from '@par-noir/feed-tile';

/** Pen feed tile centered in a feed slide; contain-fits the slide at the post's aspect. */
export function PenFeedTilePlayer({
  model,
  aspectRatio = '9/16',
  onAction
}: {
  model: FeedTileViewModel;
  aspectRatio?: '9/16' | '16/9' | '1/1';
  onAction?: (message: unknown) => void;
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
        onAction={onAction as Parameters<typeof FeedTileSurface>[0]['onAction']}
      />
    </div>
  );
}
