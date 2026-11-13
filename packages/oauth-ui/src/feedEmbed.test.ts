import { describe, expect, it } from 'vitest';
import {
  BROWSE_EMBED_ORIGIN,
  PN_FEED_EMBED_HANDSHAKE,
  PN_FEED_EMBED_READY,
  PN_POST_EMBED_SIZE,
  buildFeedEmbedUrl,
  buildPostEmbedUrl,
  isFeedEmbedPostMessage,
  isPostEmbedSizeMessage
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

  it('buildPostEmbedUrl names the creator and the post on the embed route', () => {
    expect(buildPostEmbedUrl('abc', 'pn-1')).toBe(`${BROWSE_EMBED_ORIGIN}/embed/post?creator=pn-1&file=abc`);
    expect(buildPostEmbedUrl('abc', undefined, { origin: 'http://localhost:5173/' })).toBe(
      'http://localhost:5173/embed/post?file=abc'
    );
  });

  it('isPostEmbedSizeMessage accepts only a positive height for a post', () => {
    expect(isPostEmbedSizeMessage({ v: 1, type: PN_POST_EMBED_SIZE, fileId: 'abc', height: 640 })).toBe(true);
    expect(isPostEmbedSizeMessage({ v: 1, type: PN_POST_EMBED_SIZE, fileId: 'abc', height: 0 })).toBe(false);
    expect(isPostEmbedSizeMessage({ v: 1, type: PN_POST_EMBED_SIZE, fileId: '', height: 640 })).toBe(false);
  });
});
