/**
 * Message Service
 * Messaging via Google Drive/API only
 */

import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';
import { inboxCacheService } from './inboxCacheService';
import { encryptOutgoingMessage, decryptIncomingMessage, type DmSessionRecovery } from './dmCryptoClient';
import { isDmIdentityReady, getDmIdentity } from './dmIdentitySession';
import { encryptMessageRequest, decryptMessageRequest } from '@par-noir/dm-crypto';
import { messageAuthHeaders, messageFetch } from './messageAuthFetch';
import { setMessagingRateLimited } from './messagingRateLimitState';

export const MESSAGING_INBOX_REFRESH_EVENT = 'pn_messaging_inbox_refresh';
export const MESSAGING_POLL_BACKSTOP_MS = 60_000;

const inboxThreadsInflight = new Map<string, Promise<MessageThread[]>>();
const conversationMessagesInflight = new Map<
  string,
  Promise<{ messages: Message[]; total: number }>
>();

function conversationInflightKey(
  userPnIdentifier: string,
  participantPnIdentifier: string,
  limit?: number,
  offset?: number
): string {
  return `${userPnIdentifier}:${participantPnIdentifier}:${limit ?? ''}:${offset ?? ''}`;
}

function resolveRecoveryFromCache(
  userPnIdentifier: string,
  participantPnIdentifier: string,
  kemCiphertext?: string,
  wrappedMessageRootKey?: string
): DmSessionRecovery {
  if (kemCiphertext || wrappedMessageRootKey) {
    return { kemCiphertext, wrappedMessageRootKey };
  }
  const cached = inboxCacheService.get(userPnIdentifier);
  const entry = cached?.find((e) => e.participantPnIdentifier === participantPnIdentifier);
  return {
    kemCiphertext: entry?.kemCiphertext,
    wrappedMessageRootKey: entry?.wrappedMessageRootKey,
  };
}

async function resolveRecoveryForDecrypt(
  userPnIdentifier: string,
  participantPnIdentifier: string,
  kemCiphertext?: string,
  wrappedMessageRootKey?: string
): Promise<DmSessionRecovery> {
  const fromArgsOrCache = resolveRecoveryFromCache(
    userPnIdentifier,
    participantPnIdentifier,
    kemCiphertext,
    wrappedMessageRootKey
  );
  if (fromArgsOrCache.kemCiphertext || fromArgsOrCache.wrappedMessageRootKey) {
    return fromArgsOrCache;
  }
  const thread = (await getMessageThreads(userPnIdentifier)).find(
    (t) => t.participantPnIdentifier === participantPnIdentifier
  );
  return {
    kemCiphertext: thread?.kemCiphertext,
    wrappedMessageRootKey: thread?.wrappedMessageRootKey,
  };
}

export class DriveRateLimitedError extends Error {
  readonly code = 'drive_rate_limited';

  constructor(message = 'Google Drive is temporarily busy. Please wait a moment and try again.') {
    super(message);
    this.name = 'DriveRateLimitedError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseDriveRateLimitedResponse(response: Response): Promise<DriveRateLimitedError | null> {
  if (response.status !== 503) return null;
  try {
    const body = await response.json();
    if (body?.error === 'drive_rate_limited') {
      return new DriveRateLimitedError(body.message);
    }
  } catch {
    /* non-JSON */
  }
  return null;
}

/** Tell MessageList (and other listeners) to reload inbox after connection accept, etc. */
export function notifyMessagingInboxRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MESSAGING_INBOX_REFRESH_EVENT));
  }
}

export interface Message {
  messageId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  mediaFileId?: string;
  mediaMimeType?: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  encrypted: boolean;
}

/** Optimistic client-only ids before the server assigns a real messageId. */
export function isPendingMessageId(messageId: string): boolean {
  return messageId.startsWith('temp-') || messageId.startsWith('sent-');
}

function pendingMessageMatchesConfirmed(pending: Message, confirmed: Message): boolean {
  if (pending.fromPnIdentifier !== confirmed.fromPnIdentifier) return false;
  if ((pending.content || '').trim() !== (confirmed.content || '').trim()) return false;
  const deltaMs = Math.abs(
    new Date(pending.timestamp).getTime() - new Date(confirmed.timestamp).getTime()
  );
  return deltaMs < 60_000;
}

