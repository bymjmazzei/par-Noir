import { describe, expect, it } from 'vitest';
import {
  FeedMediaNetworkError,
  feedPlaybackVariant,
  isNetworkFeedMediaError,
} from './feedPreviewPlayback';

describe('feedPlaybackVariant', () => {
  const sd = { contentType: 'video/mp4' };
  const hd = { contentType: 'video/mp4' };

  it('prefers hd when the post has an hd ref', () => {
    expect(feedPlaybackVariant({ feedPreviewSd: sd, feedPreviewHd: hd }, 'hd')).toBe('hd');
  });

  it('falls back to sd, then poster, when hd is missing', () => {
    expect(feedPlaybackVariant({ feedPreviewSd: sd }, 'hd')).toBe('sd');
    expect(feedPlaybackVariant({ feedPoster: {} }, 'hd')).toBe('poster');
  });
});

describe('isNetworkFeedMediaError', () => {
  it('detects FeedMediaNetworkError and TypeError', () => {
    expect(isNetworkFeedMediaError(new FeedMediaNetworkError())).toBe(true);
    expect(isNetworkFeedMediaError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFeedMediaError(new Error('public_media_503'))).toBe(true);
    expect(isNetworkFeedMediaError(new Error('public_media_404'))).toBe(false);
  });
});
