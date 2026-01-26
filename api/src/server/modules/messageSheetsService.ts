/**
 * Message Sheets Service
 * Manages messages in Google Sheets (one sheet file per conversation)
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export interface Message {
  messageId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  mediaFileId?: string;
}

export class MessageSheetsService {
  private static readonly MESSAGES_FOLDER_NAME = 'par-noir-messages';
  private static readonly INBOX_SHEET_NAME = 'Inbox';

  /**
   * Normalize identifier to pn-identifier format (for legacy data compatibility only)
   * New code should expect pn identifier already normalized
   */
  private static normalizeToPnIdentifier(pnIdentifier: string): string {
    // For legacy data compatibility - check if already normalized
    return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
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
    // If cached ID provided, return it immediately (no search!)
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
        console.log(`[MessageSheetsService] Found existing Inbox sheet: ${spreadsheetId}`);
        
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
              values: [['participantPnIdentifier', 'spreadsheetId', 'connectionId', 'lastMessageAt', 'lastMessagePreview', 'sharedSecret']]
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
        console.log(`[MessageSheetsService] Found existing Inbox sheet: ${spreadsheetId}`);
        
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
              values: [['participantPnIdentifier', 'spreadsheetId', 'connectionId', 'lastMessageAt', 'lastMessagePreview', 'sharedSecret']]
            }
          });
        }
        
        return spreadsheetId;
      }

      // Create new Inbox sheet
      console.log(`[MessageSheetsService] Creating new Inbox sheet in ${messagesFolderId}`);
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

      console.log(`[MessageSheetsService] Created Inbox sheet: ${spreadsheetId}`);
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
          console.log(`[MessageSheetsService] Found existing messages folder: ${searchResponse.data.files[0].id}`);
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
      console.log(`[MessageSheetsService] Creating new messages folder in ${pnFolderId}`);
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

        console.log(`[MessageSheetsService] Created messages folder: ${folderId}`);
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
    // Use pn identifier directly (already normalized)
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const sheetFileName = `conversation-${otherUserPnIdentifier}`;
    const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      console.log(`[MessageSheetsService] Found existing conversation sheet for ${otherUserPnIdentifier}: ${searchResponse.data.files[0].id}`);
      return searchResponse.data.files[0].id!;
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
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const sheetFileName = `conversation-${otherUserPnIdentifier}`;

    // Create new conversation sheet
    console.log(`[MessageSheetsService] Creating new conversation sheet for ${otherUserPnIdentifier}`);
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
                  columnCount: 6
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

    // Move to messages folder
    try {
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: messagesFolderId,
        fields: 'id, parents'
      });
      console.log(`[MessageSheetsService] Moved conversation sheet ${spreadsheetId} to messages folder`);
    } catch (moveError: any) {
      console.error('[MessageSheetsService] Failed to move conversation sheet to folder:', {
        spreadsheetId,
        messagesFolderId,
        error: moveError?.message,
        status: moveError?.response?.status
      });
      // Don't fail - sheet exists, just not in the right folder
      console.warn('[MessageSheetsService] Continuing despite folder move failure');
    }

    // Set up headers
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Messages!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['User DID', 'Message Content', 'Timestamp', 'Message ID', 'Read Status', 'Read At']]
        }
      });
      console.log(`[MessageSheetsService] Set up headers for conversation sheet ${spreadsheetId}`);
    } catch (headerError: any) {
      console.error('[MessageSheetsService] Failed to set up headers for conversation sheet:', {
        spreadsheetId,
        error: headerError?.message,
        status: headerError?.response?.status
      });
      // Don't fail - headers can be set manually if needed
      console.warn('[MessageSheetsService] Continuing despite header setup failure');
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
    try {
      // Validation checks
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

      // Encrypt message content using connection's shared secret
      // For system messages or if shared secret is empty, store as plain text (backward compatibility)
      let encryptedContent: string;
      if (message.fromPnIdentifier === 'system' || !sharedSecret || sharedSecret === '') {
        // System messages or messages without shared secret are stored as plain text
        encryptedContent = message.content;
      } else {
        const { MessageEncryption } = await import('../utils/messageEncryption');
        encryptedContent = MessageEncryption.encryptMessage(
          message.content,
          connectionId,
          sharedSecret
        );
      }

      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Insert message at row 2 (top of data, after header) - newest messages at top
      // This allows fast reads: just read first N rows, no counting needed
      // Get sheet ID first (needed for batchUpdate)
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const messagesSheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'Messages');
      const sheetId = messagesSheet?.properties?.sheetId || 0;

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
        range: 'Messages!A2:F2',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            message.fromPnIdentifier,
            encryptedContent, // Store encrypted content
            message.timestamp,
            message.messageId,
            message.read ? 'true' : 'false',
            message.readAt || ''
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
    }
  ): Promise<{ messages: Message[]; total: number }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Default to last 10 messages if no limit specified (for initial load)
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
      const range = `Messages!A2:F${endRow}`;
      
      try {
        const sheetsApiStart = Date.now();
        console.log(`[MessageSheetsService] Reading range ${range} from sheet ${spreadsheetId.substring(0, 10)}...`);
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range
        });
        console.log(`[MessageSheetsService] Sheets API call took ${Date.now() - sheetsApiStart}ms, got ${(response.data.values || []).length} rows`);
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
        console.warn('[MessageSheetsService] Failed to read message range, reading all rows:', error?.message);
        // Fallback: read all rows
        const fullResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Messages!A2:F'
        });
        rowsToProcess = fullResponse.data.values || [];
        total = rowsToProcess.length;
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
        // Fallback: read all rows to count
        console.warn('[MessageSheetsService] Failed to get row count, reading all rows:', error?.message);
        const fullResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Messages!A2:F'
        });
        rowsToProcess = fullResponse.data.values || [];
        total = rowsToProcess.length;
      }

      // Calculate which rows to read (with offset, read from startRow to endRow)
      if (rowsToProcess.length === 0 && total > 0) {
        const startRow = 2 + offset; // +2 because row 1 is header, data starts at row 2
        const endRow = startRow + limit - 1;
        
        const range = `Messages!A${startRow}:F${endRow}`;
        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range
          });
          rowsToProcess = response.data.values || [];
        } catch (error: any) {
          console.warn('[MessageSheetsService] Failed to read specific range, reading all rows:', error?.message);
          // Fallback: read all rows
          const fullResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Messages!A2:F'
          });
          rowsToProcess = fullResponse.data.values || [];
          total = rowsToProcess.length;
        }
      } else if (rowsToProcess.length > 0) {
        // Already have all rows from fallback, apply offset/limit
        rowsToProcess = rowsToProcess.slice(offset, offset + limit);
      }
    }

    // Parse and decrypt only the messages we need
    // CRITICAL: Decrypt messages in parallel to avoid sequential PBKDF2 delays
    const decryptStart = Date.now();
    const { MessageEncryption } = await import('../utils/messageEncryption');
    
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
            console.warn(`[MessageSheetsService] Encrypted message found but no shared secret available for message ${row[3] || actualIndex}`);
            decryptedContent = '[Message requires connection to decrypt. Please reconnect with this user.]';
          } else {
            decryptedContent = encryptedContent;
          }
        }
        
        // Use pn identifier directly (normalization only for legacy data compatibility)
        const fromPnIdentifier = row[0] || '';
        // Normalize only if needed for legacy data compatibility
        const normalizedFromPnIdentifier = fromPnIdentifier.startsWith('pn-') ? fromPnIdentifier : this.normalizeToPnIdentifier(fromPnIdentifier);
        
        return {
          messageId: row[3] || `msg-${actualIndex}`,
          fromPnIdentifier: normalizedFromPnIdentifier,
          toPnIdentifier: '', // Will be set by caller based on conversation
          content: decryptedContent,
          timestamp: row[2] || new Date().toISOString(),
          read: row[4] === 'true',
          readAt: row[5] || undefined
        };
      })
    );
    console.log(`[MessageSheetsService] Decryption of ${rowsToProcess.length} messages took ${Date.now() - decryptStart}ms`);

    // Messages are already sorted newest first (stored that way), no need to sort

    return {
      messages,
      total
    };
  }

  /**
   * Mark message as read
   */
  static async markAsRead(
    token: GoogleDriveToken,
    spreadsheetId: string,
    messageId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all messages to find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Messages!A2:F'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[3] === messageId);

    if (rowIndex === -1) {
      throw new Error('Message not found');
    }

    // Update read status (rowIndex + 2 because of header and 0-based index)
    const readAt = new Date().toISOString();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Messages!E${rowIndex + 2}:F${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['true', readAt]]
      }
    });
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
        const extractedOtherUserPnIdentifier = fileName.replace('conversation-', '');
        
        // Skip if filename doesn't contain a valid identifier
        if (!extractedOtherUserPnIdentifier || extractedOtherUserPnIdentifier === fileName) {
          console.warn('[MessageSheetsService] Skipping conversation file with invalid name:', fileName);
          continue;
        }
        
        // Normalize otherUserPnIdentifier when extracting from filename (handles legacy data)
        const normalizedOtherUserPnIdentifier = this.normalizeToPnIdentifier(extractedOtherUserPnIdentifier);
        
        // Ensure normalized identifier is valid (not just 'pn-')
        if (normalizedOtherUserPnIdentifier === 'pn-' || normalizedOtherUserPnIdentifier.length <= 3) {
          console.warn('[MessageSheetsService] Skipping conversation with invalid otherUserPnIdentifier:', { fileName, extractedOtherUserPnIdentifier, normalizedOtherUserPnIdentifier });
          continue;
        }
        
        const spreadsheetId = file.id!;

        // Use modifiedTime from Drive API as lastMessageAt (much faster than reading Sheets)
        // modifiedTime is updated whenever the sheet is modified (new message added)
        const lastMessageAt = file.modifiedTime || new Date().toISOString();

        conversations.push({
          otherUserPnIdentifier: normalizedOtherUserPnIdentifier,
          spreadsheetId,
          lastMessageAt
        });
      }
    }

    return conversations;
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
    sharedSecret?: string // Encrypted shared secret
  ): Promise<void> {
    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Read all rows to find existing entry (include sharedSecret column)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A2:F'
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === participantPnIdentifier);

      const newRow = [
        participantPnIdentifier,
        spreadsheetId,
        connectionId,
        lastMessageAt,
        lastMessagePreview || '',
        sharedSecret || '' // Encrypted shared secret
      ];

      if (rowIndex !== -1) {
        // Update existing row (rowIndex + 2 because of header and 0-based index)
        await sheets.spreadsheets.values.update({
          spreadsheetId: inboxSheetId,
          range: `Inbox!A${rowIndex + 2}:F${rowIndex + 2}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [newRow]
          }
        });
      } else {
        // Append new row
        await sheets.spreadsheets.values.append({
          spreadsheetId: inboxSheetId,
          range: 'Inbox!A:F',
          valueInputOption: 'RAW',
          requestBody: {
            values: [newRow]
          }
        });
      }

      // Re-sort by lastMessageAt descending (most recent first)
      // Read all rows again after update
      const allRowsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A2:F'
      });

      const allRows = allRowsResponse.data.values || [];
      if (allRows.length > 1) {
        // Sort by lastMessageAt (column D, index 3) descending
        allRows.sort((a, b) => {
          const dateA = new Date(a[3] || '').getTime();
          const dateB = new Date(b[3] || '').getTime();
          return dateB - dateA; // Descending
        });

        // Clear and rewrite all rows (maintains sort order)
        // First clear existing data (keep header)
        await sheets.spreadsheets.values.clear({
          spreadsheetId: inboxSheetId,
          range: 'Inbox!A2:F'
        });

        // Write sorted rows
        if (allRows.length > 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: inboxSheetId,
            range: 'Inbox!A2:F',
            valueInputOption: 'RAW',
            requestBody: {
              values: allRows
            }
          });
        }
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
        // Delete row (rowIndex + 2 because of header and 0-based index)
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: inboxSheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: 0, // First sheet
                  dimension: 'ROWS',
                  startIndex: rowIndex + 1, // +1 because header is row 0, data starts at row 1
                  endIndex: rowIndex + 2
                }
              }
            }]
          }
        });
        console.log(`[MessageSheetsService] Removed inbox entry for ${participantPnIdentifier}`);
      } else {
        console.warn(`[MessageSheetsService] Inbox entry not found for ${participantPnIdentifier}`);
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
    participantPnIdentifier: string;
    spreadsheetId: string;
    connectionId: string;
    lastMessageAt: string;
    lastMessagePreview?: string;
    sharedSecret?: string; // Encrypted shared secret
  }>> {
    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Read all rows (already sorted by lastMessageAt descending)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range: 'Inbox!A2:F'
      });

      const rows = response.data.values || [];
      const conversations = rows.map(row => ({
        participantPnIdentifier: row[0] || '',
        spreadsheetId: row[1] || '',
        connectionId: row[2] || '',
        lastMessageAt: row[3] || new Date().toISOString(),
        lastMessagePreview: row[4] || undefined,
        sharedSecret: row[5] || undefined // Encrypted shared secret
      })).filter(conv => conv.participantPnIdentifier && conv.spreadsheetId && conv.connectionId);

      return conversations;
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
    sharedSecret?: string;
  } | null> {
    try {
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const sheets = google.sheets({ version: 'v4', auth });

      // Read only first N rows (most recent conversations are at top)
      const endRow = maxRowsToRead + 1; // +1 for header
      const range = `Inbox!A2:F${endRow}`;
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: inboxSheetId,
        range
      });

      const rows = response.data.values || [];
      
      // Find matching conversation (should be in first N rows if recent)
      for (const row of rows) {
        if (row[0] === participantPnIdentifier) {
          return {
            participantPnIdentifier: row[0] || '',
            spreadsheetId: row[1] || '',
            connectionId: row[2] || '',
            lastMessageAt: row[3] || new Date().toISOString(),
            lastMessagePreview: row[4] || undefined,
            sharedSecret: row[5] || undefined
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
      const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
      const drive = google.drive({ version: 'v3', auth });

      const sheetFileName = `conversation-${otherUserPnIdentifier}`;
      
      // Find the conversation sheet
      const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      const searchResponse = await drive.files.list({
        q: fileQuery,
        fields: 'files(id,name)',
        pageSize: 1
      });

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        const fileId = searchResponse.data.files[0].id!;
        // Delete the file (move to trash)
        await drive.files.delete({
          fileId: fileId
        });
        console.log(`[MessageSheetsService] Deleted conversation sheet ${fileId} for ${otherUserPnIdentifier}`);
      } else {
        console.warn(`[MessageSheetsService] Conversation sheet not found for ${otherUserPnIdentifier}`);
      }
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
      const auth = GoogleOAuth2Helper.createClient(userToken, userPnIdentifier, userAccountId);
      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Check if other user's conversation file exists
      const otherUserSheetFileName = `conversation-${otherUserPnIdentifier}`;
      const otherUserFileQuery = `name='${otherUserSheetFileName}' and '${otherUserMessagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      
      const otherAuth = GoogleOAuth2Helper.createClient(otherUserToken, otherUserPnIdentifierForAuth, otherUserAccountId);
      const otherDrive = google.drive({ version: 'v3', auth: otherAuth });
      const otherSheets = google.sheets({ version: 'v4', auth: otherAuth });

      const otherUserFileResponse = await otherDrive.files.list({
        q: otherUserFileQuery,
        fields: 'files(id,name)',
        pageSize: 1
      });

      if (!otherUserFileResponse.data.files || otherUserFileResponse.data.files.length === 0) {
        // Other user's file doesn't exist, create empty conversation sheet
        console.log(`[MessageSheetsService] Other user's conversation file not found, creating empty sheet`);
        return await this.createConversationSheet(userToken, userMessagesFolderId, otherUserPnIdentifier, userPnIdentifier, userAccountId);
      }

      const otherUserSheetId = otherUserFileResponse.data.files[0].id!;

      // Get all messages from other user's sheet
      const otherMessagesResponse = await otherSheets.spreadsheets.values.get({
        spreadsheetId: otherUserSheetId,
        range: 'Messages!A2:F' // Skip header
      });

      const otherMessages = otherMessagesResponse.data.values || [];

      if (otherMessages.length === 0) {
        // No messages to restore, create empty sheet
        console.log(`[MessageSheetsService] Other user's conversation file is empty, creating empty sheet`);
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
        console.log(`[MessageSheetsService] No plain text messages to restore (all were encrypted with old connection), creating empty sheet`);
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
        range: 'Messages!A:F',
        valueInputOption: 'RAW',
        requestBody: {
          values: values
        }
      });

      console.log(`[MessageSheetsService] Restored ${values.length} plain text messages from ${otherUserPnIdentifier}'s conversation file (skipped ${otherMessages.length - plainTextMessages.length} encrypted messages)`);
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
}
