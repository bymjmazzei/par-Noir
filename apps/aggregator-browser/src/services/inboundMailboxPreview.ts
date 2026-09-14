/**
 * Decrypt mailbox chat jobs for immediate UI preview.
 *
 * Preview without cloud AT is allowed. Ack still requires successful apply-inbound
 * (Sheets durable path) — never ack from preview alone.
 */

import type { MailboxJob } from '@par-noir/device-cloud-credentials';
import { openSocialEnvelope } from '@par-noir/dm-crypto';
import { decryptIncomingMessage } from './dmCryptoClient';
import { decryptGroupMessage } from './groupCryptoClient';
import { getDmIdentity } from './dmIdentitySession';
import { inboxCacheService } from './inboxCacheService';
import type { Message } from './messageService';

export const MESSAGING_INBOUND_PREVIEW_EVENT = 'pn_messaging_inbound_preview';

export interface InboundMessagePreview {
  messageId: string;
  content: string;
  timestamp: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  connectionId?: string;
  groupId?: string;
  channelClientId?: string;
  encrypted: true;
  read: false;
}

export function notifyMessagingInboundPreview(previews: InboundMessagePreview[]): void {
  if (!previews.length || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(MESSAGING_INBOUND_PREVIEW_EVENT, { detail: { previews } })
  );
}

export function inboundPreviewToMessage(preview: InboundMessagePreview): Message {
  return {
    messageId: preview.messageId,
    fromPnIdentifier: preview.fromPnIdentifier,
    toPnIdentifier: preview.toPnIdentifier,
    content: preview.content,
    timestamp: preview.timestamp,
    read: false,
    encrypted: true,
    connectionId: preview.connectionId,
    cryptoVersion: 2
  };
}

async function openJobPayload(
  job: MailboxJob,
  mlKemSecretKey: string
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...(job.payload || {}) };
  const envelope = payload.envelope as
    | { kemCiphertext: string; ciphertext: string }
    | undefined;
  if (envelope && typeof envelope === 'object' && envelope.kemCiphertext) {
    const contextId = String(payload.envelopeContext || payload.requestId || job.jobType);
    const opened = await openSocialEnvelope<Record<string, unknown>>(
      envelope,
      mlKemSecretKey,
      contextId
    );
    Object.assign(payload, opened);
    delete payload.envelope;
  }
  return payload;
}

async function previewDmMessage(
  identityId: string,
  payload: Record<string, unknown>
): Promise<InboundMessagePreview | null> {
  const connectionId =
    typeof payload.connectionId === 'string' ? payload.connectionId.trim() : '';
  const encryptedContent =
    typeof payload.encryptedContent === 'string' ? payload.encryptedContent : '';
  const messageId = typeof payload.messageId === 'string' ? payload.messageId.trim() : '';
  if (!connectionId || !encryptedContent || !messageId) return null;

  const { isRecentOutboundMessageId } = await import('./outboundMessageIds');
  if (isRecentOutboundMessageId(messageId)) {
    // Sender also receives new_message; opaque payload has no from — skip echo paint.
    return null;
  }

  const { getConnections } = await import('./connectionService');
  const { getMessageThreads } = await import('./messageService');

  const connections = await getConnections(identityId).catch(() => []);
  const conn = connections.find((c) => c.connectionId === connectionId);
  const peerPn = conn?.userPnIdentifier || '';

  const threads = await getMessageThreads(identityId).catch(() => []);
  const thread =
    threads.find((t) => t.connectionId === connectionId) ||
    (peerPn ? threads.find((t) => t.participantPnIdentifier === peerPn) : undefined);

  const cached = inboxCacheService.get(identityId);
  const cacheEntry =
    cached?.find((e) => e.connectionId === connectionId) ||
    (peerPn ? cached?.find((e) => e.participantPnIdentifier === peerPn) : undefined);

  const recovery = {
    kemCiphertext: thread?.kemCiphertext || cacheEntry?.kemCiphertext,
    wrappedMessageRootKey:
      thread?.wrappedMessageRootKey || cacheEntry?.wrappedMessageRootKey
  };

  const content = await decryptIncomingMessage(encryptedContent, connectionId, recovery);
  const timestamp =
    typeof payload.timestamp === 'string' && payload.timestamp
      ? payload.timestamp
      : new Date().toISOString();
  const channelClientId =
    typeof payload.channelClientId === 'string' ? payload.channelClientId : undefined;

  return {
    messageId,
    content,
    timestamp,
    fromPnIdentifier: peerPn,
    toPnIdentifier: identityId,
    connectionId,
    channelClientId,
    encrypted: true,
    read: false
  };
}

