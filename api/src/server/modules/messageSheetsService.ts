/**
 * Message Sheets Service
 * Manages messages in Google Sheets (one sheet file per conversation)
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';
import {
  conversationFileName,
  conversationFileNameFromPeerToken,
  legacyConversationFileName,
  isOpaquePeerKey,
  peerTokenFromConversationFileName,
  relativeFromMarker,
  resolveRelativeFrom,
} from '@par-noir/dm-crypto';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import * as MsgPortable from './storage/messagePortableService';
import { messagingLog } from '../utils/messagingLog';
import { isGoogleSheetsPerMinuteQuota } from './googleApiRetry';

function rethrowIfSheetsQuota(err: unknown): never | void {
  if (isGoogleSheetsPerMinuteQuota(err)) {
    throw err;
  }
}

export interface Message {
  messageId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  mediaFileId?: string;
  /** Storage provider for mediaFileId (defaults to google_drive when omitted). */
  mediaBackend?: string;
  mediaMimeType?: string;
  /** Client E2E ciphertext (cryptoVersion 2). */
  encryptedContent?: string;
  cryptoVersion?: number;
}

export type InboxThreadFromDrive = {
  threadType: 'dm' | 'group';
  participantPnIdentifier: string;
  spreadsheetId: string;
  connectionId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  groupId?: string;
  ownerPnIdentifier?: string;
};

export type OwnerDriveContext = {
  token: GoogleDriveToken;
  accountId?: string;
};

export type ResolveOwnerDriveContext = (
  ownerPnIdentifier: string
) => Promise<OwnerDriveContext | null>;

export class MessageSheetsService {
  private static readonly MESSAGES_FOLDER_NAME = 'par-noir-messages';
  private static readonly INBOX_SHEET_NAME = 'Inbox';
  /** Per-process cache: conversation spreadsheet id → Messages tab gid. */
  private static messagesTabGidBySpreadsheetId = new Map<string, number>();
  /** Per-process: inbox sheets that already have threadType column (avoids repeated Sheets reads). */
  private static inboxThreadTypeEnsured = new Set<string>();
  /** Per-process: inbox sheets that already have wrappedMessageRootKey column. */
  private static inboxWrappedRootEnsured = new Set<string>();

  /**
   * Normalize identifier to pn-identifier format (for legacy data compatibility only)
   * New code should expect pn identifier already normalized
   */
  private static normalizeToPnIdentifier(pnIdentifier: string): string {
    // For legacy data compatibility - check if already normalized
    return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  }

  private static cacheMessagesTabGid(spreadsheetId: string, sheetId: number): void {
    this.messagesTabGidBySpreadsheetId.set(spreadsheetId, sheetId);
  }

  private static async resolveMessagesTabGid(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string
  ): Promise<number> {
    const cached = this.messagesTabGidBySpreadsheetId.get(spreadsheetId);
    if (cached !== undefined) return cached;

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const messagesSheet = spreadsheet.data.sheets?.find((s) => s.properties?.title === 'Messages');
    const sheetId = messagesSheet?.properties?.sheetId ?? 0;
    this.cacheMessagesTabGid(spreadsheetId, sheetId);
    return sheetId;
  }

  /**
   * Get existing Inbox sheet in messages folder (does not create)
   * Throws error if inbox sheet doesn't exist
   * If cachedInboxSheetId is provided, returns it immediately (no search)
   */
  static async getInboxSheet(
    token: GoogleDriveToken,
    messagesFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    cachedInboxSheetId?: string
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.getInboxSheetPortable();
    }
    if (cachedInboxSheetId) {
      return cachedInboxSheetId;
    }

    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const drive = google.drive({ version: 'v3', auth });
      const sheets = google.sheets({ version: 'v4', auth });

