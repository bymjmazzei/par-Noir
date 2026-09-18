/**
 * Subscribe to feed first-paint gate so splash can mount before FullScreenFeed.
 */
import { useSyncExternalStore } from 'react';
import {
  getFeedMediaRetryEpoch,
  getFeedSplashMode,
  isFeedFirstPaintDone,
  subscribeFeedFirstPaint,
  type FeedSplashMode,
} from '../services/feedFirstPaintGate';

export function useFeedFirstPaintSplash(): {
  showSplash: boolean;
  mode: FeedSplashMode;
  mediaRetryEpoch: number;
} {
  const done = useSyncExternalStore(
    subscribeFeedFirstPaint,
    isFeedFirstPaintDone,
    () => true
  );
  const mode = useSyncExternalStore(
    subscribeFeedFirstPaint,
    getFeedSplashMode,
    () => 'loading' as FeedSplashMode
  );
  const mediaRetryEpoch = useSyncExternalStore(
    subscribeFeedFirstPaint,
    getFeedMediaRetryEpoch,
    () => 0
  );
  return { showSplash: !done, mode, mediaRetryEpoch };
}
