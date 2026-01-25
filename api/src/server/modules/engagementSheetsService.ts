/**
 * Engagement Sheets Service
 * Manages user engagement data in Google Sheets
 * Replaces engagement.json for better scalability
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export interface UserComment {
  fileId: string;
  commentId: string;
  content: string;
  authorName: string;
  timestamp: string;
  parentCommentId?: string;
  likes: string[]; // User DIDs who liked
  postReply?: {
    fileId: string;
    thumbnail?: string;
    title?: string;
  };
}

export class EngagementSheetsService {
  private static readonly ENGAGEMENT_FILE_NAME = 'engagement.xlsx';

  /**
   * Create engagement sheet in _metadata. Used only at Drive connection init.
   */
  static async createEngagementSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.ENGAGEMENT_FILE_NAME },
        sheets: [
          { properties: { title: 'Likes', gridProperties: { rowCount: 100000, columnCount: 2 } } },
          { properties: { title: 'Dislikes', gridProperties: { rowCount: 100000, columnCount: 2 } } },
          { properties: { title: 'Comments', gridProperties: { rowCount: 100000, columnCount: 8 } } },
          { properties: { title: 'Shares', gridProperties: { rowCount: 100000, columnCount: 2 } } },
          { properties: { title: 'Saves', gridProperties: { rowCount: 100000, columnCount: 2 } } }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create engagement sheet: no ID returned');

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Likes!A1:B1', values: [['File ID', 'Timestamp']] },
          { range: 'Dislikes!A1:B1', values: [['File ID', 'Timestamp']] },
          { range: 'Comments!A1:H1', values: [['Comment ID', 'File ID', 'Content', 'Author Name', 'Timestamp', 'Parent Comment ID', 'Likes (JSON)', 'Post Reply (JSON)']] },
          { range: 'Shares!A1:B1', values: [['File ID', 'Timestamp']] },
          { range: 'Saves!A1:B1', values: [['File ID', 'Timestamp']] }
        ]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get engagement sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getEngagementSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.ENGAGEMENT_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Add like
   */
  static async addLike(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Likes!A:B',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[fileId, timestamp]]
      }
    });
  }

  /**
   * Remove like
   */
  static async removeLike(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all likes
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Likes!A2:B'
    });

    if (!response.data.values) {
      return;
    }

    // Find and remove the like
    const rows = response.data.values.filter((row: any[]) => row[0] !== fileId);
    
    // Clear and rewrite
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Likes!A2:B'
    });

    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Likes!A2:B',
        valueInputOption: 'RAW',
        requestBody: {
          values: rows
        }
      });
    }
  }

  /**
   * Get likes
   */
  static async getLikes(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Likes!A2:A'
    });

    if (!response.data.values) {
      return [];
    }

    return response.data.values.map((row: any[]) => row[0] as string).filter(Boolean);
  }

  /**
   * Add dislike
   */
  static async addDislike(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Dislikes!A:B',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[fileId, timestamp]]
      }
    });
  }

  /**
   * Remove dislike
   */
  static async removeDislike(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Dislikes!A2:B'
    });

    if (!response.data.values) {
      return;
    }

    const rows = response.data.values.filter((row: any[]) => row[0] !== fileId);
    
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Dislikes!A2:B'
    });

    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Dislikes!A2:B',
        valueInputOption: 'RAW',
        requestBody: {
          values: rows
        }
      });
    }
  }

  /**
   * Get dislikes
   */
  static async getDislikes(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Dislikes!A2:A'
    });

    if (!response.data.values) {
      return [];
    }

    return response.data.values.map((row: any[]) => row[0] as string).filter(Boolean);
  }

  /**
   * Add comment
   */
  static async addComment(
    token: GoogleDriveToken,
    spreadsheetId: string,
    comment: UserComment,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Comments!A:H',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          comment.commentId,
          comment.fileId,
          comment.content,
          comment.authorName,
          comment.timestamp,
          comment.parentCommentId || '',
          JSON.stringify(comment.likes || []),
          JSON.stringify(comment.postReply || {})
        ]]
      }
    });
  }

  /**
   * Get comments
   */
  static async getComments(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    fileId?: string
  ): Promise<UserComment[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Comments!A2:H'
    });

    if (!response.data.values) {
      return [];
    }

    let comments = response.data.values.map((row: any[]) => {
      const comment: UserComment = {
        commentId: row[0],
        fileId: row[1],
        content: row[2],
        authorName: row[3],
        timestamp: row[4],
        parentCommentId: row[5] || undefined,
        likes: row[6] ? JSON.parse(row[6]) : [],
        postReply: row[7] ? JSON.parse(row[7]) : undefined
      };
      return comment;
    });

    if (fileId) {
      comments = comments.filter(c => c.fileId === fileId);
    }

    return comments;
  }

  /**
   * Add share
   */
  static async addShare(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Shares!A:B',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[fileId, timestamp]]
      }
    });
  }

  /**
   * Get shares
   */
  static async getShares(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Shares!A2:A'
    });

    if (!response.data.values) {
      return [];
    }

    return response.data.values.map((row: any[]) => row[0] as string).filter(Boolean);
  }

  /**
   * Add save
   */
  static async addSave(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const timestamp = new Date().toISOString();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Saves!A:B',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[fileId, timestamp]]
      }
    });
  }

  /**
   * Get saves
   */
  static async getSaves(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Saves!A2:A'
    });

    if (!response.data.values) {
      return [];
    }

    return response.data.values.map((row: any[]) => row[0] as string).filter(Boolean);
  }
}
