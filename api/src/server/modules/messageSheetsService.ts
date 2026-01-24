/**
 * Message Sheets Service
 * Manages messages in Google Sheets (one sheet file per conversation)
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';

export interface Message {
  messageId: string;
  fromDid: string;
  toDid: string;
  content: string;
  timestamp: string;
  read: boolean;
  readAt?: string;
  mediaFileId?: string;
}

export class MessageSheetsService {
  private static readonly MESSAGES_FOLDER_NAME = 'par-noir-messages';

  /**
   * Get or create messages folder in user's Google Drive
   */
  static async getOrCreateMessagesFolder(
    accessToken: string,
    pnFolderId: string
  ): Promise<string> {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
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
    accessToken: string,
    messagesFolderId: string,
    otherUserDid: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const sheetFileName = `conversation-${otherUserDid}`;
    const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      console.log(`[MessageSheetsService] Found existing conversation sheet for ${otherUserDid}: ${searchResponse.data.files[0].id}`);
      return searchResponse.data.files[0].id!;
    }

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Create conversation sheet for a specific user
   */
  static async createConversationSheet(
    accessToken: string,
    messagesFolderId: string,
    otherUserDid: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const sheetFileName = `conversation-${otherUserDid}`;

    // Create new conversation sheet
    console.log(`[MessageSheetsService] Creating new conversation sheet for ${otherUserDid}`);
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
        otherUserDid,
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
    accessToken: string,
    spreadsheetId: string,
    message: Message,
    connectionId: string,
    sharedSecret: string // Decrypted shared secret
  ): Promise<void> {
    try {
      // Validation checks
      if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length === 0) {
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
      if (message.fromDid === 'system' || !sharedSecret || sharedSecret === '') {
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

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const sheets = google.sheets({ version: 'v4', auth });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Messages!A:F',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            message.fromDid,
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
        fromDid: message.fromDid,
        toDid: message.toDid
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
   */
  static async getMessages(
    accessToken: string,
    spreadsheetId: string,
    connectionId: string,
    sharedSecret: string, // Decrypted shared secret
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ messages: Message[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // First, get total count (cheap - only reads column A)
    const countResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Messages!A2:A'
    });
    
    const total = (countResponse.data.values || []).length;
    
    if (total === 0) {
      return { messages: [], total: 0 };
    }

    // Calculate which rows to fetch for pagination (sorted by newest first)
    // Messages are stored oldest->newest, so reverse the range
    const startRow = Math.max(2, total + 2 - offset - limit); // +2 for header offset
    const endRow = Math.max(2, total + 2 - offset);
    
    // Only fetch the rows we need
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Messages!A${startRow}:F${endRow}`
    });

    const rows = response.data.values || [];

    // Parse and decrypt messages (only the fetched ones)
    const { MessageEncryption } = await import('../utils/messageEncryption');
    const messages: Message[] = rows.map((row, index) => {
      const encryptedContent = row[1] || '';
      let decryptedContent = '';
      
      const isEncrypted = MessageEncryption.isEncrypted(encryptedContent);
      
      if (isEncrypted && sharedSecret && sharedSecret !== '') {
        try {
          decryptedContent = MessageEncryption.decryptMessage(
            encryptedContent,
            connectionId,
            sharedSecret
          );
        } catch (decryptError: any) {
          console.error(`[MessageSheetsService] Failed to decrypt message ${row[3] || index}:`, {
            error: decryptError?.message || 'Unknown error',
            connectionId,
            messageId: row[3] || index
          });
          decryptedContent = '[Message from previous connection - cannot decrypt]';
        }
      } else {
        if (MessageEncryption.isEncrypted(encryptedContent)) {
          decryptedContent = '[Message requires connection to decrypt. Please reconnect with this user.]';
        } else {
          decryptedContent = encryptedContent;
        }
      }
      
      return {
        messageId: row[3] || `msg-${index}`,
        fromDid: row[0] || '',
        toDid: '',
        content: decryptedContent,
        timestamp: row[2] || new Date().toISOString(),
        read: row[4] === 'true',
        readAt: row[5] || undefined
      };
    });

    // Reverse to show newest first
    messages.reverse();

    return { messages, total };
  }

  /**
   * Mark message as read
   */
  static async markAsRead(
    accessToken: string,
    spreadsheetId: string,
    messageId: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
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
    accessToken: string,
    messagesFolderId: string
  ): Promise<Array<{ otherUserDid: string; spreadsheetId: string; lastMessageAt: string }>> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // List all conversation sheets
    const fileQuery = `'${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name contains 'conversation-'`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    const conversations: Array<{ otherUserDid: string; spreadsheetId: string; lastMessageAt: string }> = [];

    if (searchResponse.data.files) {
      for (const file of searchResponse.data.files) {
        const fileName = file.name || '';
        const otherUserDid = fileName.replace('conversation-', '');
        const spreadsheetId = file.id!;

        // Use modifiedTime from Drive API as lastMessageAt (much faster than reading Sheets)
        // modifiedTime is updated whenever the sheet is modified (new message added)
        const lastMessageAt = file.modifiedTime || new Date().toISOString();

        conversations.push({
          otherUserDid,
          spreadsheetId,
          lastMessageAt
        });
      }
    }

    return conversations;
  }

  /**
   * Delete conversation sheet for a user
   * Only deletes the requesting user's file, not the other user's file
   */
  static async deleteConversation(
    accessToken: string,
    messagesFolderId: string,
    otherUserDid: string
  ): Promise<void> {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: 'v3', auth });

      const sheetFileName = `conversation-${otherUserDid}`;
      
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
        console.log(`[MessageSheetsService] Deleted conversation sheet ${fileId} for ${otherUserDid}`);
      } else {
        console.warn(`[MessageSheetsService] Conversation sheet not found for ${otherUserDid}`);
      }
    } catch (error: any) {
      console.error('[MessageSheetsService] Error deleting conversation sheet:', {
        otherUserDid,
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
    userAccessToken: string,
    userMessagesFolderId: string,
    otherUserAccessToken: string,
    otherUserMessagesFolderId: string,
    otherUserDid: string,
    connectionId: string,
    sharedSecret: string // Decrypted shared secret
  ): Promise<string> {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: userAccessToken });
      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Check if other user's conversation file exists
      const otherUserSheetFileName = `conversation-${otherUserDid}`;
      const otherUserFileQuery = `name='${otherUserSheetFileName}' and '${otherUserMessagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
      
      const otherAuth = new google.auth.OAuth2();
      otherAuth.setCredentials({ access_token: otherUserAccessToken });
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
        return await this.createConversationSheet(userAccessToken, userMessagesFolderId, otherUserDid);
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
        return await this.createConversationSheet(userAccessToken, userMessagesFolderId, otherUserDid);
      }

      // Create new conversation sheet for user
      const userSheetId = await this.createConversationSheet(userAccessToken, userMessagesFolderId, otherUserDid);

      // Filter messages: only restore plain text messages (system messages)
      // Encrypted messages were encrypted with the old connectionId/sharedSecret and cannot be decrypted
      // with the new connectionId/sharedSecret, so we skip them
      const { MessageEncryption } = await import('../utils/messageEncryption');
      const plainTextMessages = otherMessages.filter(row => {
        const content = row[1] || '';
        const fromDid = row[0] || '';
        // Only restore system messages or plain text messages (not encrypted)
        return fromDid === 'system' || !MessageEncryption.isEncrypted(content);
      });

      if (plainTextMessages.length === 0) {
        console.log(`[MessageSheetsService] No plain text messages to restore (all were encrypted with old connection), creating empty sheet`);
        return userSheetId;
      }

      // Copy only plain text messages to user's sheet
      const values = plainTextMessages.map(row => [
        row[0] || '', // fromDid
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

      console.log(`[MessageSheetsService] Restored ${values.length} plain text messages from ${otherUserDid}'s conversation file (skipped ${otherMessages.length - plainTextMessages.length} encrypted messages)`);
      return userSheetId;
    } catch (error: any) {
      console.error('[MessageSheetsService] Error restoring conversation from other user:', {
        otherUserDid,
        userMessagesFolderId,
        otherUserMessagesFolderId,
        error: error?.message,
        status: error?.response?.status
      });
      // If restoration fails, still return a sheet ID (create empty one)
      try {
        return await this.createConversationSheet(userAccessToken, userMessagesFolderId, otherUserDid);
      } catch (createError: any) {
        console.error('[MessageSheetsService] Failed to create empty sheet after restoration failure:', createError);
        throw error; // Throw original error
      }
    }
  }
}
