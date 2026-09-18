import { describe, expect, it, beforeEach } from 'vitest';
import {
  isFeedFirstPaintDone,
  markFeedFirstPaintDone,
  resetFeedFirstPaintGate,
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
});
