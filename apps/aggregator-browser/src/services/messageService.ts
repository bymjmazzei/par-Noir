/**
 * Message Service
 * Messaging via Google Drive/API only
 */

import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';

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
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  mediaFileId?: string;
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
  timestamp: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface MessageThread {
  participantPnIdentifier: string;
  participantName?: string;
  lastMessage?: Message;
  unreadCount: number;
  messages: Message[];
}

/**
 * Get messages from user's inbox
 */
export async function getMessages(userPnIdentifier: string): Promise<Message[]> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/inbox?userPnIdentifier=${userPnIdentifier}`, {
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
export async function getMessageThreads(userPnIdentifier: string): Promise<MessageThread[]> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/conversations?userPnIdentifier=${userPnIdentifier}`, {
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
      participantPnIdentifier: conv.participantPnIdentifier || conv.otherUserPnIdentifier,
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
 * Get messages in a conversation with a specific user
 */
export async function getConversationMessages(
  userPnIdentifier: string,
  participantPnIdentifier: string,
  limit?: number,
  offset?: number
): Promise<{ messages: Message[]; total: number }> {
  const params = new URLSearchParams({
    userPnIdentifier,
    participantPnIdentifier
  });
  if (limit !== undefined) params.append('limit', limit.toString());
  if (offset !== undefined) params.append('offset', offset.toString());
  
  const response = await fetch(
    `${API_ENDPOINT}/api/messages/conversation?${params.toString()}`,
    {
      headers: getAuthHeaders()
    }
  );

  if (!response.ok) {
    throw new Error('Failed to load conversation messages');
  }

  const result = await response.json();
  return {
    messages: result.messages || [],
    total: result.total || 0
  };
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
  mediaFileId?: string
): Promise<Message> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/send`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        fromPnIdentifier,
        toPnIdentifier,
        content,
        mediaFileId
      })
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
  fromPnIdentifier: string,
  toPnIdentifier: string,
  content: string
): Promise<MessageRequest> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/requests`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        fromPnIdentifier,
        toPnIdentifier,
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
export async function getMessageRequests(userPnIdentifier: string): Promise<MessageRequest[]> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/requests?userPnIdentifier=${userPnIdentifier}`, {
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
  userPnIdentifier: string,
  accept: boolean
): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/requests/${requestId}/respond`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier,
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
export async function markAsRead(messageId: string, userPnIdentifier: string, participantPnIdentifier?: string): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/${messageId}/read`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier,
        participantPnIdentifier // Required for Google Sheets to find the right conversation sheet
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
export async function deleteMessage(messageId: string, userPnIdentifier: string): Promise<void> {
  try {
    const response = await fetch(`${API_ENDPOINT}/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userPnIdentifier
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

/**
 * Delete conversation
 */
export async function deleteConversation(
  userPnIdentifier: string,
  participantPnIdentifier: string
): Promise<void> {
  const response = await fetch(
    `${API_ENDPOINT}/api/messages/conversation/${participantPnIdentifier}?userPnIdentifier=${encodeURIComponent(userPnIdentifier)}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders()
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete conversation' }));
    throw new Error(error.error || 'Failed to delete conversation');
  }
}

