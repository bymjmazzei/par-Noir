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
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing messages folder
    const folderQuery = `name='${this.MESSAGES_FOLDER_NAME}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: folderQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create messages folder
    const createResponse = await drive.files.create({
      requestBody: {
        name: this.MESSAGES_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pnFolderId]
      },
      fields: 'id'
    });

    return createResponse.data.id!;
  }

  /**
   * Get or create conversation sheet for a specific user
   */
  static async getOrCreateConversationSheet(
    accessToken: string,
    messagesFolderId: string,
    otherUserDid: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const sheetFileName = `conversation-${otherUserDid}`;

    // Search for existing conversation sheet
    const fileQuery = `name='${sheetFileName}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Create new conversation sheet
    const spreadsheet = await sheets.spreadsheets.create({
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

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create conversation sheet: no ID returned');
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
      range: 'Messages!A1:F1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['User DID', 'Message Content', 'Timestamp', 'Message ID', 'Read Status', 'Read At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Append message to conversation sheet
   */
  static async appendMessage(
    accessToken: string,
    spreadsheetId: string,
    message: Message
  ): Promise<void> {
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
          message.content,
          message.timestamp,
          message.messageId,
          message.read ? 'true' : 'false',
          message.readAt || ''
        ]]
      }
    });
  }

  /**
   * Get messages from conversation sheet
   */
  static async getMessages(
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<{ messages: Message[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all messages (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Messages!A2:F'
    });

    const rows = response.data.values || [];
    const total = rows.length;

    // Parse messages
    const messages: Message[] = rows.map((row, index) => ({
      messageId: row[3] || `msg-${index}`,
      fromDid: row[0] || '',
      toDid: '', // Will be set by caller based on conversation
      content: row[1] || '',
      timestamp: row[2] || new Date().toISOString(),
      read: row[4] === 'true',
      readAt: row[5] || undefined
    }));

    // Sort by timestamp descending (most recent first)
    messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedMessages = messages.slice(offset, offset + limit);

    return {
      messages: paginatedMessages,
      total
    };
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
    const sheets = google.sheets({ version: 'v4', auth });

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

        // Get last message timestamp
        try {
          const messagesResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Messages!C2:C'
          });

          const timestamps = messagesResponse.data.values || [];
          const lastMessageAt = timestamps.length > 0 
            ? timestamps[timestamps.length - 1][0] || file.modifiedTime || ''
            : file.modifiedTime || '';

          conversations.push({
            otherUserDid,
            spreadsheetId,
            lastMessageAt
          });
        } catch (error) {
          console.error(`Failed to get last message for conversation ${otherUserDid}:`, error);
          conversations.push({
            otherUserDid,
            spreadsheetId,
            lastMessageAt: file.modifiedTime || ''
          });
        }
      }
    }

    return conversations;
  }
}
