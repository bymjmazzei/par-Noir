/**
 * Hosted community feed embed helpers for L5 integrators.
 * Unlock and session run inside browse.parnoir.com/embed/feed.
 */

export const BROWSE_EMBED_ORIGIN = 'https://browse.parnoir.com' as const;

export const PN_FEED_EMBED_READY = 'pn_feed_embed_ready' as const;
export const PN_FEED_EMBED_HANDSHAKE = 'pn_feed_embed_handshake' as const;

export interface FeedEmbedOptions {
  /** Override embed origin (defaults to BROWSE_EMBED_ORIGIN). */
  origin?: string;
}

export interface FeedEmbedHandshakeMessage {
  v: 1;
  type: typeof PN_FEED_EMBED_HANDSHAKE;
  clientId: string;
}

export interface FeedEmbedReadyMessage {
  v: 1;
  type: typeof PN_FEED_EMBED_READY;
  clientId: string;
}

export type FeedEmbedPostMessage = FeedEmbedHandshakeMessage | FeedEmbedReadyMessage;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Build iframe src for hosted community feed scoped to an OAuth client. */
export function buildFeedEmbedUrl(clientId: string, options?: FeedEmbedOptions): string {
  const origin = (options?.origin ?? BROWSE_EMBED_ORIGIN).replace(/\/$/, '');
  const url = new URL('/embed/feed', origin);
  url.searchParams.set('client_id', clientId.trim());
  return url.toString();
}

export function isFeedEmbedPostMessage(v: unknown): v is FeedEmbedPostMessage {
  if (!isRecord(v) || v.v !== 1) return false;
  if (typeof v.clientId !== 'string' || !v.clientId.trim()) return false;
  return v.type === PN_FEED_EMBED_READY || v.type === PN_FEED_EMBED_HANDSHAKE;
}
