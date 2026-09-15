/**
 * Inbound wake + optional online socket paint.
 * Paint only via DmThreadSession / group chatKey with open-thread attribution.
 * Sheets remains durable SoT; wake must not invent peer-default Message rows.
 */

import type { MailboxJob } from '@par-noir/device-cloud-credentials';
import type { Message } from './messageService';
import { decryptIncomingMessage, UNABLE_TO_DECRYPT_MESSAGE } from './dmCryptoClient';
import { decryptGroupMessage } from './groupCryptoClient';
import { isRecentOutboundMessageId } from './outboundMessageIds';

/** Fired when opaque ciphertext arrived (socket) or drain saw chat jobs. */
export const MESSAGING_INBOUND_WAKE_EVENT = 'pn_messaging_inbound_wake';

/** @deprecated Use MESSAGING_INBOUND_WAKE_EVENT */
export const MESSAGING_INBOUND_PREVIEW_EVENT = MESSAGING_INBOUND_WAKE_EVENT;

export interface InboundWakeDetail {
  connectionId?: string;
  groupId?: string;
  messageId?: string;
  channelClientId?: string;
  /** Opaque ciphertext from socket new_message (online sub-1s paint). */
  encryptedContent?: string;
  cryptoVersion?: number;
  timestamp?: string;
  mediaFileId?: string;
  mediaMimeType?: string;
  mediaBackend?: string;
  /** Present when API includes in-transit from (preferred for groups). */
  fromPnIdentifier?: string;
  toPnIdentifier?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function inboundWakeDetailFromPayload(
  payload: Record<string, unknown> | undefined
): InboundWakeDetail {
  if (!payload) return {};
  return {
    connectionId: str(payload.connectionId),
    groupId: str(payload.groupId),
    messageId: str(payload.messageId),
    channelClientId: str(payload.channelClientId),
    encryptedContent: str(payload.encryptedContent),
    cryptoVersion: num(payload.cryptoVersion),
    timestamp: str(payload.timestamp),
    mediaFileId: str(payload.mediaFileId),
    mediaMimeType: str(payload.mediaMimeType),
    mediaBackend: str(payload.mediaBackend),
    fromPnIdentifier: str(payload.fromPnIdentifier),
    toPnIdentifier: str(payload.toPnIdentifier)
  };
}

export function notifyMessagingInboundWake(detail: InboundWakeDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MESSAGING_INBOUND_WAKE_EVENT, { detail }));
}

/** @deprecated */
export function notifyMessagingInboundPreview(
  previews: Array<{ connectionId?: string; groupId?: string; messageId?: string; channelClientId?: string }>
): void {
  const first = previews[0];
  notifyMessagingInboundWake({
    connectionId: first?.connectionId,
    groupId: first?.groupId,
    messageId: first?.messageId,
    channelClientId: first?.channelClientId
  });
}

export async function tryBuildInboundPreview(
  _identityId: string,
  job: MailboxJob
): Promise<null> {
  if (job.jobType !== 'message_append' && job.jobType !== 'group_message_append') {
    return null;
  }
  const payload = (job.payload || {}) as Record<string, unknown>;
  notifyMessagingInboundWake(inboundWakeDetailFromPayload(payload));
  return null;
}

export async function tryBuildInboundPreviewFromRealtime(
  _identityId: string,
  payload: Record<string, unknown> | undefined
): Promise<null> {
  const detail = inboundWakeDetailFromPayload(payload);
  if (!detail.encryptedContent && !detail.messageId && !detail.connectionId && !detail.groupId) {
    return null;
  }
  notifyMessagingInboundWake(detail);
  return null;
}

export async function handleRealtimeCiphertextPreview(
  payload: Record<string, unknown> | undefined
): Promise<void> {
  await tryBuildInboundPreviewFromRealtime('', payload);
}

export type OpenThreadPaintContext =
  | {
      kind: 'dm';
      myPnIdentifier: string;
      peerPnIdentifier: string;
      connectionId: string;
      kemCiphertext?: string;
      wrappedMessageRootKey?: string;
      peerRouteKey?: string;
    }
  | {
      kind: 'group';
      myPnIdentifier: string;
      groupId: string;
      chatKey: string;
    };

/**
 * Decrypt socket ciphertext for an open thread. Returns null when paint is not possible
 * (no ciphertext, outbound echo, missing session material). Does not invent peer defaults.
 */
export async function decryptOpenThreadWakeMessage(
  detail: InboundWakeDetail,
  ctx: OpenThreadPaintContext
): Promise<Message | null> {
  const encryptedContent = detail.encryptedContent;
  const messageId = detail.messageId;
  if (!encryptedContent || !messageId) return null;
  if (isRecentOutboundMessageId(messageId)) return null;

  if (ctx.kind === 'dm') {
    if (detail.connectionId && detail.connectionId !== ctx.connectionId) return null;
    if (detail.groupId) return null;
    const content = await decryptIncomingMessage(encryptedContent, ctx.connectionId, {
      kemCiphertext: ctx.kemCiphertext,
      wrappedMessageRootKey: ctx.wrappedMessageRootKey
    }, {
      peerPnIdentifier: ctx.peerPnIdentifier,
      peerRouteKey: ctx.peerRouteKey
    });
    if (!content || content === UNABLE_TO_DECRYPT_MESSAGE) return null;

    const fromPn =
      detail.fromPnIdentifier && detail.fromPnIdentifier === ctx.myPnIdentifier
        ? ctx.myPnIdentifier
        : detail.fromPnIdentifier && detail.fromPnIdentifier === ctx.peerPnIdentifier
          ? ctx.peerPnIdentifier
          : ctx.peerPnIdentifier;
    const toPn = fromPn === ctx.myPnIdentifier ? ctx.peerPnIdentifier : ctx.myPnIdentifier;

    return {
      messageId,
      fromPnIdentifier: fromPn,
      toPnIdentifier: toPn,
      content,
      encryptedContent,
      cryptoVersion: detail.cryptoVersion ?? 2,
      mediaFileId: detail.mediaFileId,
      mediaMimeType: detail.mediaMimeType,
      mediaBackend: detail.mediaBackend,
      timestamp: detail.timestamp || new Date().toISOString(),
      read: false,
      encrypted: true,
      connectionId: ctx.connectionId
    };
  }

  if (detail.groupId && detail.groupId !== ctx.groupId) return null;
  if (detail.connectionId && !detail.groupId) return null;
  let content = '';
  try {
    content = await decryptGroupMessage(encryptedContent, ctx.chatKey);
  } catch {
    return null;
  }
  if (!content || content === UNABLE_TO_DECRYPT_MESSAGE) return null;
  // Groups need in-transit from; without it skip paint (Sheets SoT will load).
  const fromPn = detail.fromPnIdentifier;
  if (!fromPn) return null;

  return {
    messageId,
    fromPnIdentifier: fromPn,
    toPnIdentifier: ctx.groupId,
    content,
    encryptedContent,
    cryptoVersion: detail.cryptoVersion ?? 2,
    mediaFileId: detail.mediaFileId,
    mediaMimeType: detail.mediaMimeType,
    mediaBackend: detail.mediaBackend,
    timestamp: detail.timestamp || new Date().toISOString(),
    read: false,
    encrypted: true
  };
}

/** Removed — MessageThread must not paint from peer-default preview rows. */
export function inboundPreviewToMessage(): never {
  throw new Error('inboundPreviewToMessage removed — use decryptOpenThreadWakeMessage');
}
