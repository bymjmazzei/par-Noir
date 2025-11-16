/**
 * Message Service
 * Decentralized peer-to-peer messaging via Google Drive
 */

import { PNOAuthService } from './pnOAuthService';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
 * Get messages from user's Drive inbox
 */
export async function getMessages(userDid: string): Promise<Message[]> {
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
 * Get message threads (conversations)
 */
export async function getMessageThreads(userDid: string): Promise<MessageThread[]> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/threads?userDid=${userDid}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load message threads');
    }

    const result = await response.json();
    return result.threads || [];
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
 * Send message (stores in both users' Drive folders)
 */
export async function sendMessage(
  fromDid: string,
  toDid: string,
  content: string,
  mediaFileId?: string
): Promise<Message> {
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
 * Mark message as read
 */
export async function markAsRead(messageId: string, userDid: string): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/${messageId}/read`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userDid
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
 * Delete message
 */
export async function deleteMessage(messageId: string, userDid: string): Promise<void> {
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

