/**
 * Message Service
 * Decentralized peer-to-peer messaging via IPFS + Google Drive fallback
 * Uses P2P/IPFS when available, falls back to API/Google Drive
 */

import { PNOAuthService } from './pnOAuthService';
import * as decentralizedMessaging from './decentralizedMessaging';
import { API_ENDPOINT } from '../config/api';

const USE_DECENTRALIZED = import.meta.env.VITE_USE_DECENTRALIZED !== 'false'; // Default true when unset

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const session = PNOAuthService.loadSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  
  return headers;
}

export interface Message {
  messageId: string;
  fromDid: string;
  toDid: string;
  content: string;
  mediaFileId?: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  encrypted: boolean;
}

export interface MessageRequest {
  requestId: string;
  fromDid: string;
  toDid: string;
  content: string;
  timestamp: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface MessageThread {
  participantDid: string;
  participantName?: string;
  lastMessage?: Message;
  unreadCount: number;
  messages: Message[];
}

/**
 * Get messages from user's inbox - uses decentralized/IPFS when available
 */
export async function getMessages(userDid: string): Promise<Message[]> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const decentralizedMsgs = await decentralizedMessaging.getMessages(userDid);
      return decentralizedMsgs.map(msg => ({
        messageId: msg.messageId,
        fromDid: msg.fromDid,
        toDid: msg.toDid,
        content: msg.content,
        mediaFileId: msg.mediaFileId,
        timestamp: msg.timestamp,
        read: msg.read,
        readAt: msg.readAt,
        encrypted: msg.encrypted
      }));
    } catch (error) {
      console.warn('Decentralized get messages failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API (Google Drive)
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/inbox?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

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
 * Get message threads (conversations) - uses decentralized when available
 */
export async function getMessageThreads(userDid: string): Promise<MessageThread[]> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const decentralizedThreads = await decentralizedMessaging.getMessageThreads(userDid);
      return decentralizedThreads.map(thread => ({
        participantDid: thread.participantDid,
        participantName: thread.participantName,
        lastMessage: thread.lastMessage ? {
          messageId: thread.lastMessage.messageId,
          fromDid: thread.lastMessage.fromDid,
          toDid: thread.lastMessage.toDid,
          content: thread.lastMessage.content,
          mediaFileId: thread.lastMessage.mediaFileId,
          timestamp: thread.lastMessage.timestamp,
          read: thread.lastMessage.read,
          readAt: thread.lastMessage.readAt,
          encrypted: thread.lastMessage.encrypted
        } : undefined,
        unreadCount: thread.unreadCount,
        messages: thread.messages.map(msg => ({
          messageId: msg.messageId,
          fromDid: msg.fromDid,
          toDid: msg.toDid,
          content: msg.content,
          mediaFileId: msg.mediaFileId,
          timestamp: msg.timestamp,
          read: msg.read,
          readAt: msg.readAt,
          encrypted: msg.encrypted
        }))
      }));
    } catch (error) {
      console.warn('Decentralized get message threads failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API (Google Sheets)
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/conversations?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load message threads');
    }

    const result = await response.json();
    // Handle both conversations and threads response format
    const conversations = result.conversations || result.threads || [];
    
    // Convert to MessageThread format
    return conversations.map((conv: any) => ({
      participantDid: conv.participantDid || conv.otherUserDid,
      participantName: conv.participantName,
      lastMessage: conv.lastMessage,
      unreadCount: conv.unreadCount || 0,
      messages: []
    }));
  } catch (error) {
    console.error('Failed to get message threads:', error);
    return [];
  }
}

/**
 * Get messages in a thread with a specific user
 */
export async function getThreadMessages(
  userDid: string,
  participantDid: string
): Promise<Message[]> {
  try {
    const response = await fetch(
      `${API_ENDPOINT}/api/messages/thread?userDid=${userDid}&participantDid=${participantDid}`,
      {
        headers: getAuthHeaders()
      }
    );

    if (!response.ok) {
      throw new Error('Failed to load thread messages');
    }

    const result = await response.json();
    return result.messages || [];
  } catch (error) {
    console.error('Failed to get thread messages:', error);
    return [];
  }
}

/**
 * Send message - uses decentralized P2P/IPFS when available
 */
export async function sendMessage(
  fromDid: string,
  toDid: string,
  content: string,
  mediaFileId?: string
): Promise<Message> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      const decentralizedMsg = await decentralizedMessaging.sendMessage(
        fromDid,
        toDid,
        content,
        mediaFileId,
        true // encrypted
      );
      
      // Convert to Message format
      return {
        messageId: decentralizedMsg.messageId,
        fromDid: decentralizedMsg.fromDid,
        toDid: decentralizedMsg.toDid,
        content: decentralizedMsg.content,
        mediaFileId: decentralizedMsg.mediaFileId,
        timestamp: decentralizedMsg.timestamp,
        read: decentralizedMsg.read,
        readAt: decentralizedMsg.readAt,
        encrypted: decentralizedMsg.encrypted
      };
    } catch (error) {
      console.warn('Decentralized send message failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API (Google Drive)
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/send`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        fromDid,
        toDid,
        content,
        mediaFileId
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const result = await response.json();
    return result.message;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

/**
 * Send message request
 */
export async function sendMessageRequest(
  fromDid: string,
  toDid: string,
  content: string
): Promise<MessageRequest> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/requests`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        fromDid,
        toDid,
        content
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send message request');
    }

    const result = await response.json();
    return result.request;
  } catch (error) {
    console.error('Failed to send message request:', error);
    throw error;
  }
}

/**
 * Get message requests
 */
export async function getMessageRequests(userDid: string): Promise<MessageRequest[]> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/requests?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load message requests');
    }

    const result = await response.json();
    return result.requests || [];
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
  userDid: string,
  accept: boolean
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/requests/${requestId}/respond`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid,
        accept
      })
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
 * Mark message as read - uses decentralized when available
 */
export async function markAsRead(messageId: string, userDid: string, participantDid?: string): Promise<void> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      await decentralizedMessaging.markAsRead(messageId, userDid);
      return;
    } catch (error) {
      console.warn('Decentralized mark as read failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API (Google Sheets)
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/${messageId}/read`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid,
        participantDid // Required for Google Sheets to find the right conversation sheet
      })
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
 * Delete message - uses decentralized when available
 */
export async function deleteMessage(messageId: string, userDid: string): Promise<void> {
  // Try decentralized first
  if (USE_DECENTRALIZED) {
    try {
      await decentralizedMessaging.deleteMessage(messageId, userDid);
      return;
    } catch (error) {
      console.warn('Decentralized delete message failed, falling back to API:', error);
    }
  }
  
  // Fallback to centralized API
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid
      })
    });

    if (!response.ok) {
      throw new Error('Failed to delete message');
    }
  } catch (error) {
    console.error('Failed to delete message:', error);
    throw error;
  }
}

