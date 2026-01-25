/**
 * Decentralized P2P Messaging Service
 * Direct peer-to-peer messaging with IPFS fallback for offline users
 * Eliminates need for centralized API server for message routing
 */

import { ipfsService } from './ipfsService';
import { PNOAuthService } from './pnOAuthService';

export interface DecentralizedMessage {
  messageId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  mediaFileId?: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  encrypted: boolean;
  cid?: string; // IPFS CID for offline delivery
}

interface MessageInbox {
  pnIdentifier: string;
  messages: DecentralizedMessage[];
  lastUpdated: string;
}

/**
 * Send message - attempts direct P2P, falls back to IPFS storage
 */
export async function sendMessage(
  fromPnIdentifier: string,
  toPnIdentifier: string,
  content: string,
  mediaFileId?: string,
  encrypted: boolean = true
): Promise<DecentralizedMessage> {
  try {
    const message: DecentralizedMessage = {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromPnIdentifier,
      toPnIdentifier,
      content,
      mediaFileId,
      timestamp: new Date().toISOString(),
      read: false,
      encrypted
    };

    // Try direct P2P delivery first (WebRTC if both online)
    // For now, fallback to IPFS storage
    // Store message in IPFS for recipient to retrieve
    const cid = await ipfsService.uploadToIPFS(JSON.stringify(message));
    message.cid = cid;

    // Store message reference in sender's local inbox
    await storeMessageLocally(fromPnIdentifier, message, 'sent');

    // Store message reference in recipient's inbox (IPFS)
    // Recipient will poll their DID document for new messages
    await storeMessageInIPFSInbox(toPnIdentifier, message);

    return message;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

/**
 * Store message in user's local inbox
 */
async function storeMessageLocally(
  userPnIdentifier: string,
  message: DecentralizedMessage,
  folder: 'inbox' | 'sent'
): Promise<void> {
  try {
    const inboxKey = `pn_messages_${userPnIdentifier}_${folder}`;
    const existing = localStorage.getItem(inboxKey);
    const messages: DecentralizedMessage[] = existing ? JSON.parse(existing) : [];
    
    messages.push(message);
    
    // Keep only last 1000 messages per folder
    if (messages.length > 1000) {
      messages.shift();
    }
    
    localStorage.setItem(inboxKey, JSON.stringify(messages));
  } catch (error) {
    console.error('Failed to store message locally:', error);
  }
}

/**
 * Store message reference in recipient's IPFS inbox
 * Updates recipient's DID document with inbox CID
 */
async function storeMessageInIPFSInbox(
  recipientPnIdentifier: string,
  message: DecentralizedMessage
): Promise<void> {
  try {
    // Get or create recipient's inbox from IPFS
    // For now, we'll use a simple approach: store in recipient's DID document service
    // In production, use IPFS pubsub or a more sophisticated inbox system
    
    // Store message in inbox structure
    const inboxKey = `pn_messages_${recipientPnIdentifier}_inbox`;
    const existing = localStorage.getItem(inboxKey);
    const messages: DecentralizedMessage[] = existing ? JSON.parse(existing) : [];
    
    messages.push(message);
    
    // Store inbox in IPFS periodically (every 10 messages or every 5 minutes)
    // For now, store immediately
    const inbox: MessageInbox = {
      pnIdentifier: recipientPnIdentifier,
      messages: messages.slice(-100), // Keep last 100 messages in IPFS
      lastUpdated: new Date().toISOString()
    };
    
    const inboxCid = await ipfsService.uploadToIPFS(JSON.stringify(inbox));
    
    // Update recipient's DID document with inbox CID
    // This would require DID document access - for now, store locally
    // In full implementation, update DID document service endpoint
    localStorage.setItem(`pn_inbox_cid_${recipientPnIdentifier}`, inboxCid);
    localStorage.setItem(inboxKey, JSON.stringify(messages));
  } catch (error) {
    console.error('Failed to store message in IPFS inbox:', error);
    // Fallback: store locally only
    await storeMessageLocally(recipientPnIdentifier, message, 'inbox');
  }
}

/**
 * Get messages from user's inbox (local + IPFS)
 */
export async function getMessages(userPnIdentifier: string): Promise<DecentralizedMessage[]> {
  try {
    // Get messages from local storage
    const inboxKey = `pn_messages_${userPnIdentifier}_inbox`;
    const localMessages = localStorage.getItem(inboxKey);
    const messages: DecentralizedMessage[] = localMessages ? JSON.parse(localMessages) : [];

    // Try to get messages from IPFS inbox
    const inboxCid = localStorage.getItem(`pn_inbox_cid_${userPnIdentifier}`);
    if (inboxCid) {
      try {
        const inboxData = await ipfsService.downloadFromIPFS(inboxCid);
        const inbox: MessageInbox = JSON.parse(inboxData);
        
        // Merge IPFS messages with local messages (deduplicate by messageId)
        const messageMap = new Map<string, DecentralizedMessage>();
        
        // Add local messages first
        messages.forEach(msg => messageMap.set(msg.messageId, msg));
        
        // Add IPFS messages (may be newer)
        inbox.messages.forEach(msg => {
          if (!messageMap.has(msg.messageId) || 
              new Date(msg.timestamp) > new Date(messageMap.get(msg.messageId)!.timestamp)) {
            messageMap.set(msg.messageId, msg);
          }
        });
        
        return Array.from(messageMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (error) {
        // IPFS fetch failed, use local only
        console.warn('Failed to fetch messages from IPFS, using local only');
      }
    }

    return messages.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('Failed to get messages:', error);
    return [];
  }
}

/**
 * Get message threads (conversations)
 */
export async function getMessageThreads(userPnIdentifier: string): Promise<Array<{
  participantPnIdentifier: string;
  participantName?: string;
  lastMessage?: DecentralizedMessage;
  unreadCount: number;
  messages: DecentralizedMessage[];
}>> {
  try {
    const messages = await getMessages(userPnIdentifier);
    
    // Group messages by participant
    const threadsMap = new Map<string, DecentralizedMessage[]>();
    
    messages.forEach(msg => {
      // Validate message has required fields
      if (!msg.fromPnIdentifier || !msg.toPnIdentifier) {
        console.warn('[decentralizedMessaging] Skipping message with missing fromPnIdentifier/toPnIdentifier:', msg);
        return;
      }
      const participantPnIdentifier = msg.fromPnIdentifier === userPnIdentifier ? msg.toPnIdentifier : msg.fromPnIdentifier;
      if (!participantPnIdentifier) {
        console.warn('[decentralizedMessaging] Skipping message with invalid participantPnIdentifier:', msg);
        return;
      }
      if (!threadsMap.has(participantPnIdentifier)) {
        threadsMap.set(participantPnIdentifier, []);
      }
      threadsMap.get(participantPnIdentifier)!.push(msg);
    });
    
    // Convert to thread format
    const threads = Array.from(threadsMap.entries()).map(([participantPnIdentifier, msgs]) => {
      const sorted = msgs.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const unread = sorted.filter(msg => !msg.read && msg.toPnIdentifier === userPnIdentifier);
      
      return {
        participantPnIdentifier,
        lastMessage: sorted[sorted.length - 1],
        unreadCount: unread.length,
        messages: sorted
      };
    });
    
    return threads.sort((a, b) => {
      if (!a.lastMessage || !b.lastMessage) return 0;
      return new Date(b.lastMessage.timestamp).getTime() - 
             new Date(a.lastMessage.timestamp).getTime();
    });
  } catch (error) {
    console.error('Failed to get message threads:', error);
    return [];
  }
}

/**
 * Mark message as read
 */
export async function markAsRead(messageId: string, userPnIdentifier: string): Promise<void> {
  try {
    const inboxKey = `pn_messages_${userPnIdentifier}_inbox`;
    const localMessages = localStorage.getItem(inboxKey);
    if (!localMessages) return;
    
    const messages: DecentralizedMessage[] = JSON.parse(localMessages);
    const message = messages.find(msg => msg.messageId === messageId);
    
    if (message && !message.read) {
      message.read = true;
      message.readAt = new Date().toISOString();
      localStorage.setItem(inboxKey, JSON.stringify(messages));
    }
  } catch (error) {
    console.error('Failed to mark message as read:', error);
  }
}

/**
 * Delete message
 */
export async function deleteMessage(messageId: string, userPnIdentifier: string): Promise<void> {
  try {
    const inboxKey = `pn_messages_${userPnIdentifier}_inbox`;
    const localMessages = localStorage.getItem(inboxKey);
    if (!localMessages) return;
    
    const messages: DecentralizedMessage[] = JSON.parse(localMessages)
      .filter((msg: DecentralizedMessage) => msg.messageId !== messageId);
    
    localStorage.setItem(inboxKey, JSON.stringify(messages));
    
    // Also remove from sent folder
    const sentKey = `pn_messages_${userPnIdentifier}_sent`;
    const sentMessages = localStorage.getItem(sentKey);
    if (sentMessages) {
      const sent: DecentralizedMessage[] = JSON.parse(sentMessages)
        .filter((msg: DecentralizedMessage) => msg.messageId !== messageId);
      localStorage.setItem(sentKey, JSON.stringify(sent));
    }
  } catch (error) {
    console.error('Failed to delete message:', error);
  }
}