      // Search for existing Inbox sheet (only if cache missing)
      const fileQuery = `name='${this.INBOX_SHEET_NAME}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchResponse = await drive.files.list({
        q: fileQuery,
        fields: 'files(id,name)',
        pageSize: 1
      });

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        const spreadsheetId = searchResponse.data.files[0].id!;
        messagingLog.debug(`[MessageSheetsService] Found existing Inbox sheet: ${spreadsheetId}`);
        
        // Ensure headers are set (for existing sheets that might not have them)
        try {
          await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Inbox!A1:F1'
          });
        } catch {
          // Headers missing, set them up
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Inbox!A1:F1',
            valueInputOption: 'RAW',
            requestBody: {
              values: [['participantPnIdentifier', 'spreadsheetId', 'connectionId', 'lastMessageAt', 'lastMessagePreview', 'kemCiphertext']]
            }
          });
        }
        
        return spreadsheetId;
      }

      // Inbox sheet doesn't exist - throw error
      throw new Error('Inbox sheet not found. Please reconnect your Google Drive in the dashboard to initialize it.');
    } catch (error: any) {
      console.error('[MessageSheetsService] Error in getInboxSheet:', {
        messagesFolderId,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /**
   * Get or create Inbox sheet in messages folder
   * Maintains conversation metadata for fast inbox loading
   * ONLY use this during drive initialization - all other code should use getInboxSheet()
   */
  static async getOrCreateInboxSheet(
    token: GoogleDriveToken,
    messagesFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.getOrCreateInboxSheetPortable();
    }
    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const drive = google.drive({ version: 'v3', auth });
      const sheets = google.sheets({ version: 'v4', auth });

      // Search for existing Inbox sheet
      const fileQuery = `name='${this.INBOX_SHEET_NAME}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchResponse = await drive.files.list({
        q: fileQuery,
        fields: 'files(id,name)',
        pageSize: 1
      });

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        const spreadsheetId = searchResponse.data.files[0].id!;
        messagingLog.debug(`[MessageSheetsService] Found existing Inbox sheet: ${spreadsheetId}`);
        
        // Ensure headers are set (for existing sheets that might not have them)
        try {
          await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Inbox!A1:F1'
          });
        } catch {
          // Headers missing, set them up
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Inbox!A1:F1',
            valueInputOption: 'RAW',
            requestBody: {
              values: [['participantPnIdentifier', 'spreadsheetId', 'connectionId', 'lastMessageAt', 'lastMessagePreview', 'kemCiphertext']]
            }
          });
        }
        
        return spreadsheetId;
      }

      // Create new Inbox sheet
      messagingLog.debug(`[MessageSheetsService] Creating new Inbox sheet in ${messagesFolderId}`);
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: this.INBOX_SHEET_NAME
          },
          sheets: [
            {
              properties: {
                title: 'Inbox',
                gridProperties: {
                  rowCount: 10000,
                  columnCount: 6
                }
              }
            }
          ]
        }
      });

      const spreadsheetId = spreadsheet.data.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error('Failed to create Inbox sheet: no ID returned');
      }

      // Move to messages folder
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: messagesFolderId,
        fields: 'id, parents'
      });

      // Set up headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Inbox!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['participantPnIdentifier', 'spreadsheetId', 'connectionId', 'lastMessageAt', 'lastMessagePreview']]
        }
      });

      messagingLog.debug(`[MessageSheetsService] Created Inbox sheet: ${spreadsheetId}`);
      return spreadsheetId;
    } catch (error: any) {
      console.error('[MessageSheetsService] Error in getOrCreateInboxSheet:', {
        messagesFolderId,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /**
   * Get or create messages folder in user's Google Drive
   */
  static async getOrCreateMessagesFolder(
    token: GoogleDriveToken,
    pnFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.getOrCreateMessagesFolderPortable(pnFolderId);
    }
    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const drive = google.drive({ version: 'v3', auth });

      // Search for existing messages folder
      try {
        const folderQuery = `name='${this.MESSAGES_FOLDER_NAME}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const searchResponse = await drive.files.list({
          q: folderQuery,
          fields: 'files(id,name)',
          pageSize: 1
        });

        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
          messagingLog.debug(`[MessageSheetsService] Found existing messages folder: ${searchResponse.data.files[0].id}`);
          return searchResponse.data.files[0].id!;
        }
      } catch (searchError: any) {
        console.error('[MessageSheetsService] Error searching for messages folder:', {
          pnFolderId,
          error: searchError?.message,
          status: searchError?.response?.status
        });
        // Continue to create new folder
      }

      // Create messages folder
      messagingLog.debug(`[MessageSheetsService] Creating new messages folder in ${pnFolderId}`);
      try {
        const createResponse = await drive.files.create({
          requestBody: {
            name: this.MESSAGES_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [pnFolderId]
          },
          fields: 'id'
        });

        const folderId = createResponse.data.id;
        if (!folderId) {
          throw new Error('Failed to create messages folder: no ID returned');
        }

        messagingLog.debug(`[MessageSheetsService] Created messages folder: ${folderId}`);
        return folderId;
      } catch (createError: any) {
        console.error('[MessageSheetsService] Failed to create messages folder:', {
          pnFolderId,
          error: createError?.message,
          status: createError?.response?.status,
          data: createError?.response?.data
        });
        throw new Error(`Failed to create messages folder: ${createError?.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      const errorDetails = {
        pnFolderId,
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data
      };
      console.error('[MessageSheetsService] Error in getOrCreateMessagesFolder:', errorDetails);
      throw error;
    }
  }

  /**
   * Get conversation sheet for a specific user (search only, does not create)
   */
  static async getConversationSheet(
    token: GoogleDriveToken,
    messagesFolderId: string,
    otherUserPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.getConversationSheetPortable(userPnIdentifier, otherUserPnIdentifier);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const candidates = [
      conversationFileNameFromPeerToken(userPnIdentifier, otherUserPnIdentifier),
      ...(isOpaquePeerKey(otherUserPnIdentifier)
        ? []
        : [legacyConversationFileName(otherUserPnIdentifier)]),
    ];

    for (const sheetFileName of candidates) {
      const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchResponse = await drive.files.list({
        q: fileQuery,
        fields: 'files(id,name)',
        pageSize: 1
      });

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        messagingLog.debug(`[MessageSheetsService] Found existing conversation sheet for ${otherUserPnIdentifier}: ${searchResponse.data.files[0].id}`);
        return searchResponse.data.files[0].id!;
      }
    }

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Create conversation sheet for a specific user
   */
  static async createConversationSheet(
    token: GoogleDriveToken,
    messagesFolderId: string,
    otherUserPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.createConversationSheetPortable(userPnIdentifier, otherUserPnIdentifier);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const sheetFileName = conversationFileNameFromPeerToken(userPnIdentifier, otherUserPnIdentifier);

    // Create new conversation sheet
    messagingLog.debug(`[MessageSheetsService] Creating new conversation sheet for ${otherUserPnIdentifier}`);
    let spreadsheet;
    try {
      spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: sheetFileName
          },
          sheets: [
            {
              properties: {
                title: 'Messages',
                gridProperties: {
                  rowCount: 10000,
                  columnCount: 9
                }
              }
            }
          ]
        }
      });
    } catch (createError: any) {
      console.error('[MessageSheetsService] Failed to create conversation sheet:', {
        otherUserPnIdentifier,
        error: createError?.message,
        status: createError?.response?.status,
        data: createError?.response?.data
      });
      throw new Error(`Failed to create conversation sheet: ${createError?.message || 'Unknown error'}`);
    }

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create conversation sheet: no ID returned');
    }

    const messagesTabGid = spreadsheet.data.sheets?.[0]?.properties?.sheetId;
    if (messagesTabGid !== undefined && messagesTabGid !== null) {
      this.cacheMessagesTabGid(spreadsheetId, messagesTabGid);
    }

    // Move to messages folder
    try {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: messagesFolderId,
        fields: 'id, parents'
      });
      messagingLog.debug(`[MessageSheetsService] Moved conversation sheet ${spreadsheetId} to messages folder`);
    } catch (moveError: any) {
      console.error('[MessageSheetsService] Failed to move conversation sheet to folder:', {
        spreadsheetId,
        messagesFolderId,
        error: moveError?.message,
        status: moveError?.response?.status
      });
      // Don't fail - sheet exists, just not in the right folder
      messagingLog.warn('[MessageSheetsService] Continuing despite folder move failure');
    }

    // Set up headers
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Messages!A1:J1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'User DID',
            'Message Content',
            'Timestamp',
            'Message ID',
            'Read Status',
            'Read At',
            'Crypto Version',
            'Media File ID',
            'Media MIME Type',
            'Media Backend'
          ]]
        }
      });
      messagingLog.debug(`[MessageSheetsService] Set up headers for conversation sheet ${spreadsheetId}`);
    } catch (headerError: any) {
      console.error('[MessageSheetsService] Failed to set up headers for conversation sheet:', {
        spreadsheetId,
        error: headerError?.message,
        status: headerError?.response?.status
      });
      // Don't fail - headers can be set manually if needed
      messagingLog.warn('[MessageSheetsService] Continuing despite header setup failure');
    }

    return spreadsheetId;
  }

  /**
   * Append message to conversation sheet
   * Encrypts message content using connection's shared secret
   */
  static async appendMessage(
    token: GoogleDriveToken,
    spreadsheetId: string,
    message: Message,
    connectionId: string,
    sharedSecret: string, // Decrypted shared secret
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const portableMessage = {
        ...message,
        fromPnIdentifier: relativeFromMarker(message.fromPnIdentifier, userPnIdentifier),
      };
      await MsgPortable.appendMessagePortable(userPnIdentifier, spreadsheetId, portableMessage as Message, accountId);
      return;
    }
    try {
      if (!token.access_token || typeof token.access_token !== 'string' || token.access_token.trim().length === 0) {
        throw new Error('Invalid access token: token is empty or invalid');
      }

      if (!spreadsheetId || typeof spreadsheetId !== 'string' || spreadsheetId.trim().length === 0) {
        throw new Error(`Invalid spreadsheet ID: ${spreadsheetId}`);
      }

      // Google Sheets IDs are typically long alphanumeric strings
      // Basic format check (at least 10 characters, alphanumeric with some special chars)
      if (spreadsheetId.length < 10) {
        throw new Error(`Invalid spreadsheet ID format: ${spreadsheetId} (too short)`);
      }

      let encryptedContent: string;
      let cryptoVersion = message.cryptoVersion ?? 0;
      if (message.cryptoVersion === 2 && message.encryptedContent) {
        encryptedContent = message.encryptedContent;
        cryptoVersion = 2;
      } else if (message.fromPnIdentifier === 'system') {
        encryptedContent = message.content;
      } else {
        throw new Error(
          'Legacy server-side message encryption is disabled. Send encryptedContent with cryptoVersion 2.'
        );
      }

      const fromCell =
        message.fromPnIdentifier === 'system'
          ? 'system'
          : relativeFromMarker(message.fromPnIdentifier, userPnIdentifier);

      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Insert message at row 2 (top of data, after header) - newest messages at top
      // This allows fast reads: just read first N rows, no counting needed
      // Get sheet ID first (needed for batchUpdate)
      const sheetId = await this.resolveMessagesTabGid(sheets, spreadsheetId);

      // Step 1: Insert a new row at row 2 (shifts existing rows down)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            insertDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: 1, // Insert at row 2 (0-indexed: row 1 = index 1, which is row 2 in 1-indexed)
                endIndex: 2 // Insert 1 row
              },
              inheritFromBefore: false
            }
          }]
        }
      });

      // Step 2: Set the values in the newly inserted row 2
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Messages!A2:J2',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            fromCell,
            encryptedContent,
            message.timestamp,
            message.messageId,
            message.read ? 'true' : 'false',
            message.readAt || '',
            cryptoVersion ? String(cryptoVersion) : '',
            message.mediaFileId || '',
            message.mediaMimeType || '',
            message.mediaBackend || ''
          ]]
        }
      });
    } catch (error: any) {
      const errorDetails = {
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        spreadsheetId,
        messageId: message.messageId,
        fromPnIdentifier: message.fromPnIdentifier,
        toPnIdentifier: message.toPnIdentifier
      };
      console.error('[MessageSheetsService] Failed to append message:', errorDetails);
      console.error('[MessageSheetsService] Full error:', error);
      
      // Provide more descriptive error message
      if (error?.response?.status === 403) {
        throw new Error(`Permission denied: Cannot write to spreadsheet ${spreadsheetId}. Check access token permissions.`);
      } else if (error?.response?.status === 404) {
        throw new Error(`Spreadsheet not found: ${spreadsheetId}. Sheet may have been deleted.`);
      } else if (error?.response?.status === 429) {
        throw new Error('Google Sheets API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Failed to append message to sheet: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Apply identity-migration row updates (pn string + re-encrypted ciphertext).
   * rowIndex is 1-based sheet row number (row 2 = first data row).
   */
  static async applyMessageRowUpdates(
    token: GoogleDriveToken,
    spreadsheetId: string,
    rowUpdates: Array<{
      rowIndex: number;
      fromPnIdentifier?: string;
      encryptedContent?: string;
    }>,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<number> {
    if (!rowUpdates.length) return 0;
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.applyMessageRowUpdatesPortable(
        userPnIdentifier,
        spreadsheetId,
        rowUpdates,
        accountId
      );
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    let updated = 0;
    for (const row of rowUpdates) {
      if (!row.rowIndex || row.rowIndex < 2) continue;
      const data: { range: string; values: string[][] }[] = [];
      if (row.fromPnIdentifier) {
        data.push({ range: `Messages!A${row.rowIndex}`, values: [[row.fromPnIdentifier]] });
      }
      if (row.encryptedContent) {
        data.push({ range: `Messages!B${row.rowIndex}`, values: [[row.encryptedContent]] });
      }
      for (const batch of data) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: batch.range,
          valueInputOption: 'RAW',
          requestBody: { values: batch.values },
        });
        updated++;
      }
    }
    return updated;
  }

  /**
   * Get messages from conversation sheet
   * Decrypts message content using connection's shared secret
   * Optimized to read only needed rows from Sheets API
   */
  static async getMessages(
    token: GoogleDriveToken,
    spreadsheetId: string,
    connectionId: string,
    sharedSecret: string, // Decrypted shared secret
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      limit?: number;
      offset?: number;
      includeTotal?: boolean; // Only count if needed (for pagination UI)
      /** API blind relay — return ciphertext only (no server decrypt). */
      relayOnly?: boolean;
      /** Peer pN for resolving self/peer from-markers on this sheet. */
      peerPnIdentifier?: string;
    }
  ): Promise<{ messages: Message[]; total: number }> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const portable = await MsgPortable.getMessagesPortable(
        userPnIdentifier,
        spreadsheetId,
        accountId,
        options
      );
      const peer = options?.peerPnIdentifier || '';
      return {
        total: portable.total,
        messages: portable.messages.map((m) => ({
          ...m,
          fromPnIdentifier:
            m.fromPnIdentifier === 'system'
              ? 'system'
              : resolveRelativeFrom(m.fromPnIdentifier, userPnIdentifier, peer || m.fromPnIdentifier),
        })),
      };
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const limit = options?.limit || 10;
    const offset = options?.offset || 0;

    // Messages are stored with newest at top (row 2), so we can read directly from the start
    // No counting needed for offset=0 - just read first N rows for fast performance
    let total = 0;
    let rowsToProcess: any[][] = [];
    
    if (offset === 0) {
      // Fast path: Read first N rows directly (newest messages are at top)
      // Row 1 is header, data starts at row 2, so read rows 2 to (limit+1)
      const endRow = limit + 1; // +1 because row 1 is header
      const range = `Messages!A2:I${endRow}`;
      
      try {
        const sheetsApiStart = Date.now();
        messagingLog.debug(`[MessageSheetsService] Reading range ${range} from sheet ${spreadsheetId.substring(0, 10)}...`);
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range
        });
        messagingLog.debug(`[MessageSheetsService] Sheets API call took ${Date.now() - sheetsApiStart}ms, got ${(response.data.values || []).length} rows`);
        rowsToProcess = response.data.values || [];
        
        // Only count if explicitly requested (for pagination UI)
        if (options?.includeTotal) {
          // Need accurate total - read column A to count (lightweight)
          try {
            const countResponse = await sheets.spreadsheets.values.get({
              spreadsheetId,
              range: 'Messages!A2:A'
            });
            total = (countResponse.data.values || []).length;
          } catch {
            // If count fails, use approximate total
            total = rowsToProcess.length;
          }
        } else {
          // Don't count - use approximate total (faster!)
          // If we got fewer rows than requested, that's the total
          // Otherwise, use the number of rows we got as approximate total
          total = rowsToProcess.length;
        }
      } catch (error: any) {
        rethrowIfSheetsQuota(error);
        messagingLog.warn('[MessageSheetsService] Failed to read message range', { message: error?.message });
        throw error;
      }
    } else {
      // With offset, need to count first to know where to start
      try {
        // Read column A to count rows (lightweight)
        const countResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Messages!A2:A'
        });
        total = (countResponse.data.values || []).length;
      } catch (error: any) {
        rethrowIfSheetsQuota(error);
        messagingLog.warn('[MessageSheetsService] Failed to get row count', { message: error?.message });
        throw error;
      }

      // Calculate which rows to read (with offset, read from startRow to endRow)
      if (rowsToProcess.length === 0 && total > 0) {
        const startRow = 2 + offset; // +2 because row 1 is header, data starts at row 2
        const endRow = startRow + limit - 1;
        
        const range = `Messages!A${startRow}:H${endRow}`;
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
          });
          rowsToProcess = response.data.values || [];
        } catch (error: any) {
          rethrowIfSheetsQuota(error);
          messagingLog.warn('[MessageSheetsService] Failed to read specific range', { message: error?.message });
          throw error;
        }
      } else if (rowsToProcess.length > 0) {
        // Already have all rows from fallback, apply offset/limit
        rowsToProcess = rowsToProcess.slice(offset, offset + limit);
      }
    }

    if (options?.relayOnly) {
      const peer = options.peerPnIdentifier || '';
      const messages: Message[] = rowsToProcess.map((row, relativeIndex) => {
        const actualIndex = offset + relativeIndex;
        const rawFrom = row[0] || '';
        const fromPnIdentifier =
          rawFrom === 'system'
            ? 'system'
            : peer
              ? resolveRelativeFrom(rawFrom, userPnIdentifier, peer)
              : rawFrom.startsWith('pn-')
                ? rawFrom
                : this.normalizeToPnIdentifier(rawFrom);
        const cryptoVersion = row[6] ? parseInt(String(row[6]), 10) : 2;
        const mediaFileId = row[7]?.trim() || undefined;
        const mediaMimeType = row[8]?.trim() || undefined;
        const mediaBackend = row[9]?.trim() || undefined;
        return {
          messageId: row[3] || `msg-${actualIndex}`,
          fromPnIdentifier,
          toPnIdentifier: '',
          content: '',
          encryptedContent: row[1] || '',
          cryptoVersion: Number.isNaN(cryptoVersion) ? 2 : cryptoVersion,
          timestamp: row[2] || new Date().toISOString(),
          read: row[4] === 'true',
          readAt: row[5] || undefined,
          ...(mediaFileId ? { mediaFileId } : {}),
          ...(mediaBackend ? { mediaBackend } : {}),
          ...(mediaMimeType ? { mediaMimeType } : {})
        };
      });
      return { messages, total };
    }

    const decryptStart = Date.now();
    const { MessageEncryption } = await import('../utils/messageEncryption');
    
    // Track iteration counts for debugging
    const iterationCounts: { [key: number]: number } = {};
    
    // Process all messages in parallel (each has its own salt, so PBKDF2 runs independently)
    const messages: Message[] = await Promise.all(
      rowsToProcess.map(async (row, relativeIndex) => {
        // Messages are stored newest first (row 2 is newest), so index is just offset + relativeIndex
        const actualIndex = offset + relativeIndex;
        const encryptedContent = row[1] || '';
        let decryptedContent = '';
        
        // Check if content is encrypted or plain text
        const isEncrypted = MessageEncryption.isEncrypted(encryptedContent);
        
        if (isEncrypted && sharedSecret && sharedSecret !== '') {
          try {
            // Check iteration count before decryption (for debugging)
            try {
              const payloadJson = Buffer.from(encryptedContent, 'base64').toString('utf8');
              const payload = JSON.parse(payloadJson);
              const iterations = payload.iterations ?? 1000000; // Default to 1M for legacy
              iterationCounts[iterations] = (iterationCounts[iterations] || 0) + 1;
            } catch {
              // Ignore parsing errors
            }
            
            // Decrypt message content (PBKDF2 runs in parallel for all messages via Promise.all)
            decryptedContent = await MessageEncryption.decryptMessage(
              encryptedContent,
              connectionId,
              sharedSecret
            );
          } catch (decryptError: any) {
            // Log detailed error for debugging
            console.error(`[MessageSheetsService] Failed to decrypt message ${row[3] || actualIndex}:`, {
              error: decryptError?.message || 'Unknown error',
              connectionId,
              hasSharedSecret: !!sharedSecret,
              encryptedContentLength: encryptedContent.length,
              encryptedContentPreview: encryptedContent.substring(0, 50),
              messageId: row[3] || actualIndex,
              fromPnIdentifier: row[0] || ''
            });
            // If decryption fails, this message was likely encrypted with a different connectionId/sharedSecret
            // (e.g., from before reconnection). Skip it rather than showing an error message.
            // Return null to filter it out, or show a generic message
            decryptedContent = '[Message from previous connection - cannot decrypt]';
          }
        } else {
          // Plain text message (system messages or old messages without encryption)
          // Only treat as plain text if it doesn't look like encrypted JSON
          if (MessageEncryption.isEncrypted(encryptedContent)) {
            // This is encrypted but we don't have a shared secret
            messagingLog.warn(`[MessageSheetsService] Encrypted message found but no shared secret available for message ${row[3] || actualIndex}`);
            decryptedContent = '[Message requires connection to decrypt. Please reconnect with this user.]';
          } else {
            decryptedContent = encryptedContent;
          }
        }
        
        // Use pn identifier directly (normalization only for legacy data compatibility)
        const fromPnIdentifier = row[0] || '';
        // Normalize only if needed for legacy data compatibility
        const normalizedFromPnIdentifier = fromPnIdentifier.startsWith('pn-') ? fromPnIdentifier : this.normalizeToPnIdentifier(fromPnIdentifier);
        
        const mediaFileId = row[7]?.trim() || undefined;
        const mediaMimeType = row[8]?.trim() || undefined;
        const mediaBackend = row[9]?.trim() || undefined;
        return {
          messageId: row[3] || `msg-${actualIndex}`,
          fromPnIdentifier: normalizedFromPnIdentifier,
          toPnIdentifier: '', // Will be set by caller based on conversation
          content: decryptedContent,
          timestamp: row[2] || new Date().toISOString(),
          read: row[4] === 'true',
          readAt: row[5] || undefined,
          ...(mediaFileId ? { mediaFileId } : {}),
          ...(mediaBackend ? { mediaBackend } : {}),
          ...(mediaMimeType ? { mediaMimeType } : {})
        };
      })
    );
    const decryptionTime = Date.now() - decryptStart;
    const iterationSummary = Object.entries(iterationCounts)
      .map(([iterations, count]) => `${count} msg(s) @ ${iterations === '100000' ? '100k' : iterations === '1000000' ? '1M' : iterations} iter`)
      .join(', ');
    messagingLog.debug(`[MessageSheetsService] Decryption of ${rowsToProcess.length} messages took ${decryptionTime}ms${iterationSummary ? ` (${iterationSummary})` : ''}`);

    // Messages are already sorted newest first (stored that way), no need to sort

    return {
      messages,
      total
    };
  }

  /**
   * Mark message as read (bounded column-D lookup; newest messages at row 2).
   */
  static async markAsRead(
    token: GoogleDriveToken,
    spreadsheetId: string,
    messageId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    searchWindow = 20
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await MsgPortable.markAsReadPortable(userPnIdentifier, spreadsheetId, [messageId], accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    let rowIndex = -1;
    let scanned = 0;
    const maxScan = Math.max(searchWindow, 100);

    while (rowIndex === -1 && scanned < maxScan) {
      const batchSize = Math.min(20, maxScan - scanned);
      const startRow = 2 + scanned;
      const endRow = startRow + batchSize - 1;
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `Messages!D${startRow}:D${endRow}`,
        });
        const ids = response.data.values || [];
        rowIndex = ids.findIndex((row) => row[0] === messageId);
        if (rowIndex !== -1) {
          rowIndex += scanned;
          break;
        }
        if (ids.length < batchSize) {
          break;
        }
        scanned += batchSize;
      } catch (err: unknown) {
        rethrowIfSheetsQuota(err);
        throw err;
      }
    }

    if (rowIndex === -1) {
      throw new Error('Message not found');
    }

    const readAt = new Date().toISOString();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Messages!E${rowIndex + 2}:F${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['true', readAt]],
      },
    });
  }

  /**
   * Delete a message row from a conversation sheet (matches Message ID in column D).
   */
  static async deleteMessageFromConversation(
    token: GoogleDriveToken,
    spreadsheetId: string,
    messageId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<{ mediaFileId?: string }> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const result = await MsgPortable.deleteMessageFromConversationPortable(
        userPnIdentifier,
        spreadsheetId,
        messageId,
        accountId
      );
      if (!result.deleted) throw new Error('Message not found');
      return { ...(result.mediaFileId ? { mediaFileId: result.mediaFileId } : {}) };
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Messages!A2:I'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[3] === messageId);

    if (rowIndex === -1) {
      throw new Error('Message not found');
    }

    const mediaFileId = rows[rowIndex]?.[7]?.trim() || undefined;

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });
    const messagesSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'Messages');
    const sheetId = messagesSheet?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      throw new Error('Messages sheet not found');
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2
              }
            }
          }
        ]
      }
    });

    return { ...(mediaFileId ? { mediaFileId } : {}) };
  }

  /**
   * Get all conversation sheets for a user
   */
  static async getConversations(
    token: GoogleDriveToken,
    messagesFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<Array<{ otherUserPnIdentifier: string; spreadsheetId: string; lastMessageAt: string }>> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      const rows = await MsgPortable.getConversationsPortable(userPnIdentifier, accountId);
      return rows.map((r) => ({
        otherUserPnIdentifier: r.participantPnIdentifier,
        spreadsheetId: r.spreadsheetId,
        lastMessageAt: r.lastMessageAt
      }));
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    // List all conversation sheets
    const fileQuery = `'${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'conversation-'`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    const conversations: Array<{ otherUserPnIdentifier: string; spreadsheetId: string; lastMessageAt: string }> = [];

    if (searchResponse.data.files) {
      for (const file of searchResponse.data.files) {
        const fileName = file.name || '';
        if (fileName.startsWith('conversation-group-')) continue;

        const token = peerTokenFromConversationFileName(fileName);
        if (!token) {
          messagingLog.warn('[MessageSheetsService] Skipping conversation file with invalid name', { fileName });
          continue;
        }

        // Opaque keys returned as-is; callers resolve via connections. Legacy pn normalized.
        const otherUserPnIdentifier = isOpaquePeerKey(token)
          ? token
          : this.normalizeToPnIdentifier(token);

        if (
          !isOpaquePeerKey(otherUserPnIdentifier) &&
          (otherUserPnIdentifier === 'pn-' || otherUserPnIdentifier.length <= 3)
        ) {
          messagingLog.warn('[MessageSheetsService] Skipping conversation with invalid otherUserPnIdentifier:', {
            fileName,
            otherUserPnIdentifier
          });
          continue;
        }

        const spreadsheetId = file.id!;
        const lastMessageAt = file.modifiedTime || new Date().toISOString();

        conversations.push({
          otherUserPnIdentifier,
          spreadsheetId,
          lastMessageAt
        });
      }
    }

    return conversations;
  }

  /**
   * Merge inbox directory rows with Drive modifiedTime for thread ordering.
   * DMs: member's messages folder. Groups: owner's canonical conversation sheet mtime.
   */
  static async getInboxThreadsSortedByDrive(
    token: GoogleDriveToken,
    messagesFolderId: string,
    inboxSheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    resolveOwnerContext: ResolveOwnerDriveContext
  ): Promise<InboxThreadFromDrive[]> {
    const entries = await this.getInboxEntries(token, inboxSheetId, userPnIdentifier, accountId);

    if (await isPortableStorageProvider(userPnIdentifier)) {
      return entries
        .map((e) => ({
          threadType: e.threadType,
          participantPnIdentifier: e.participantPnIdentifier,
          spreadsheetId: e.spreadsheetId,
          connectionId: e.connectionId,
          lastMessageAt: e.lastMessageAt,
          kemCiphertext: e.kemCiphertext,
          wrappedMessageRootKey: e.wrappedMessageRootKey,
          groupId: e.groupId,
          ownerPnIdentifier: e.ownerPnIdentifier,
        }))
        .sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        );
    }

    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const dmInboxBySheetId = new Map<string, (typeof entries)[number]>();
    const groupEntries: (typeof entries) = [];
    for (const entry of entries) {
      if (entry.threadType === 'group') {
        groupEntries.push(entry);
      } else if (entry.spreadsheetId) {
        dmInboxBySheetId.set(entry.spreadsheetId, entry);
      }
    }

    const threads: InboxThreadFromDrive[] = [];
    const seenDmSheetIds = new Set<string>();

    const searchResponse = await drive.files.list({
      q: `'${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'conversation-'`,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 200,
    });

    for (const file of searchResponse.data.files || []) {
      const fileName = file.name || '';
      if (fileName.startsWith('conversation-group-')) continue;
      const spreadsheetId = file.id;
      if (!spreadsheetId) continue;
      const inboxRow = dmInboxBySheetId.get(spreadsheetId);
      if (!inboxRow) continue;
      seenDmSheetIds.add(spreadsheetId);
      threads.push({
        threadType: 'dm',
        participantPnIdentifier: inboxRow.participantPnIdentifier,
        spreadsheetId,
        connectionId: inboxRow.connectionId,
        lastMessageAt: file.modifiedTime || inboxRow.lastMessageAt,
        kemCiphertext: inboxRow.kemCiphertext,
        wrappedMessageRootKey: inboxRow.wrappedMessageRootKey,
      });
    }

    for (const entry of entries) {
      if (entry.threadType === 'group') continue;
      if (!seenDmSheetIds.has(entry.spreadsheetId)) {
        threads.push({
          threadType: 'dm',
          participantPnIdentifier: entry.participantPnIdentifier,
          spreadsheetId: entry.spreadsheetId,
          connectionId: entry.connectionId,
          lastMessageAt: entry.lastMessageAt,
          kemCiphertext: entry.kemCiphertext,
          wrappedMessageRootKey: entry.wrappedMessageRootKey,
        });
      }
    }

    const {
      getCachedGroupFileMtime,
      setCachedGroupFileMtime,
    } = await import('./messagingReadCache');

    const ownerGroups = new Map<
      string,
      Array<{ spreadsheetId: string; entry: (typeof entries)[number] }>
    >();
    for (const entry of groupEntries) {
      const ownerPn = entry.ownerPnIdentifier || entry.connectionId;
      if (!ownerPn || !entry.spreadsheetId) continue;
      if (!ownerGroups.has(ownerPn)) ownerGroups.set(ownerPn, []);
      ownerGroups.get(ownerPn)!.push({ spreadsheetId: entry.spreadsheetId, entry });
    }

    for (const [ownerPn, items] of ownerGroups) {
      const ownerCtx =
        ownerPn === userPnIdentifier
          ? { token, accountId }
          : await resolveOwnerContext(ownerPn);

      const uniqueSheetIds = [...new Set(items.map((i) => i.spreadsheetId))];
      const mtimeBySheetId = new Map<string, string>();

      if (ownerCtx) {
        const ownerAuth = GoogleOAuth2Helper.createClient(
          ownerCtx.token,
          ownerPn,
          ownerCtx.accountId
        );
        const ownerDrive = google.drive({ version: 'v3', auth: ownerAuth });

        for (const sheetId of uniqueSheetIds) {
          const cached = await getCachedGroupFileMtime(ownerPn, sheetId);
          if (cached) {
            mtimeBySheetId.set(sheetId, cached);
            continue;
          }
          try {
            const meta = await ownerDrive.files.get({
              fileId: sheetId,
              fields: 'modifiedTime',
            });
            const modifiedTime = meta.data.modifiedTime || new Date().toISOString();
            mtimeBySheetId.set(sheetId, modifiedTime);
            await setCachedGroupFileMtime(ownerPn, sheetId, modifiedTime);
          } catch {
            /* use inbox fallback below */
          }
        }
      }

      for (const { spreadsheetId, entry } of items) {
        threads.push({
          threadType: 'group',
          participantPnIdentifier: entry.participantPnIdentifier,
          spreadsheetId,
          connectionId: entry.connectionId,
          lastMessageAt: mtimeBySheetId.get(spreadsheetId) || entry.lastMessageAt,
          groupId: entry.groupId || entry.participantPnIdentifier,
          ownerPnIdentifier: entry.ownerPnIdentifier || entry.connectionId,
        });
      }
    }

    threads.sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
    return threads;
  }

  /**
   * Update inbox entry (upsert) - maintains conversation metadata
   * Sorts by lastMessageAt descending
   * Stores sharedSecret (encrypted) so no connection lookup needed
   */
  static async updateInboxEntry(
    token: GoogleDriveToken,
    inboxSheetId: string,
    participantPnIdentifier: string,
    spreadsheetId: string,
    connectionId: string,
    lastMessageAt: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    lastMessagePreview?: string,
    kemCiphertext?: string,
    wrappedMessageRootKey?: string
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await MsgPortable.updateInboxEntryPortable(
        userPnIdentifier,
        {
          participantPnIdentifier,
          spreadsheetId,
          connectionId,
          lastMessageAt,
          lastMessagePreview,
          kemCiphertext,
          wrappedMessageRootKey
        },
        accountId
      );
      return;
    }
    try {
      await this.ensureInboxWrappedRootColumn(token, inboxSheetId, userPnIdentifier, accountId);
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A2:H'
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === participantPnIdentifier);
      const existing = rowIndex !== -1 ? rows[rowIndex] : undefined;

      const newRow = [
        participantPnIdentifier,
        spreadsheetId,
        connectionId,
        lastMessageAt,
        lastMessagePreview || '',
        kemCiphertext !== undefined ? kemCiphertext : (existing?.[5] || ''),
        existing?.[6] || 'dm',
        wrappedMessageRootKey !== undefined
          ? wrappedMessageRootKey
          : (existing?.[7] || '')
      ];

      if (rowIndex !== -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: inboxSheetId,
          range: `Inbox!A${rowIndex + 2}:H${rowIndex + 2}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [newRow]
          }
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId: inboxSheetId,
          range: 'Inbox!A:H',
          valueInputOption: 'RAW',
          requestBody: {
            values: [newRow]
          }
        });
      }
    } catch (error: any) {
      console.error('[MessageSheetsService] Error updating inbox entry:', {
        inboxSheetId,
        participantPnIdentifier,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /** Retry transient Google Sheets failures when upserting inbox rows. */
  static async updateInboxEntryWithRetry(
    token: GoogleDriveToken,
    inboxSheetId: string,
    participantPnIdentifier: string,
    spreadsheetId: string,
    connectionId: string,
    lastMessageAt: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    lastMessagePreview?: string,
    kemCiphertext?: string,
    wrappedMessageRootKey?: string,
    maxAttempts = 3
  ): Promise<void> {
    const { withGoogleRetry } = await import('./googleApiRetry');
    await withGoogleRetry(
      'updateInboxEntry',
      () =>
        this.updateInboxEntry(
          token,
          inboxSheetId,
          participantPnIdentifier,
          spreadsheetId,
          connectionId,
          lastMessageAt,
          userPnIdentifier,
          accountId,
          lastMessagePreview,
          kemCiphertext,
          wrappedMessageRootKey
        ),
      maxAttempts
    );
  }

  /**
   * Remove inbox entry for a conversation
   */
  static async removeInboxEntry(
    token: GoogleDriveToken,
    inboxSheetId: string,
    participantPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await MsgPortable.removeInboxEntryPortable(userPnIdentifier, participantPnIdentifier, accountId);
      return;
    }
    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Read all rows to find entry
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A2:E'
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === participantPnIdentifier);

      if (rowIndex !== -1) {
        // Get the actual sheet ID for the "Inbox" sheet
        const spreadsheet = await sheets.spreadsheets.get({
          spreadsheetId: inboxSheetId,
          fields: 'sheets.properties'
        });

        const inboxSheet = spreadsheet.data.sheets?.find(
          sheet => sheet.properties?.title === 'Inbox'
        );

        if (!inboxSheet?.properties?.sheetId) {
          throw new Error('Inbox sheet not found in spreadsheet');
        }

        const actualSheetId = inboxSheet.properties.sheetId;

        // Delete row (rowIndex + 1 because we're using 0-based index and skipping header)
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: inboxSheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: actualSheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex + 1, // +1 because header is row 0, data starts at row 1
                  endIndex: rowIndex + 2
                }
              }
            }]
          }
        });
        messagingLog.debug(`[MessageSheetsService] Removed inbox entry for ${participantPnIdentifier}`);
      } else {
        messagingLog.warn(`[MessageSheetsService] Inbox entry not found for ${participantPnIdentifier}`);
      }
    } catch (error: any) {
      console.error('[MessageSheetsService] Error removing inbox entry:', {
        inboxSheetId,
        participantPnIdentifier,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /**
   * Get all conversations from inbox sheet
   */
  static async getInboxConversations(
    token: GoogleDriveToken,
    inboxSheetId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<Array<{
    threadType: 'dm' | 'group';
    participantPnIdentifier: string;
    spreadsheetId: string;
    connectionId: string;
    lastMessageAt: string;
    lastMessagePreview?: string;
    kemCiphertext?: string;
    wrappedMessageRootKey?: string;
    groupId?: string;
    ownerPnIdentifier?: string;
  }>> {
    try {
      const entries = await this.getInboxEntries(token, inboxSheetId, userPnIdentifier, accountId);
      return entries.map((e) => ({
        threadType: e.threadType,
        participantPnIdentifier: e.participantPnIdentifier,
        spreadsheetId: e.spreadsheetId,
        connectionId: e.connectionId,
        lastMessageAt: e.lastMessageAt,
        lastMessagePreview: e.lastMessagePreview,
        kemCiphertext: e.kemCiphertext,
        wrappedMessageRootKey: e.wrappedMessageRootKey,
        groupId: e.groupId,
        ownerPnIdentifier: e.ownerPnIdentifier
      }));
    } catch (error: any) {
      console.error('[MessageSheetsService] Error reading inbox conversations:', {
        inboxSheetId,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /**
   * Get single conversation from inbox by participant (optimized - reads only first N rows)
   * Assumes inbox is sorted by lastMessageAt descending (newest first)
   * This is much faster than reading the entire inbox sheet when you only need one conversation
   */
  static async getInboxConversationByParticipant(
    token: GoogleDriveToken,
    inboxSheetId: string,
    participantPnIdentifier: string,
    userPnIdentifier: string,
    accountId?: string,
    maxRowsToRead: number = 50 // Only read first 50 rows (most recent conversations)
  ): Promise<{
    participantPnIdentifier: string;
    spreadsheetId: string;
    connectionId: string;
    lastMessageAt: string;
    lastMessagePreview?: string;
    kemCiphertext?: string;
    wrappedMessageRootKey?: string;
  } | null> {
    try {
      if (await isPortableStorageProvider(userPnIdentifier)) {
        const row = await MsgPortable.getInboxConversationByParticipantPortable(
          userPnIdentifier,
          participantPnIdentifier,
          accountId
        );
        if (!row) return null;
        return {
          participantPnIdentifier: row.participantPnIdentifier,
          spreadsheetId: row.spreadsheetId,
          connectionId: row.connectionId,
          lastMessageAt: row.lastMessageAt,
          lastMessagePreview: row.lastMessagePreview,
          kemCiphertext: row.kemCiphertext,
          wrappedMessageRootKey: row.wrappedMessageRootKey
        };
      }
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      const endRow = maxRowsToRead + 1;
      const range = `Inbox!A2:H${endRow}`;
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range
      });

      const rows = response.data.values || [];
      
      for (const row of rows) {
        if (row[0] === participantPnIdentifier) {
          return {
            participantPnIdentifier: row[0] || '',
            spreadsheetId: row[1] || '',
            connectionId: row[2] || '',
            lastMessageAt: row[3] || new Date().toISOString(),
            lastMessagePreview: row[4] || undefined,
            kemCiphertext: row[5] || undefined,
            wrappedMessageRootKey: row[7] || undefined
          };
        }
      }
      
      return null; // Not found in first N rows
    } catch (error: any) {
      console.error('[MessageSheetsService] Error reading inbox conversation by participant:', {
        inboxSheetId,
        participantPnIdentifier,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /**
   * Count unread messages in a conversation sheet (newest-first storage).
   */
  static async countUnreadMessages(
    token: GoogleDriveToken,
    spreadsheetId: string,
    viewerPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    maxRows = 100
  ): Promise<number> {
    try {
      if (await isPortableStorageProvider(userPnIdentifier)) {
        return MsgPortable.countUnreadMessagesPortable(
          userPnIdentifier,
          spreadsheetId,
          viewerPnIdentifier,
          accountId
        );
      }
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Messages!A2:G${maxRows + 1}`
      });
      const rows = response.data.values || [];
      let count = 0;
      for (const row of rows) {
        const from = String(row[1] || '');
        const readVal = String(row[5] || '').toLowerCase();
        const isRead = readVal === 'true' || readVal === '1';
        if (from && from !== viewerPnIdentifier && !isRead) {
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Delete conversation sheet for a user
   * Only deletes the requesting user's file, not the other user's file
   */
  static async deleteConversation(
    token: GoogleDriveToken,
    messagesFolderId: string,
    otherUserPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    // Use pn identifier directly (already normalized)
    try {
      if (await isPortableStorageProvider(userPnIdentifier)) {
        await MsgPortable.deleteConversationPortable(
          userPnIdentifier,
          MsgPortable.portableConversationSheetId(userPnIdentifier, otherUserPnIdentifier),
          accountId
        );
        await MsgPortable.removeInboxEntryPortable(userPnIdentifier, otherUserPnIdentifier, accountId);
        return;
      }
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const drive = google.drive({ version: 'v3', auth });

      const candidates = [
        conversationFileNameFromPeerToken(userPnIdentifier, otherUserPnIdentifier),
        ...(isOpaquePeerKey(otherUserPnIdentifier)
          ? []
          : [legacyConversationFileName(otherUserPnIdentifier)]),
      ];

      for (const sheetFileName of candidates) {
        const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
        const searchResponse = await drive.files.list({
          q: fileQuery,
          fields: 'files(id,name)',
          pageSize: 1
        });

        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
          const fileId = searchResponse.data.files[0].id!;
          await drive.files.delete({ fileId });
          messagingLog.debug(`[MessageSheetsService] Deleted conversation sheet ${fileId} for ${otherUserPnIdentifier}`);
          return;
        }
      }
      messagingLog.warn(`[MessageSheetsService] Conversation sheet not found for ${otherUserPnIdentifier}`);
    } catch (error: any) {
      console.error('[MessageSheetsService] Error deleting conversation sheet:', {
        otherUserPnIdentifier,
        messagesFolderId,
        error: error?.message,
        status: error?.response?.status
      });
      throw error;
    }
  }

  /**
   * Restore conversation by copying messages from other user's conversation file
   * Used when reconnecting after one user deleted their conversation
   */
  static async restoreConversationFromOtherUser(
    userToken: GoogleDriveToken,
    userMessagesFolderId: string,
    otherUserToken: GoogleDriveToken,
    otherUserMessagesFolderId: string,
    otherUserPnIdentifier: string,
    connectionId: string,
    sharedSecret: string, // Decrypted shared secret
    userPnIdentifier: string,
    userAccountId: string | undefined,
    otherUserPnIdentifierForAuth: string,
    otherUserAccountId: string | undefined
  ): Promise<string> {
    // Use pn identifier directly (already normalized)
    try {
      if (await isPortableStorageProvider(userPnIdentifier)) {
        return MsgPortable.createConversationSheetPortable(userPnIdentifier, otherUserPnIdentifier);
      }
      const auth = GoogleOAuth2Helper.createClient(userToken, userPnIdentifier, userAccountId);
      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Check if other user's conversation file exists (opaque or legacy)
      const otherCandidates = [
        conversationFileName(otherUserPnIdentifierForAuth, userPnIdentifier),
        legacyConversationFileName(userPnIdentifier),
      ];
      const otherAuth = GoogleOAuth2Helper.createClient(otherUserToken, otherUserPnIdentifierForAuth, otherUserAccountId);
      const otherDrive = google.drive({ version: 'v3', auth: otherAuth });
      const otherSheets = google.sheets({ version: 'v4', auth: otherAuth });

      let otherUserFileResponse: { data: { files?: Array<{ id?: string | null; name?: string | null }> } } = {
        data: { files: [] },
      };
      for (const otherUserSheetFileName of otherCandidates) {
        const otherUserFileQuery = `name='${otherUserSheetFileName}' and '${otherUserMessagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
        otherUserFileResponse = await otherDrive.files.list({
          q: otherUserFileQuery,
          fields: 'files(id,name)',
          pageSize: 1
        });
        if (otherUserFileResponse.data.files?.length) break;
      }

      if (!otherUserFileResponse.data.files || otherUserFileResponse.data.files.length === 0) {
        // Other user's file doesn't exist, create empty conversation sheet
        messagingLog.debug(`[MessageSheetsService] Other user's conversation file not found, creating empty sheet`);
        return await this.createConversationSheet(userToken, userMessagesFolderId, otherUserPnIdentifier, userPnIdentifier, userAccountId);
      }

      const otherUserSheetId = otherUserFileResponse.data.files[0].id!;

      // Get all messages from other user's sheet
      const otherMessagesResponse = await otherSheets.spreadsheets.values.get({
        spreadsheetId: otherUserSheetId,
        range: 'Messages!A2:I' // Skip header
      });

      const otherMessages = otherMessagesResponse.data.values || [];

      if (otherMessages.length === 0) {
        // No messages to restore, create empty sheet
        messagingLog.debug(`[MessageSheetsService] Other user's conversation file is empty, creating empty sheet`);
        return await this.createConversationSheet(userToken, userMessagesFolderId, otherUserPnIdentifier, userPnIdentifier, userAccountId);
      }

      // Create new conversation sheet for user
      const userSheetId = await this.createConversationSheet(userToken, userMessagesFolderId, otherUserPnIdentifier, userPnIdentifier, userAccountId);

      // Filter messages: only restore plain text messages (system messages)
      // Encrypted messages were encrypted with the old connectionId/sharedSecret and cannot be decrypted
      // with the new connectionId/sharedSecret, so we skip them
      const { MessageEncryption } = await import('../utils/messageEncryption');
      const plainTextMessages = otherMessages.filter(row => {
        const content = row[1] || '';
        const fromPnIdentifier = row[0] || '';
        // Only restore system messages or plain text messages (not encrypted)
        return fromPnIdentifier === 'system' || !MessageEncryption.isEncrypted(content);
      });

      if (plainTextMessages.length === 0) {
        messagingLog.debug(`[MessageSheetsService] No plain text messages to restore (all were encrypted with old connection), creating empty sheet`);
        return userSheetId;
      }

      // Copy only plain text messages to user's sheet
      const values = plainTextMessages.map(row => [
        row[0] || '', // fromPnIdentifier
        row[1] || '', // content (plain text, can be copied as-is)
        row[2] || '', // timestamp
        row[3] || '', // messageId
        row[4] || 'false', // read
        row[5] || '' // readAt
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: userSheetId,
        range: 'Messages!A:H',
        valueInputOption: 'RAW',
        requestBody: {
          values: values
        }
      });

      messagingLog.debug(`[MessageSheetsService] Restored ${values.length} plain text messages from ${otherUserPnIdentifier}'s conversation file (skipped ${otherMessages.length - plainTextMessages.length} encrypted messages)`);
      return userSheetId;
    } catch (error: any) {
      console.error('[MessageSheetsService] Error restoring conversation from other user:', {
        otherUserPnIdentifier,
        userMessagesFolderId,
        otherUserMessagesFolderId,
        error: error?.message,
        status: error?.response?.status
      });
      // If restoration fails, still return a sheet ID (create empty one)
      try {
        return await this.createConversationSheet(userToken, userMessagesFolderId, otherUserPnIdentifier, userPnIdentifier, userAccountId);
      } catch (createError: any) {
        console.error('[MessageSheetsService] Failed to create empty sheet after restoration failure:', createError);
        throw error; // Throw original error
      }
    }
  }

  private static readonly INBOX_HEADERS_WITH_THREAD = [
    'participantPnIdentifier',
    'spreadsheetId',
    'connectionId',
    'lastMessageAt',
    'lastMessagePreview',
    'kemCiphertext',
    'threadType',
    'wrappedMessageRootKey'
  ];

  static async ensureInboxThreadTypeColumn(
    token: GoogleDriveToken,
    inboxSheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return;
    }
    if (this.inboxThreadTypeEnsured.has(inboxSheetId)) {
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const hdr = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A1:G1'
      });
      const row = hdr.data.values?.[0] || [];
      if (row[6] === 'threadType') {
        this.inboxThreadTypeEnsured.add(inboxSheetId);
        return;
      }
    } catch {
      /* migrate */
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: inboxSheetId,
      range: 'Inbox!A1:G1',
      valueInputOption: 'RAW',
      requestBody: { values: [this.INBOX_HEADERS_WITH_THREAD.slice(0, 7)] }
    });
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: inboxSheetId,
      range: 'Inbox!A2:F'
    });
    const rows = data.data.values || [];
    if (rows.length > 0) {
      const withType = rows.map((r) => [...r, 'dm']);
      await sheets.spreadsheets.values.clear({ spreadsheetId: inboxSheetId, range: 'Inbox!A2:G' });
      await sheets.spreadsheets.values.update({
        spreadsheetId: inboxSheetId,
        range: `Inbox!A2:G${rows.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: withType }
      });
    }
    this.inboxThreadTypeEnsured.add(inboxSheetId);
  }

  static async ensureInboxWrappedRootColumn(
    token: GoogleDriveToken,
    inboxSheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return;
    }
    if (this.inboxWrappedRootEnsured.has(inboxSheetId)) {
      return;
    }
    await this.ensureInboxThreadTypeColumn(token, inboxSheetId, userPnIdentifier, accountId);
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    try {
      const hdr = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A1:H1'
      });
      const row = hdr.data.values?.[0] || [];
      if (row[7] === 'wrappedMessageRootKey') {
        this.inboxWrappedRootEnsured.add(inboxSheetId);
        return;
      }
    } catch {
      /* migrate */
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: inboxSheetId,
      range: 'Inbox!A1:H1',
      valueInputOption: 'RAW',
      requestBody: { values: [this.INBOX_HEADERS_WITH_THREAD] }
    });
    this.inboxWrappedRootEnsured.add(inboxSheetId);
  }

  static async createGroupConversationSheet(
    token: GoogleDriveToken,
    messagesFolderId: string,
    groupId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.createGroupConversationSheetPortable(groupId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    const sheetFileName = `conversation-group-${groupId}`;

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: sheetFileName },
        sheets: [
          {
            properties: {
              title: 'Messages',
              gridProperties: { rowCount: 10000, columnCount: 7 }
            }
          }
        ]
      }
    });
    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create group conversation sheet');

    const messagesTabGid = spreadsheet.data.sheets?.[0]?.properties?.sheetId;
    if (messagesTabGid !== undefined && messagesTabGid !== null) {
      this.cacheMessagesTabGid(spreadsheetId, messagesTabGid);
    }

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: messagesFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Messages!A1:J1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'User DID',
          'Message Content',
          'Timestamp',
          'Message ID',
          'Read Status',
          'Read At',
          'cryptoVersion',
          'mediaFileId',
          'mediaMimeType',
          'mediaBackend'
        ]]
      }
    });
    return spreadsheetId;
  }

  static async getOrCreateGroupConversationSheet(
    token: GoogleDriveToken,
    messagesFolderId: string,
    groupId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.getOrCreateGroupConversationSheetPortable(groupId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const sheetFileName = `conversation-group-${groupId}`;
    const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const search = await drive.files.list({ q: fileQuery, fields: 'files(id)', pageSize: 1 });
    if (search.data.files?.[0]?.id) {
      return search.data.files[0].id;
    }
    return this.createGroupConversationSheet(token, messagesFolderId, groupId, userPnIdentifier, accountId);
  }

  static async updateGroupInboxEntry(
    token: GoogleDriveToken,
    inboxSheetId: string,
    groupId: string,
    conversationSpreadsheetId: string,
    ownerPnIdentifier: string,
    lastMessageAt: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    lastMessagePreview?: string
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await MsgPortable.updateGroupInboxEntryPortable(
        userPnIdentifier,
        groupId,
        {
          spreadsheetId: conversationSpreadsheetId,
          connectionId: ownerPnIdentifier,
          lastMessageAt,
          lastMessagePreview
        },
        accountId
      );
      return;
    }
    await this.ensureInboxThreadTypeColumn(token, inboxSheetId, userPnIdentifier, accountId);
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: inboxSheetId,
      range: 'Inbox!A2:G'
    });
    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row) => row[0] === groupId && row[6] === 'group');

    const newRow = [
      groupId,
      conversationSpreadsheetId,
      ownerPnIdentifier,
      lastMessageAt,
      lastMessagePreview || '',
      '',
      'group'
    ];

    if (rowIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: inboxSheetId,
        range: `Inbox!A${rowIndex + 2}:G${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A:G',
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] }
      });
    }
  }

  static async getInboxEntries(
    token: GoogleDriveToken,
    inboxSheetId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<
    Array<{
      threadType: 'dm' | 'group';
      participantPnIdentifier: string;
      spreadsheetId: string;
      connectionId: string;
      lastMessageAt: string;
      lastMessagePreview?: string;
      kemCiphertext?: string;
      wrappedMessageRootKey?: string;
      groupId?: string;
      ownerPnIdentifier?: string;
      groupTitle?: string;
    }>
  > {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      return MsgPortable.getInboxEntriesPortable(userPnIdentifier, accountId);
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: inboxSheetId,
      range: 'Inbox!A2:H'
    });
    const rows = response.data.values || [];
    const out: Array<{
      threadType: 'dm' | 'group';
      participantPnIdentifier: string;
      spreadsheetId: string;
      connectionId: string;
      lastMessageAt: string;
      lastMessagePreview?: string;
      kemCiphertext?: string;
      wrappedMessageRootKey?: string;
      groupId?: string;
      ownerPnIdentifier?: string;
      groupTitle?: string;
    }> = [];

    for (const row of rows) {
      const threadType = (row[6] === 'group' ? 'group' : 'dm') as 'dm' | 'group';
      if (threadType === 'group') {
        if (!row[0] || !row[1] || !row[2]) continue;
        out.push({
          threadType: 'group',
          participantPnIdentifier: row[0],
          spreadsheetId: row[1],
          connectionId: row[2],
          lastMessageAt: row[3] || new Date().toISOString(),
          lastMessagePreview: row[4] || undefined,
          kemCiphertext: row[5] || undefined,
          wrappedMessageRootKey: row[7] || undefined,
          groupId: row[0],
          ownerPnIdentifier: row[2]
        });
      } else {
        if (!row[0] || !row[1] || !row[2]) continue;
        out.push({
          threadType: 'dm',
          participantPnIdentifier: row[0],
          spreadsheetId: row[1],
          connectionId: row[2],
          lastMessageAt: row[3] || new Date().toISOString(),
          lastMessagePreview: row[4] || undefined,
          kemCiphertext: row[5] || undefined,
          wrappedMessageRootKey: row[7] || undefined
        });
      }
    }
    return out;
  }

  /**
   * Bulk-replace conversation messages (migration / relay ciphertext as-is).
   */
  static async setAllConversationMessages(
    token: GoogleDriveToken,
    spreadsheetId: string,
    messages: Message[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    if (await isPortableStorageProvider(userPnIdentifier)) {
      await MsgPortable.writeConversationLines(userPnIdentifier, spreadsheetId, messages, accountId);
      return;
    }
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Messages!A2:J' });
    if (messages.length === 0) return;
    const values = messages.map((message) => {
      const encryptedContent =
        message.cryptoVersion === 2 && message.encryptedContent
          ? message.encryptedContent
          : message.fromPnIdentifier === 'system'
            ? message.content
            : message.encryptedContent || message.content;
      const cryptoVersion = message.cryptoVersion ?? (message.encryptedContent ? 2 : 0);
      return [
        message.fromPnIdentifier,
        encryptedContent,
        message.timestamp,
        message.messageId,
        message.read ? 'true' : 'false',
        message.readAt || '',
        cryptoVersion ? String(cryptoVersion) : '',
        message.mediaFileId || '',
        message.mediaMimeType || '',
        message.mediaBackend || ''
      ];
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Messages!A2:J${messages.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  }

  static async setAllInboxEntries(
    token: GoogleDriveToken,
    inboxSheetId: string,
    entries: Array<{
      participantPnIdentifier: string;
      spreadsheetId: string;
      connectionId: string;
      lastMessageAt: string;
      lastMessagePreview?: string;
      kemCiphertext?: string;
      wrappedMessageRootKey?: string;
      threadType?: 'dm' | 'group';
      groupId?: string;
      ownerPnIdentifier?: string;
    }>,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<void> {
    await this.ensureInboxWrappedRootColumn(token, inboxSheetId, userPnIdentifier, accountId);
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId: inboxSheetId, range: 'Inbox!A2:H' });
    if (entries.length === 0) return;
    const rows = entries.map((e) => {
      const threadType = e.threadType ?? 'dm';
      if (threadType === 'group') {
        return [
          e.groupId || e.participantPnIdentifier,
          e.spreadsheetId,
          e.ownerPnIdentifier || e.connectionId,
          e.lastMessageAt,
          e.lastMessagePreview || '',
          e.kemCiphertext || '',
          'group',
          e.wrappedMessageRootKey || ''
        ];
      }
      return [
        e.participantPnIdentifier,
        e.spreadsheetId,
        e.connectionId,
        e.lastMessageAt,
        e.lastMessagePreview || '',
        e.kemCiphertext || '',
        'dm',
        e.wrappedMessageRootKey || ''
      ];
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: inboxSheetId,
      range: 'Inbox!A2:H',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });
  }
}
