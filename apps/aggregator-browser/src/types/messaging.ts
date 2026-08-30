/**
 * Unified inbox thread types (DM + group).
 */

import type { Message } from '../services/messageService';
import type { GroupAccessRole } from '../services/groupService';

export type InboxThread =
  | {
      kind: 'dm';
      participantPnIdentifier: string;
      participantName?: string;
      lastMessage?: Message;
      unreadCount: number;
      spreadsheetId?: string;
      connectionId?: string;
      kemCiphertext?: string;
      lastMessageAt?: string;
      lastMessagePreview?: string;
    }
  | {
      kind: 'group';
      groupId: string;
      title: string;
      ownerPnIdentifier: string;
      accessRole: GroupAccessRole;
      wrappedChatKey: string;
      spreadsheetId?: string;
      lastMessage?: Message;
      unreadCount: number;
      lastMessageAt?: string;
      lastMessagePreview?: string;
    };

export type SelectedInboxThread =
  | {
      kind: 'dm';
      participantPnIdentifier: string;
      participantName?: string;
      preloadedMessages?: Message[];
      connectionId?: string;
      kemCiphertext?: string;
      wrappedMessageRootKey?: string;
      spreadsheetId?: string;
      channelClientId?: string;
    }
  | {
      kind: 'group';
      groupId: string;
      title: string;
      ownerPnIdentifier: string;
      accessRole: GroupAccessRole;
      wrappedChatKey: string;
      spreadsheetId?: string;
      preloadedMessages?: Message[];
    };
