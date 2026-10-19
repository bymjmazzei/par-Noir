import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedTileSurface, type FeedPlayback, type FeedTileViewModel } from '@par-noir/feed-tile';
import {
  collectWidgetIds,
  type PenActionEffect,
  type PenActionTrack,
  type WidgetViewPayload
} from '@par-noir/pen-protocol';
import { fetchPenWidgetView, runFeedPenEffect, sendPenTap } from '../services/penFeedActionHandler';

/** Pen feed tile centered in a feed slide; loads widget view state for backend widgets. */
export function PenFeedTilePlayer({
  model,
  aspectRatio = '9/16',
  penDocId,
  creatorPnIdentifier,
  userPnIdentifier,
  onPressBlocked,
  onEffect,
  onReportLink,
  playback
}: {
  model: FeedTileViewModel;
  aspectRatio?: '9/16' | '16/9' | '1/1';
  penDocId?: string;
  creatorPnIdentifier?: string;
  userPnIdentifier?: string;
  onPressBlocked?: () => void;
  onEffect?: (effect: PenActionEffect) => void;
  onReportLink?: (url: string) => void;
  playback?: FeedPlayback;
}) {
  const docId = penDocId || model.penDocId || '';
  const [widgetViews, setWidgetViews] = useState<Record<string, WidgetViewPayload>>({});

  const widgetIds = useMemo(() => {
    const layers =
      model.pages.flatMap((page) => page.penFeedPage?.actionSection.layers || []) || [];
    return docId ? collectWidgetIds(docId, layers) : [];
  }, [docId, model.pages]);

  useEffect(() => {
    if (!docId || !widgetIds.length) return;
    let cancel = false;
    void (async () => {
      const next: Record<string, WidgetViewPayload> = {};
      for (const id of widgetIds) {
        const view = await fetchPenWidgetView({
          widgetId: id,
          userPnIdentifier
        });
        if (view) next[id] = view;
      }
      if (!cancel) setWidgetViews(next);
    })();
    return () => {
      cancel = true;
    };
  }, [docId, userPnIdentifier, widgetIds.join('|')]);

  const handleEffect = useCallback(
    async (effect: PenActionEffect) => {
      const view = await runFeedPenEffect({
        effect,
        penDocId: docId,
        creatorPnIdentifier,
        userPnIdentifier
      });
      if (view && effect.kind === 'vote' && effect.widgetId) {
        setWidgetViews((prev) => ({ ...prev, [effect.widgetId!]: view }));
      }
      if (view && effect.kind === 'widget_row' && effect.widgetId) {
        setWidgetViews((prev) => ({ ...prev, [effect.widgetId!]: view }));
      }
      onEffect?.(effect);
    },
    [creatorPnIdentifier, docId, onEffect, userPnIdentifier]
  );

  const handleTrack = useCallback(
    (track: PenActionTrack) => {
      void sendPenTap({ track, creatorPnIdentifier, userPnIdentifier });
    },
    [creatorPnIdentifier, userPnIdentifier]
  );

  const tileModel = useMemo(
    () => ({ ...model, penDocId: docId, widgetViews }),
    [docId, model, widgetViews]
  );

  return (
    <div
      className="absolute inset-0 z-[5] flex h-full w-full items-center justify-center"
      style={{ containerType: 'size' }}
    >
      <FeedTileSurface
        model={tileModel}
        mode="live"
        layout="feed"
        hideEngagementRail
        aspectRatio={aspectRatio}
        onEffect={handleEffect}
        onTrack={handleTrack}
        onPressBlocked={onPressBlocked}
        onReportLink={onReportLink}
        playback={playback}
      />
    </div>
  );
}
