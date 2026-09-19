import { describe, expect, it } from 'vitest';
import {
  BROWSE_EMBED_ORIGIN,
  PN_FEED_EMBED_HANDSHAKE,
  PN_FEED_EMBED_READY,
  buildFeedEmbedUrl,
  isFeedEmbedPostMessage
} from './feedEmbed';

describe('feedEmbed', () => {
  it('buildFeedEmbedUrl uses browse origin and client_id', () => {
    const url = buildFeedEmbedUrl('my-app');
    expect(url).toBe(`${BROWSE_EMBED_ORIGIN}/embed/feed?client_id=my-app`);
  });

  it('buildFeedEmbedUrl accepts origin override', () => {
    const url = buildFeedEmbedUrl('acme', { origin: 'http://localhost:5173/' });
    expect(url).toBe('http://localhost:5173/embed/feed?client_id=acme');
  });

  it('isFeedEmbedPostMessage accepts ready and handshake', () => {
    expect(
      isFeedEmbedPostMessage({ v: 1, type: PN_FEED_EMBED_READY, clientId: 'x' })
    ).toBe(true);
    expect(
      isFeedEmbedPostMessage({ v: 1, type: PN_FEED_EMBED_HANDSHAKE, clientId: 'x' })
    ).toBe(true);
    expect(isFeedEmbedPostMessage({ v: 1, type: 'other', clientId: 'x' })).toBe(false);
  });
});
