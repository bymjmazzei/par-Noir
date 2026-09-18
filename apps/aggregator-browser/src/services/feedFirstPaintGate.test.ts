import { describe, expect, it, beforeEach } from 'vitest';
import {
  getFeedSplashMode,
  isFeedFirstPaintDone,
  markFeedFirstPaintDone,
  resetFeedFirstPaintGate,
  setFeedSplashMode,
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

  it('tracks splash mode until done', () => {
    setFeedSplashMode('network');
    expect(getFeedSplashMode()).toBe('network');
    markFeedFirstPaintDone();
    expect(getFeedSplashMode()).toBe('loading');
  });
});
