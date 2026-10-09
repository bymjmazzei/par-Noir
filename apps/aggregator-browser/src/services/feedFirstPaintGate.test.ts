import { describe, expect, it, beforeEach } from 'vitest';
import {
  getFeedSplashMode,
  isFeedFirstPaintDone,
  markFeedFirstPaintDone,
  resetFeedFirstPaintGate,
  setFeedSplashMode,
  settleFeedSplashWhenFeedCannotPaint,
} from './feedFirstPaintGate';

describe('feedFirstPaintGate', () => {
  beforeEach(() => {
    resetFeedFirstPaintGate();
  });

  it('starts undone and marks done', () => {
    expect(isFeedFirstPaintDone()).toBe(false);
    markFeedFirstPaintDone();
    expect(isFeedFirstPaintDone()).toBe(true);
  });

  it('reset clears done', () => {
    markFeedFirstPaintDone();
    resetFeedFirstPaintGate();
    expect(isFeedFirstPaintDone()).toBe(false);
  });

  it('dismisses splash when the catalog settles empty', () => {
    settleFeedSplashWhenFeedCannotPaint({
      viewMode: 'feed',
      activeFeedId: 'public',
      isLoading: false,
      canPaintFeed: false,
      hasError: false,
    });
    expect(isFeedFirstPaintDone()).toBe(true);
  });

  it('keeps splash while a paintable feed is still loading', () => {
    settleFeedSplashWhenFeedCannotPaint({
      viewMode: 'feed',
      activeFeedId: 'public',
      isLoading: true,
      canPaintFeed: false,
      hasError: false,
    });
    expect(isFeedFirstPaintDone()).toBe(false);
  });

  it('leaves splash up when posts exist and a poster can still paint', () => {
    settleFeedSplashWhenFeedCannotPaint({
      viewMode: 'feed',
      activeFeedId: 'public',
      isLoading: false,
      canPaintFeed: true,
      hasError: false,
    });
    expect(isFeedFirstPaintDone()).toBe(false);
  });

  it('tracks splash mode until done', () => {
    setFeedSplashMode('network');
    expect(getFeedSplashMode()).toBe('network');
    markFeedFirstPaintDone();
    expect(getFeedSplashMode()).toBe('loading');
  });
});
