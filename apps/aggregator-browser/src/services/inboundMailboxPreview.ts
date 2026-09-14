/**
 * Wake-only inbound signal for DMs/groups.
 * Does NOT invent Message rows or peer attribution — DmThreadSession + Sheets SoT paint.
 */

import type { MailboxJob } from '@par-noir/device-cloud-credentials';

/** Fired when opaque ciphertext arrived (socket) or drain saw chat jobs — UI reloads SoT. */
export const MESSAGING_INBOUND_WAKE_EVENT = 'pn_messaging_inbound_wake';

/** @deprecated Use MESSAGING_INBOUND_WAKE_EVENT — preview rows are no longer authored here. */
export const MESSAGING_INBOUND_PREVIEW_EVENT = MESSAGING_INBOUND_WAKE_EVENT;

export interface InboundWakeDetail {
  connectionId?: string;
  groupId?: string;
  messageId?: string;
  channelClientId?: string;
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
  notifyMessagingInboundWake({
    connectionId: typeof payload.connectionId === 'string' ? payload.connectionId : undefined,
    groupId: typeof payload.groupId === 'string' ? payload.groupId : undefined,
    messageId: typeof payload.messageId === 'string' ? payload.messageId : undefined,
    channelClientId:
      typeof payload.channelClientId === 'string' ? payload.channelClientId : undefined
  });
  return null;
}

export async function tryBuildInboundPreviewFromRealtime(
  _identityId: string,
  payload: Record<string, unknown> | undefined
): Promise<null> {
  if (!payload || typeof payload.encryptedContent !== 'string' || !payload.encryptedContent) {
    return null;
  }
  notifyMessagingInboundWake({
    connectionId: typeof payload.connectionId === 'string' ? payload.connectionId : undefined,
    groupId: typeof payload.groupId === 'string' ? payload.groupId : undefined,
    messageId: typeof payload.messageId === 'string' ? payload.messageId : undefined,
    channelClientId:
      typeof payload.channelClientId === 'string' ? payload.channelClientId : undefined
  });
  return null;
}

export async function handleRealtimeCiphertextPreview(
  payload: Record<string, unknown> | undefined
): Promise<void> {
  await tryBuildInboundPreviewFromRealtime('', payload);
}

/** Removed — MessageThread must not paint from peer-default preview rows. */
export function inboundPreviewToMessage(): never {
  throw new Error('inboundPreviewToMessage removed — reload conversation via DmThreadSession');
}
