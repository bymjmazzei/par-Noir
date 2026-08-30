/**
 * @par-noir/messaging-ui — shared messaging types and constants for L5 embeds.
 */

export type MessagingSurface = 'messaging_app' | 'browse_modal' | 'l5_embed';

/** Primary DM channel shared by browse + messaging first-party surfaces. */
export const PLATFORM_CHANNEL_CLIENT_ID = 'platform' as const;

/** Messaging-app aggregator: list every channel. */
export const CHANNEL_FILTER_ALL = '*' as const;

export const PN_MESSAGING_IDENTITY_MESSAGE = 'pn_messaging_identity' as const;
export const PN_MESSAGING_SESSION_MESSAGE = 'pn_messaging_session' as const;

export interface DmSessionHandoff {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
}

export type InboxThreadType = 'dm' | 'group';

export interface MessagingThreadSummary {
  threadType?: InboxThreadType;
  participantPnIdentifier: string;
  groupId?: string;
  groupTitle?: string;
  ownerPnIdentifier?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  /** Missing / legacy = platform primary. */
  channelClientId?: string;
  /** Display label for aggregator (e.g. Platform, Acme). */
  channelLabel?: string;
}

export interface SelectedMessagingThread {
  threadType: InboxThreadType;
  participantPnIdentifier?: string;
  groupId?: string;
  title?: string;
  ownerPnIdentifier?: string;
  connectionId?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  spreadsheetId?: string;
  accessRole?: 'readWrite' | 'readOnly';
  channelClientId?: string;
}

export type MediaPickSource = 'ownPn' | 'sharedWithMe' | 'saved' | 'device';

export interface MediaPickItem {
  source: MediaPickSource;
  /** Drive file id to download (library picks). */
  driveFileId?: string;
  accountId?: string;
  /** Owner pN when file lives on another user's Drive (saved / public feed). */
  ownerPnIdentifier?: string;
  /** Aggregator file id (saved tab). */
  aggregatorFileId?: string;
  publicToken?: string;
  mimeType?: string;
  displayName?: string;
  thumbnailFileId?: string;
  /** Local device file (device tab). */
  deviceFile?: File;
}

export interface MessagingMediaAttachment {
  mediaFileId: string;
  mediaBackend?: string;
  mimeType?: string;
  displayName?: string;
}

/** Re-export crypto helpers integrators may use for custom embeds. */
export {
  DM_CRYPTO_VERSION,
  encryptMessageRequest,
  decryptMessageRequest
} from '@par-noir/dm-crypto';
