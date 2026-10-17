import { describe, expect, it } from 'vitest';
import {
  FeedMediaNetworkError,
  feedPlaybackVariant,
  isAllowedFeedMediaSignedUrl,
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

describe('isAllowedFeedMediaSignedUrl', () => {
  it('allows R2 and feed-media hosts', () => {
    expect(
      isAllowedFeedMediaSignedUrl(
        'https://0f8a70c0e2c03ad9bdbeb34082f9c2cd.r2.cloudflarestorage.com/pn-feed-previews/x'
      )
    ).toBe(true);
    expect(isAllowedFeedMediaSignedUrl('https://feed-media.parnoir.com/x')).toBe(true);
  });

  it('rejects non-https and foreign hosts', () => {
    expect(isAllowedFeedMediaSignedUrl('http://feed-media.parnoir.com/x')).toBe(false);
    expect(isAllowedFeedMediaSignedUrl('https://evil.example/x')).toBe(false);
    expect(isAllowedFeedMediaSignedUrl('not-a-url')).toBe(false);
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
