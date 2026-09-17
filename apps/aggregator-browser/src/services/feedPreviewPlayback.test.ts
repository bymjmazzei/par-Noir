import { describe, expect, it } from 'vitest';
import { isAllowedFeedMediaSignedUrl } from './feedPreviewPlayback';

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
