/**
 * Hosted messaging embed helpers for L5 integrators.
 * Unlock and session handoff run inside messaging.parnoir.com/embed.
 */

export const MESSAGING_EMBED_ORIGIN = 'https://messaging.parnoir.com' as const;

export const PN_MESSAGING_EMBED_READY = 'pn_messaging_embed_ready' as const;
export const PN_MESSAGING_EMBED_HANDSHAKE = 'pn_messaging_embed_handshake' as const;

export interface MessagingEmbedOptions {
  /** Override embed origin (defaults to MESSAGING_EMBED_ORIGIN). */
  origin?: string;
  /** Optional channel thread id when deep-linking a channel. */
  channelId?: string;
}

export interface MessagingEmbedHandshakeMessage {
  v: 1;
  type: typeof PN_MESSAGING_EMBED_HANDSHAKE;
  clientId: string;
}

export interface MessagingEmbedReadyMessage {
  v: 1;
  type: typeof PN_MESSAGING_EMBED_READY;
  clientId: string;
}

export type MessagingEmbedPostMessage =
  | MessagingEmbedHandshakeMessage
  | MessagingEmbedReadyMessage;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Build iframe src for hosted messaging scoped to an OAuth client. */
export function buildMessagingEmbedUrl(clientId: string, options?: MessagingEmbedOptions): string {
  const origin = (options?.origin ?? MESSAGING_EMBED_ORIGIN).replace(/\/$/, '');
  const url = new URL('/embed', origin);
  url.searchParams.set('client_id', clientId.trim());
  if (options?.channelId?.trim()) {
    url.searchParams.set('channel_id', options.channelId.trim());
  }
  return url.toString();
}

export function isMessagingEmbedPostMessage(v: unknown): v is MessagingEmbedPostMessage {
  if (!isRecord(v) || v.v !== 1) return false;
  if (typeof v.clientId !== 'string' || !v.clientId.trim()) return false;
  return v.type === PN_MESSAGING_EMBED_READY || v.type === PN_MESSAGING_EMBED_HANDSHAKE;
}
