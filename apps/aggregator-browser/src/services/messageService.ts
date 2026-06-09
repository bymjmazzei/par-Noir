/**
 * Message Service
 * Messaging via Google Drive/API only
 */

import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';
import { inboxCacheService } from './inboxCacheService';
import { encryptOutgoingMessage, decryptIncomingMessage } from './dmCryptoClient';
import { isDmIdentityReady, getDmIdentity } from './dmIdentitySession';
import { encryptMessageRequest, decryptMessageRequest } from '@par-noir/dm-crypto';
import { messageAuthHeaders, messageFetch } from './messageAuthFetch';

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
  const { listGroups, groupRecordsForUser } = await import('./groupService');
  const [dmThreads, groups] = await Promise.all([
    getMessageThreads(userPnIdentifier),
    listGroups(userPnIdentifier).catch(() => [] as import('./groupService').GroupRecord[])
  ]);

  const groupById = groupRecordsForUser(groups, userPnIdentifier);
  const dmOnly = dmThreads.filter((t) => t.threadType !== 'group');
  const groupIdsInInbox = new Set(
    dmThreads.filter((t) => t.threadType === 'group').map((t) => t.groupId || t.participantPnIdentifier)
  );

  const groupThreads: MessageThread[] = [];

  for (const conv of dmThreads) {
    if (conv.threadType !== 'group') continue;
    const gid = conv.groupId || conv.participantPnIdentifier;
    const meta = groupById.get(gid);
    groupThreads.push({
      threadType: 'group',
      participantPnIdentifier: gid,
      participantName: conv.groupTitle || meta?.title || 'Group',
      lastMessage: conv.lastMessage,
      unreadCount: conv.unreadCount || 0,
      messages: [],
      spreadsheetId: conv.spreadsheetId,
      connectionId: conv.ownerPnIdentifier || conv.connectionId,
      groupId: gid,
      groupTitle: conv.groupTitle || meta?.title || 'Group',
      ownerPnIdentifier: conv.ownerPnIdentifier || conv.connectionId,
      accessRole: meta?.accessRole || 'readWrite',
      wrappedChatKey: meta?.wrappedChatKey || ''
    });
    groupIdsInInbox.add(gid);
  }

  for (const [gid, meta] of groupById) {
    if (groupIdsInInbox.has(gid)) continue;
    groupThreads.push({
      threadType: 'group',
      participantPnIdentifier: gid,
      participantName: meta.title,
      unreadCount: 0,
      messages: [],
      spreadsheetId: meta.conversationSpreadsheetId,
      connectionId: meta.ownerPnIdentifier,
      groupId: gid,
      groupTitle: meta.title,
      ownerPnIdentifier: meta.ownerPnIdentifier,
      accessRole: meta.accessRole,
      wrappedChatKey: meta.wrappedChatKey
    });
  }

  const merged = [...dmOnly, ...groupThreads];
  merged.sort((a, b) => {
    const ta = a.lastMessage?.timestamp || '';
    const tb = b.lastMessage?.timestamp || '';
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
  return merged;
}

/**
 * Get message threads (conversations)
 */
export async function getMessageThreads(userPnIdentifier: string): Promise<MessageThread[]> {
  try {
    const path = `/api/messages/conversations?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`;
    const response = await messageFetch(path, { method: 'GET' });

    if (!response.ok) {
      throw new Error('Failed to load message threads');
    }

    const result = await response.json();
    // Handle both conversations and threads response format
    const conversations = result.conversations || result.threads || [];
    
    // Convert to MessageThread format
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
      groupId: conv.groupId,
      groupTitle: conv.groupTitle,
      ownerPnIdentifier: conv.ownerPnIdentifier,
      accessRole: conv.accessRole,
      wrappedChatKey: conv.wrappedChatKey
    }));
  } catch (error) {
    console.error('Failed to get message threads:', error);
    return [];
  }
}

/**
 * Get messages in a conversation with a specific user
 * @param connectionId - Optional: connectionId from inbox (optimized path)
 * @param kemCiphertext - Optional: KEM ciphertext from inbox (optimized path)
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
  spreadsheetId?: string
): Promise<{ messages: Message[]; total: number }> {
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

  if (!response.ok) {
    throw new Error('Failed to load conversation messages');
  }

  const result = await response.json();
  const raw = result.messages || [];
  const kem =
    kemCiphertext ||
    (await getMessageThreads(userPnIdentifier)).find(
      (t) => t.participantPnIdentifier === participantPnIdentifier
    )?.kemCiphertext;

  const messages: Message[] = await Promise.all(
    raw.map(async (row: Message & { encryptedContent?: string; cryptoVersion?: number }) => {
      const enc = row.encryptedContent || row.content || '';
      let content = '';
      if (connectionId && enc) {
        try {
          content = await decryptIncomingMessage(enc, connectionId, kem);
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
}

/**
 * @deprecated Use getConversationMessages instead
 * Get messages in a thread with a specific user (backward compatibility)
 */
export async function getThreadMessages(
  userPnIdentifier: string,
  participantPnIdentifier: string
): Promise<Message[]> {
  return getConversationMessages(userPnIdentifier, participantPnIdentifier);
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
  mediaMimeType?: string
): Promise<Message> {
  if (!isDmIdentityReady()) {
    throw new Error('Unlock messaging with your passcode before sending');
  }
  let connId = connectionId;
  let kem = kemCiphertext;
  if (!connId || !kem) {
    const thread = (await getMessageThreads(fromPnIdentifier)).find(
      (t) => t.participantPnIdentifier === toPnIdentifier
    );
    connId = thread?.connectionId;
    kem = thread?.kemCiphertext;
  }
  if (!connId || !kem) {
    throw new Error('No encrypted session for this conversation. Re-accept the connection.');
  }

  const encryptedContent = await encryptOutgoingMessage(content, connId, kem);

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
      throw new Error('Unlock messaging before sending a request');
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
export async function markAsRead(messageId: string, userPnIdentifier: string, participantPnIdentifier?: string): Promise<void> {
  try {
    const response = await messageFetch(`/api/messages/${messageId}/read`, {
      method: 'POST',
      bodyObject: { userPnIdentifier, participantPnIdentifier },
    });

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