async function previewGroupMessage(
  identityId: string,
  payload: Record<string, unknown>
): Promise<InboundMessagePreview | null> {
  const groupId = typeof payload.groupId === 'string' ? payload.groupId.trim() : '';
  const encryptedContent =
    typeof payload.encryptedContent === 'string' ? payload.encryptedContent : '';
  const messageId = typeof payload.messageId === 'string' ? payload.messageId.trim() : '';
  if (!groupId || !encryptedContent || !messageId) return null;

  const { isRecentOutboundMessageId } = await import('./outboundMessageIds');
  if (isRecentOutboundMessageId(messageId)) {
    return null;
  }

  const { listGroups, getGroupChatKey } = await import('./groupService');
  const groups = await listGroups(identityId).catch(() => []);
  const record = groups.find((g) => g.groupId === groupId);
  if (!record) return null;

  const chatKey = await getGroupChatKey(identityId, record);
  const content = await decryptGroupMessage(encryptedContent, chatKey);
  const timestamp =
    typeof payload.timestamp === 'string' && payload.timestamp
      ? payload.timestamp
      : new Date().toISOString();
  const fromPnIdentifier =
    typeof payload.fromPnIdentifier === 'string' ? payload.fromPnIdentifier : '';

  return {
    messageId,
    content,
    timestamp,
    fromPnIdentifier,
    toPnIdentifier: identityId,
    groupId,
    encrypted: true,
    read: false
  };
}

/**
 * Best-effort UI preview from a mailbox chat job. Never throws to the drain loop.
 */
export async function tryBuildInboundPreview(
  identityId: string,
  job: MailboxJob
): Promise<InboundMessagePreview | null> {
  if (job.jobType !== 'message_append' && job.jobType !== 'group_message_append') {
    return null;
  }
  try {
    const { mlKemSecretKey } = getDmIdentity();
    const payload = await openJobPayload(job, mlKemSecretKey);
    if (job.jobType === 'message_append') {
      return await previewDmMessage(identityId, payload);
    }
    return await previewGroupMessage(identityId, payload);
  } catch {
    return null;
  }
}

/**
 * Best-effort UI preview from a Socket.IO new_message payload (opaque ciphertext).
 * Skips mailbox GET — used for sub-1s online paint.
 */
export async function tryBuildInboundPreviewFromRealtime(
  identityId: string,
  payload: Record<string, unknown> | undefined
): Promise<InboundMessagePreview | null> {
  if (!payload) return null;
  const encryptedContent =
    typeof payload.encryptedContent === 'string' ? payload.encryptedContent : '';
  if (!encryptedContent) return null;

  try {
    const { mlKemSecretKey } = getDmIdentity();
    const opened: Record<string, unknown> = { ...payload };
    const envelope = opened.envelope as
      | { kemCiphertext: string; ciphertext: string }
      | undefined;
    if (envelope && typeof envelope === 'object' && envelope.kemCiphertext) {
      const contextId = String(opened.envelopeContext || opened.requestId || 'realtime');
      const inner = await openSocialEnvelope<Record<string, unknown>>(
        envelope,
        mlKemSecretKey,
        contextId
      );
      Object.assign(opened, inner);
      delete opened.envelope;
    }

    if (typeof opened.groupId === 'string' && opened.groupId) {
      return await previewGroupMessage(identityId, opened);
    }
    if (typeof opened.connectionId === 'string' && opened.connectionId) {
      return await previewDmMessage(identityId, opened);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Socket path: decrypt opaque ciphertext and emit preview immediately (no drain debounce).
 * Does not ack mailbox jobs — durable apply still runs via hot drain.
 */
export async function handleRealtimeCiphertextPreview(
  payload: Record<string, unknown> | undefined
): Promise<void> {
  if (!payload || typeof payload.encryptedContent !== 'string' || !payload.encryptedContent) {
    return;
  }
  try {
    const { PNOAuthService } = await import('./pnOAuthService');
    const session = PNOAuthService.loadSession();
    const identityId = session?.pnIdentifier;
    if (!identityId) return;
    const preview = await tryBuildInboundPreviewFromRealtime(identityId, payload);
    if (preview) notifyMessagingInboundPreview([preview]);
  } catch {
    /* never break socket fan-out */
  }
}
