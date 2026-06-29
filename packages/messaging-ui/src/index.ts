/**
 * @par-noir/messaging-ui — shared messaging types and constants for L5 embeds.
 */

export type MessagingSurface = 'messaging_app' | 'browse_modal' | 'l5_embed';

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
}

export interface SelectedMessagingThread {
  threadType: InboxThreadType;
  participantPnIdentifier?: string;
  groupId?: string;
  title?: string;
  ownerPnIdentifier?: string;
  connectionId?: string;
  kemCiphertext?: string;
  spreadsheetId?: string;
  accessRole?: 'readWrite' | 'readOnly';
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
  mimeType?: string;
  displayName?: string;
}

/** Re-export crypto helpers integrators may use for custom embeds. */
export {
  DM_CRYPTO_VERSION,
  encryptMessageRequest,
  decryptMessageRequest
} from '@par-noir/dm-crypto';
