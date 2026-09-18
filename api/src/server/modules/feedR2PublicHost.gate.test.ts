/**
 * Gate: signed GET URLs rewrite to FEED_R2_PUBLIC_HOST when configured.
 */
import { rewriteSignedGetHost } from './feedPreviewR2';

describe('FEED_R2_PUBLIC_HOST rewrite', () => {
  it('rewrites host and strips bucket path prefix', () => {
    const signed =
      'https://acct.r2.cloudflarestorage.com/pn-feed-previews/feed/abc/poster?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef';
    const out = rewriteSignedGetHost(signed, 'https://feed-media.parnoir.com', 'pn-feed-previews');
    expect(out).toBe(
      'https://feed-media.parnoir.com/feed/abc/poster?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef'
    );
  });

  it('leaves url unchanged when publicHost unset', () => {
    const signed = 'https://acct.r2.cloudflarestorage.com/bucket/key?sig=1';
    expect(rewriteSignedGetHost(signed, undefined, 'bucket')).toBe(signed);
    expect(rewriteSignedGetHost(signed, '', 'bucket')).toBe(signed);
  });
});