/** Merge server-fetched messages (oldest-first) with in-flight optimistic sends. */
export function mergeChatMessages(
  fetchedOldestFirst: Message[],
  currentMessages: Message[]
): Message[] {
  const byId = new Map<string, Message>();
  for (const message of fetchedOldestFirst) {
    byId.set(message.messageId, message);
  }
  for (const message of currentMessages) {
    if (!isPendingMessageId(message.messageId)) {
      if (!byId.has(message.messageId)) {
        byId.set(message.messageId, message);
      }
      continue;
    }
    const hasConfirmed = fetchedOldestFirst.some((confirmed) =>
      pendingMessageMatchesConfirmed(message, confirmed)
    );
    if (!hasConfirmed) {
      byId.set(message.messageId, message);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export interface MessageRequest {
  requestId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  kemCiphertext?: string;
  cryptoVersion?: number;
  timestamp: string;
  status: 'pending' | 'accepted' | 'declined';
}

async function fetchRecipientMlKemPublicKey(toPnIdentifier: string): Promise<string> {
  const res = await fetch(`${API_ENDPOINT}/api/profile/${encodeURIComponent(toPnIdentifier)}/ml-kem-public-key`);
  if (!res.ok) {
    throw new Error('Recipient has no messaging public key');
  }
  const data = await res.json();
  if (!data.mlKemPublicKey) {
    throw new Error('Recipient has no messaging public key');
  }
  return data.mlKemPublicKey as string;
}

export interface MessageThread {
  /** dm | group — default dm for legacy */
  threadType?: 'dm' | 'group';
  participantPnIdentifier: string;
  participantName?: string;
  lastMessage?: Message;
  unreadCount: number;
  messages: Message[];
  spreadsheetId?: string;
  connectionId?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  groupId?: string;
  groupTitle?: string;
  ownerPnIdentifier?: string;
  accessRole?: 'readWrite' | 'readOnly';
  wrappedChatKey?: string;
}

/**
 * Get messages from user's inbox
 */
export async function getMessages(userPnIdentifier: string): Promise<Message[]> {
  try {
    const path = `/api/messages/inbox?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`;
    const response = await messageFetch(path, { method: 'GET' });

    if (!response.ok) {
      throw new Error('Failed to load messages');
    }

    const result = await response.json();
    return result.messages || [];
  } catch (error) {
    console.error('Failed to get messages:', error);
    return [];
  }
}

/**
 * Merged DM + group inbox threads, sorted by lastMessageAt.
 */
export async function getInboxThreads(userPnIdentifier: string): Promise<MessageThread[]> {
  const inflight = inboxThreadsInflight.get(userPnIdentifier);
  if (inflight) return inflight;

  const work = (async (): Promise<MessageThread[]> => {
    const dmThreads = await getMessageThreads(userPnIdentifier);

    const dmOnly = dmThreads.filter((t) => t.threadType !== 'group');
    const groupThreads: MessageThread[] = [];

    for (const conv of dmThreads) {
      if (conv.threadType !== 'group') continue;
      const gid = conv.groupId || conv.participantPnIdentifier;
      groupThreads.push({
        threadType: 'group',
        participantPnIdentifier: gid,
        participantName: conv.groupTitle || 'Group',
        lastMessage: conv.lastMessage,
        unreadCount: conv.unreadCount || 0,
        messages: [],
        spreadsheetId: conv.spreadsheetId,
        connectionId: conv.ownerPnIdentifier || conv.connectionId,
        groupId: gid,
        groupTitle: conv.groupTitle || 'Group',
        ownerPnIdentifier: conv.ownerPnIdentifier || conv.connectionId,
        accessRole: conv.accessRole || 'readWrite',
        wrappedChatKey: conv.wrappedChatKey || '',
      });
    }

    const merged = [...dmOnly, ...groupThreads];
    merged.sort((a, b) => {
      const ta = a.lastMessage?.timestamp || '';
      const tb = b.lastMessage?.timestamp || '';
      return new Date(tb).getTime() - new Date(ta).getTime();
    });
    return merged;
  })();

  inboxThreadsInflight.set(userPnIdentifier, work);
  try {
    return await work;
  } finally {
    inboxThreadsInflight.delete(userPnIdentifier);
  }
}

export async function refreshMessagingInbox(
  userPnIdentifier: string,
  maxAttempts = 3
): Promise<MessageThread[]> {
  inboxCacheService.clear(userPnIdentifier);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const threads = await getInboxThreads(userPnIdentifier);
      notifyMessagingInboxRefresh();
      return threads;
    } catch (error) {
      lastError = error;
      if (error instanceof DriveRateLimitedError && attempt < maxAttempts) {
        await sleep(1000 * attempt);
        continue;
      }
      notifyMessagingInboxRefresh();
      throw error;
    }
  }
  throw lastError;
}

/**
 * Get message threads (conversations)
 */
export async function getMessageThreads(userPnIdentifier: string): Promise<MessageThread[]> {
  const path = `/api/messages/conversations?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`;
  const response = await messageFetch(path, { method: 'GET' });

  const rateLimited = await parseDriveRateLimitedResponse(response);
  if (rateLimited) {
    setMessagingRateLimited();
    throw rateLimited;
  }

  if (!response.ok) {
    throw new Error('Failed to load message threads');
  }

  const result = await response.json();
  const conversations = result.conversations || result.threads || [];

  return conversations.map((conv: any) => ({
    threadType: conv.threadType === 'group' ? 'group' : 'dm',
    participantPnIdentifier: conv.participantPnIdentifier || conv.otherUserPnIdentifier,
    participantName: conv.participantName,
    lastMessage: conv.lastMessage,
    unreadCount: conv.unreadCount || 0,
    messages: [],
    spreadsheetId: conv.spreadsheetId,
    connectionId: conv.connectionId,
    kemCiphertext: conv.kemCiphertext,
    wrappedMessageRootKey: conv.wrappedMessageRootKey,
    groupId: conv.groupId,
    groupTitle: conv.groupTitle,
    ownerPnIdentifier: conv.ownerPnIdentifier,
    accessRole: conv.accessRole,
    wrappedChatKey: conv.wrappedChatKey
  }));
}

/**
 * Get messages in a conversation with a specific user
 * @param connectionId - Optional: connectionId from inbox (optimized path)
 * @param kemCiphertext - Optional: KEM ciphertext from inbox (requester recovery)
 * @param wrappedMessageRootKey - Optional: wrapped root from inbox (acceptor recovery)
 * @param spreadsheetId - Optional: spreadsheetId from inbox (optimized path)
 * Uses POST with body when cached credentials provided (avoids URL length/encoding issues).
 */
export async function getConversationMessages(
  userPnIdentifier: string,
  participantPnIdentifier: string,
  limit?: number,
  offset?: number,
  connectionId?: string,
  kemCiphertext?: string,
  spreadsheetId?: string,
  wrappedMessageRootKey?: string
): Promise<{ messages: Message[]; total: number }> {
  const inflightKey = conversationInflightKey(
    userPnIdentifier,
    participantPnIdentifier,
    limit,
    offset
  );
  const inflight = conversationMessagesInflight.get(inflightKey);
  if (inflight) return inflight;

  const work = (async (): Promise<{ messages: Message[]; total: number }> => {
    const hasCached = !!(
      connectionId &&
      spreadsheetId &&
      connectionId.trim() !== '' &&
      spreadsheetId.trim() !== ''
    );

    const body = {
      userPnIdentifier,
      participantPnIdentifier,
      ...(limit != null && { limit }),
      ...(offset != null && { offset }),
      ...(hasCached && { connectionId, spreadsheetId })
    };

    const response = hasCached
      ? await messageFetch('/api/messages/conversation', {
          method: 'POST',
          bodyObject: body,
        })
      : await messageFetch(
          `/api/messages/conversation?${new URLSearchParams({
            userPnIdentifier,
            participantPnIdentifier,
            ...(limit != null && { limit: String(limit) }),
            ...(offset != null && { offset: String(offset) })
          }).toString()}`,
          { method: 'GET' }
        );

    const rateLimited = await parseDriveRateLimitedResponse(response);
    if (rateLimited) {
      setMessagingRateLimited();
      throw rateLimited;
    }

    if (!response.ok) {
      throw new Error('Failed to load conversation messages');
    }

    const result = await response.json();
    const raw = result.messages || [];
    const recovery = await resolveRecoveryForDecrypt(
      userPnIdentifier,
      participantPnIdentifier,
      kemCiphertext,
      wrappedMessageRootKey
    );

    const effectiveConnectionId =
      connectionId ||
      inboxCacheService
        .get(userPnIdentifier)
        ?.find((e) => e.participantPnIdentifier === participantPnIdentifier)?.connectionId;

    const messages: Message[] = await Promise.all(
      raw.map(async (row: Message & { encryptedContent?: string; cryptoVersion?: number }) => {
        const enc = row.encryptedContent || row.content || '';
        let content = '';
        if (effectiveConnectionId && enc) {
          try {
            content = await decryptIncomingMessage(enc, effectiveConnectionId, recovery);
          } catch {
            content = '[Unable to decrypt message]';
          }
        }
        return {
          ...row,
          content,
          encrypted: true
        };
      })
    );

    return { messages, total: result.total || 0 };
  })();

  conversationMessagesInflight.set(inflightKey, work);
  try {
    return await work;
  } finally {
    conversationMessagesInflight.delete(inflightKey);
  }
}

/**
 * @deprecated Use getConversationMessages instead
 * Get messages in a thread with a specific user (backward compatibility)
 */
export async function getThreadMessages(
  userPnIdentifier: string,
  participantPnIdentifier: string
): Promise<Message[]> {
  const result = await getConversationMessages(userPnIdentifier, participantPnIdentifier);
  return result.messages;
}

/**
 * Send message via Google Drive/API
 */
export async function sendMessage(
  fromPnIdentifier: string,
  toPnIdentifier: string,
  content: string,
  mediaFileId?: string,
  connectionId?: string,
  kemCiphertext?: string,
  mediaMimeType?: string,
  wrappedMessageRootKey?: string
): Promise<Message> {
  if (!isDmIdentityReady()) {
    throw new Error('Messaging keys unavailable. Lock and unlock your pN again to send messages.');
  }
  let connId = connectionId;
  let recovery: DmSessionRecovery = {
    kemCiphertext,
    wrappedMessageRootKey,
  };
  if (!connId || (!recovery.kemCiphertext && !recovery.wrappedMessageRootKey)) {
    const thread = (await getMessageThreads(fromPnIdentifier)).find(
      (t) => t.participantPnIdentifier === toPnIdentifier
    );
    connId = thread?.connectionId;
    recovery = {
      kemCiphertext: thread?.kemCiphertext,
      wrappedMessageRootKey: thread?.wrappedMessageRootKey,
    };
  }
  if (!connId || (!recovery.kemCiphertext && !recovery.wrappedMessageRootKey)) {
    throw new Error('No encrypted session for this conversation. Re-accept the connection.');
  }

  const encryptedContent = await encryptOutgoingMessage(content, connId, recovery);

  try {
    const sendPayload = {
        fromPnIdentifier,
        toPnIdentifier,
        encryptedContent,
        cryptoVersion: 2,
        ...(mediaFileId ? { mediaFileId, ...(mediaMimeType ? { mediaMimeType } : {}) } : {})
      };
    const response = await messageFetch('/api/messages/send', {
      method: 'POST',
      bodyObject: sendPayload,
    });

    if (!response.ok) {
      let errorMessage = 'Failed to send message';
      try {
        const error = await response.json();
        // Extract error message, but sanitize technical errors that don't help users
        const rawError = error.error_description || error.error || errorMessage;
        
        // Don't expose internal server errors (like "crypto is not defined") to users
        if (response.status === 500 && (rawError.includes('crypto') || rawError.includes('undefined'))) {
          errorMessage = 'Server error occurred while sending message. Please try again.';
        } else {
          errorMessage = rawError;
          if (error.details) {
            errorMessage += ` - ${error.details}`;
          }
        }
      } catch (e) {
        // If response is not JSON, use status text
        const statusText = response.statusText || `HTTP ${response.status}`;
        if (response.status === 500) {
          errorMessage = 'Server error occurred while sending message. Please try again.';
        } else {
          errorMessage = `Failed to send message: ${statusText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    const message = {
      ...result.message,
      content,
      encrypted: true
    };
    
    // Refresh inbox cache after successful send (non-blocking)
    // This updates the lastMessageAt timestamp for the conversation
    getMessageThreads(fromPnIdentifier)
      .then(threads => {
        const inboxEntries = threads
          .filter(thread => thread.participantPnIdentifier)
          .map(thread => ({
            participantPnIdentifier: thread.participantPnIdentifier,
            lastMessageAt: thread.lastMessage?.timestamp || new Date().toISOString()
          }))
          .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
        inboxCacheService.set(fromPnIdentifier, inboxEntries);
      })
      .catch(error => {
        // Silently fail - cache refresh is non-critical
        console.warn('[messageService] Failed to refresh inbox cache after send:', error);
      });
    
    return message;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

/**
 * Send message request
 */
export async function sendMessageRequest(
  fromPnIdentifier: string,
  toPnIdentifier: string,
  content: string
): Promise<MessageRequest> {
  try {
    if (!isDmIdentityReady()) {
      throw new Error('Messaging keys unavailable. Lock and unlock your pN again to send messages.');
    }
    const recipientKey = await fetchRecipientMlKemPublicKey(toPnIdentifier);
    const { encryptedContent, kemCiphertext } = await encryptMessageRequest(content, recipientKey);

    const response = await messageFetch('/api/messages/requests', {
      method: 'POST',
      bodyObject: {
        fromPnIdentifier,
        toPnIdentifier,
        encryptedContent,
        kemCiphertext,
        cryptoVersion: 2
      },
    });

    if (!response.ok) {
      throw new Error('Failed to send message request');
    }

    const result = await response.json();
    return { ...result.request, content };
  } catch (error) {
    console.error('Failed to send message request:', error);
    throw error;
  }
}

/**
 * Get message requests
 */
export async function getMessageRequests(userPnIdentifier: string): Promise<MessageRequest[]> {
  try {
    const response = await messageFetch(
      `/api/messages/requests?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error('Failed to load message requests');
    }

    const result = await response.json();
    const rows: MessageRequest[] = result.requests || [];
    if (!isDmIdentityReady()) {
      return rows.map((r) => ({ ...r, content: r.cryptoVersion === 2 ? '[Encrypted message request]' : r.content }));
    }
    const { mlKemSecretKey } = getDmIdentity();
    return Promise.all(
      rows.map(async (r) => {
        if (r.cryptoVersion === 2 && r.kemCiphertext) {
          try {
            const plain = await decryptMessageRequest(r.content, r.kemCiphertext, mlKemSecretKey);
            return { ...r, content: plain };
          } catch {
            return { ...r, content: '[Unable to decrypt request]' };
          }
        }
        return r;
      })
    );
  } catch (error) {
    console.error('Failed to get message requests:', error);
    return [];
  }
}

/**
 * Accept or decline message request
 */
export async function respondToRequest(
  requestId: string,
  userPnIdentifier: string,
  accept: boolean
): Promise<void> {
  try {
    const response = await messageFetch(`/api/messages/requests/${requestId}/respond`, {
      method: 'POST',
      bodyObject: { userPnIdentifier, accept },
    });

    if (!response.ok) {
      throw new Error(`Failed to ${accept ? 'accept' : 'decline'} request`);
    }
  } catch (error) {
    console.error('Failed to respond to request:', error);
    throw error;
  }
}

/**
 * Mark message as read
 */
export async function markAsRead(
  messageId: string,
  userPnIdentifier: string,
  participantPnIdentifier?: string,
  spreadsheetId?: string
): Promise<void> {
  if (!messageId || messageId.startsWith('temp-')) {
    return;
  }
  try {
    const response = await messageFetch(`/api/messages/${messageId}/read`, {
      method: 'POST',
      bodyObject: { userPnIdentifier, participantPnIdentifier, spreadsheetId },
    });

    if (response.status === 404) {
      return;
    }
    if (!response.ok) {
      throw new Error('Failed to mark message as read');
    }
  } catch (error) {
    console.error('Failed to mark as read:', error);
    throw error;
  }
}

/**
 * Delete message
 */
export async function deleteMessage(messageId: string, userPnIdentifier: string): Promise<void> {
  try {
    const response = await messageFetch(`/api/messages/${messageId}`, {
      method: 'DELETE',
      bodyObject: { userPnIdentifier },
    });

    if (!response.ok) {
      throw new Error('Failed to delete message');
    }
  } catch (error) {
    console.error('Failed to delete message:', error);
    throw error;
  }
}

/**
 * Delete conversation
 */
export async function deleteConversation(
  userPnIdentifier: string,
  participantPnIdentifier: string
): Promise<void> {
  const response = await messageFetch(
    `/api/messages/conversation/${participantPnIdentifier}?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete conversation' }));
    throw new Error(error.error || 'Failed to delete conversation');
  }
}

