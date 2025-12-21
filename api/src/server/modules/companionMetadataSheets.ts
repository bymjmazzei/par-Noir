/**
 * Companion Metadata Sheets Service
 * Manages companion metadata files as Google Sheets with multiple sheets:
 * - Metadata: File metadata (single row)
 * - Likes: Engagement likes (rows for each like)
 * - Comments: Engagement comments (rows for each comment)
 * - Shares: Engagement shares (rows for each share)
 * 
 * Engagement counts are derived by counting rows in engagement sheets.
 * 
 * SECURITY: Sensitive fields (publicToken, ownerDid, ownerIdentifier) are encrypted
 * before storage to make them machine-readable only.
 */

import { google } from 'googleapis';
import { MetadataEncryption } from '../utils/metadataEncryption';

export interface CompanionMetadata {
  fileId: string;
  googleDriveFileId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  visibility: 'public' | 'private' | 'friends';
  uploadedAt: string;
  owner: {
    did: string;
    identifier: string;
  };
  tags?: string[];
  description?: string;
  thumbnail?: string;
  publicToken?: string;
  engagement?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    lastUpdated: string;
    engagementHistory?: any[];
  };
}

export interface LikeRecord {
  fileId: string;
  pnIdentifier: string;
  timestamp: string;
}

export interface CommentRecord {
  fileId: string;
  commentId: string;
  pnIdentifier: string;
  authorName: string;
  content: string;
  timestamp: string;
}

export interface ShareRecord {
  fileId: string;
  pnIdentifier: string;
  timestamp: string;
}

export interface SaveRecord {
  fileId: string;
  pnIdentifier: string;
  timestamp: string;
}

export class CompanionMetadataSheets {
  /**
   * Create a new companion metadata spreadsheet with all sheets
   */
  static async createSpreadsheet(
    accessToken: string,
    folderId: string,
    fileId: string,
    metadata: CompanionMetadata
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    try {
      // 1. Create the spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `${fileId}.metadata`
          },
          sheets: [
            {
              properties: {
                title: 'Metadata',
                gridProperties: {
                  rowCount: 2,
                  columnCount: 15
                }
              }
            },
            {
              properties: {
                title: 'Likes',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 3
                }
              }
            },
            {
              properties: {
                title: 'Comments',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 6
                }
              }
            },
            {
              properties: {
                title: 'Shares',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 3
                }
              }
            },
            {
              properties: {
                title: 'Saves',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 3
                }
              }
            }
          ]
        }
      });

      const spreadsheetId = spreadsheet.data.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error('Failed to create spreadsheet: no ID returned');
      }

      // 2. Move to metadata folder
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: folderId,
        fields: 'id, parents'
      });

      // 3. Populate Metadata sheet with headers and data
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Metadata!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            // Headers
            [
              'fileId',
              'googleDriveFileId',
              'fileName',
              'originalName',
              'mimeType',
              'size',
              'visibility',
              'uploadedAt',
              'ownerDid',
              'ownerIdentifier',
              'tags',
              'description',
              'thumbnail',
              'publicToken',
              'lastUpdated'
            ],
            // Data row (encrypt sensitive fields)
            [
              metadata.fileId,
              metadata.googleDriveFileId,
              metadata.fileName,
              metadata.originalName,
              metadata.mimeType,
              metadata.size.toString(),
              metadata.visibility,
              metadata.uploadedAt,
              MetadataEncryption.encryptField(metadata.owner.did), // Encrypted
              MetadataEncryption.encryptField(metadata.owner.identifier), // Encrypted
              (metadata.tags || []).join(','),
              metadata.description || '',
              metadata.thumbnail || '',
              MetadataEncryption.encryptField(metadata.publicToken ? (typeof metadata.publicToken === 'string' ? metadata.publicToken : JSON.stringify(metadata.publicToken)) : undefined), // Encrypted
              new Date().toISOString()
            ]
          ]
        }
      });

      // 4. Populate Likes sheet headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Likes!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['fileId', 'pnIdentifier', 'timestamp']
          ]
        }
      });

      // 5. Populate Comments sheet headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Comments!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['fileId', 'commentId', 'pnIdentifier', 'authorName', 'content', 'timestamp']
          ]
        }
      });

      // 6. Populate Shares sheet headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Shares!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['fileId', 'pnIdentifier', 'timestamp']
          ]
        }
      });

      // 7. Populate Saves sheet headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Saves!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['fileId', 'pnIdentifier', 'timestamp']
          ]
        }
      });

      return spreadsheetId;
    } catch (error: any) {
      console.error('Error creating companion metadata spreadsheet:', error);
      throw error;
    }
  }

  /**
   * Find companion metadata spreadsheet by fileId
   */
  static async findSpreadsheet(
    accessToken: string,
    folderId: string,
    fileId: string
  ): Promise<string | null> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth });

    try {
      const query = `name='${fileId}.metadata' and '${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`;
      const response = await drive.files.list({
        q: query,
        fields: 'files(id)',
        pageSize: 1
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id || null;
      }

      return null;
    } catch (error: any) {
      console.error('Error finding companion metadata spreadsheet:', error);
      return null;
    }
  }

  /**
   * Read companion metadata from spreadsheet
   */
  static async readMetadata(
    accessToken: string,
    spreadsheetId: string
  ): Promise<CompanionMetadata | null> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read Metadata sheet
      const metadataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Metadata!A1:O2'
      });

      const rows = metadataResponse.data.values;
      if (!rows || rows.length < 2) {
        return null;
      }

      const headers = rows[0] as string[];
      const data = rows[1] as any[];

      // Map headers to data (decrypt sensitive fields)
      const ownerDidEncrypted = data[headers.indexOf('ownerDid')] || '';
      const ownerIdentifierEncrypted = data[headers.indexOf('ownerIdentifier')] || '';
      const publicTokenEncrypted = data[headers.indexOf('publicToken')] || '';

      const metadata: CompanionMetadata = {
        fileId: data[headers.indexOf('fileId')] || '',
        googleDriveFileId: data[headers.indexOf('googleDriveFileId')] || '',
        fileName: data[headers.indexOf('fileName')] || '',
        originalName: data[headers.indexOf('originalName')] || '',
        mimeType: data[headers.indexOf('mimeType')] || '',
        size: parseInt(data[headers.indexOf('size')] || '0', 10),
        visibility: (data[headers.indexOf('visibility')] || 'private') as 'public' | 'private' | 'friends',
        uploadedAt: data[headers.indexOf('uploadedAt')] || new Date().toISOString(),
        owner: {
          did: MetadataEncryption.decryptField(ownerDidEncrypted), // Decrypted
          identifier: MetadataEncryption.decryptField(ownerIdentifierEncrypted) // Decrypted
        },
        tags: data[headers.indexOf('tags')] ? (data[headers.indexOf('tags')] as string).split(',').filter(Boolean) : [],
        description: data[headers.indexOf('description')] || undefined,
        thumbnail: data[headers.indexOf('thumbnail')] || undefined,
        publicToken: (() => {
          const decrypted = MetadataEncryption.decryptField(publicTokenEncrypted);
          if (!decrypted) return undefined;
          // Try to parse as JSON if it looks like JSON (for backward compatibility)
          try {
            return JSON.parse(decrypted);
          } catch {
            return decrypted; // Return as string if not valid JSON
          }
        })()
      };

      // Derive engagement counts from sheets
      const engagement = await this.getEngagementCounts(accessToken, spreadsheetId);
      metadata.engagement = engagement;

      return metadata;
    } catch (error: any) {
      console.error('Error reading companion metadata:', error);
      return null;
    }
  }

  /**
   * Derive engagement counts by counting rows in engagement sheets
   */
  static async getEngagementCounts(
    accessToken: string,
    spreadsheetId: string
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    lastUpdated: string;
  }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Get all engagement sheet data (excluding headers)
      const [likesResponse, commentsResponse, sharesResponse, savesResponse] = await Promise.all([
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Likes!A2:C'
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Comments!A2:F'
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Shares!A2:C'
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Saves!A2:C'
        }).catch(() => ({ data: { values: undefined } })) // Saves sheet might not exist yet
      ]);

      const likesCount = likesResponse.data.values ? likesResponse.data.values.length : 0;
      const commentsCount = commentsResponse.data.values ? commentsResponse.data.values.length : 0;
      const sharesCount = sharesResponse.data.values ? sharesResponse.data.values.length : 0;
      const savesCount = savesResponse.data.values ? savesResponse.data.values.length : 0;

      // Get most recent timestamp from all engagement sheets
      let lastUpdated = new Date().toISOString();
      
      // Check likes for latest timestamp
      if (likesResponse.data.values && likesResponse.data.values.length > 0) {
        const latestLike = likesResponse.data.values[likesResponse.data.values.length - 1];
        if (latestLike && latestLike[2] && latestLike[2] > lastUpdated) {
          lastUpdated = latestLike[2];
        }
      }

      // Check comments for latest timestamp
      if (commentsResponse.data.values && commentsResponse.data.values.length > 0) {
        const latestComment = commentsResponse.data.values[commentsResponse.data.values.length - 1];
        if (latestComment && latestComment[5] && latestComment[5] > lastUpdated) {
          lastUpdated = latestComment[5];
        }
      }

      // Check shares for latest timestamp
      if (sharesResponse.data.values && sharesResponse.data.values.length > 0) {
        const latestShare = sharesResponse.data.values[sharesResponse.data.values.length - 1];
        if (latestShare && latestShare[2] && latestShare[2] > lastUpdated) {
          lastUpdated = latestShare[2];
        }
      }

      // Check saves for latest timestamp
      if (savesResponse.data.values && savesResponse.data.values.length > 0) {
        const latestSave = savesResponse.data.values[savesResponse.data.values.length - 1];
        if (latestSave && latestSave[2] && latestSave[2] > lastUpdated) {
          lastUpdated = latestSave[2];
        }
      }

      return {
        views: 0, // Views not tracked in sheets currently
        likes: likesCount,
        comments: commentsCount,
        shares: sharesCount,
        saves: savesCount,
        lastUpdated
      };
    } catch (error: any) {
      console.error('Error getting engagement counts:', error);
      return {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Update metadata sheet row
   */
  static async updateMetadata(
    accessToken: string,
    spreadsheetId: string,
    metadata: Partial<CompanionMetadata>
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read current metadata to get headers
      const metadataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Metadata!A1:O2'
      });

      const rows = metadataResponse.data.values;
      if (!rows || rows.length < 2) {
        throw new Error('Metadata sheet not found or invalid');
      }

      const headers = rows[0] as string[];
      const currentData = [...(rows[1] as any[])];

      // Update fields (encrypt sensitive fields)
      if (metadata.visibility !== undefined) {
        const idx = headers.indexOf('visibility');
        if (idx >= 0) currentData[idx] = metadata.visibility;
      }
      if (metadata.description !== undefined) {
        const idx = headers.indexOf('description');
        if (idx >= 0) currentData[idx] = metadata.description || '';
      }
      if (metadata.tags !== undefined) {
        const idx = headers.indexOf('tags');
        if (idx >= 0) currentData[idx] = (metadata.tags || []).join(',');
      }
      if (metadata.thumbnail !== undefined) {
        const idx = headers.indexOf('thumbnail');
        if (idx >= 0) currentData[idx] = metadata.thumbnail || '';
      }
      if (metadata.publicToken !== undefined) {
        const idx = headers.indexOf('publicToken');
        if (idx >= 0) {
          const tokenValue = typeof metadata.publicToken === 'string' 
            ? metadata.publicToken 
            : JSON.stringify(metadata.publicToken);
          currentData[idx] = MetadataEncryption.encryptField(tokenValue); // Encrypted
        }
      }
      // Update owner fields if provided (encrypted)
      if (metadata.owner?.did !== undefined) {
        const idx = headers.indexOf('ownerDid');
        if (idx >= 0) currentData[idx] = MetadataEncryption.encryptField(metadata.owner.did); // Encrypted
      }
      if (metadata.owner?.identifier !== undefined) {
        const idx = headers.indexOf('ownerIdentifier');
        if (idx >= 0) currentData[idx] = MetadataEncryption.encryptField(metadata.owner.identifier); // Encrypted
      }

      // Always update lastUpdated
      const lastUpdatedIdx = headers.indexOf('lastUpdated');
      if (lastUpdatedIdx >= 0) {
        currentData[lastUpdatedIdx] = new Date().toISOString();
      }

      // Write back
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Metadata!A2',
        valueInputOption: 'RAW',
        requestBody: {
          values: [currentData]
        }
      });
    } catch (error: any) {
      console.error('Error updating metadata:', error);
      throw error;
    }
  }

  /**
   * Append a like to the Likes sheet
   */
  static async appendLike(
    accessToken: string,
    spreadsheetId: string,
    like: LikeRecord
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Likes!A2',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[like.fileId, like.pnIdentifier, like.timestamp]]
        }
      });
    } catch (error: any) {
      console.error('Error appending like:', error);
      throw error;
    }
  }

  /**
   * Remove a like from the Likes sheet (by fileId and pnIdentifier)
   */
  static async removeLike(
    accessToken: string,
    spreadsheetId: string,
    fileId: string,
    pnIdentifier: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read all likes
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Likes!A2:C'
      });

      if (!response.data.values) {
        return;
      }

      // Filter out the like to remove
      const filteredLikes = response.data.values.filter((row: any[]) => {
        return !(row[0] === fileId && row[1] === pnIdentifier);
      });

      // Clear and rewrite
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Likes!A2:C'
      });

      if (filteredLikes.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Likes!A2',
          valueInputOption: 'RAW',
          requestBody: {
            values: filteredLikes
          }
        });
      }
    } catch (error: any) {
      console.error('Error removing like:', error);
      throw error;
    }
  }

  /**
   * Append a comment to the Comments sheet
   */
  static async appendComment(
    accessToken: string,
    spreadsheetId: string,
    comment: CommentRecord
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Comments!A2',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[
            comment.fileId,
            comment.commentId,
            comment.pnIdentifier,
            comment.authorName,
            comment.content,
            comment.timestamp
          ]]
        }
      });
    } catch (error: any) {
      console.error('Error appending comment:', error);
      throw error;
    }
  }

  /**
   * Append a share to the Shares sheet
   */
  static async appendShare(
    accessToken: string,
    spreadsheetId: string,
    share: ShareRecord
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Shares!A2',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[share.fileId, share.pnIdentifier, share.timestamp]]
        }
      });
    } catch (error: any) {
      console.error('Error appending share:', error);
      throw error;
    }
  }

  /**
   * Append a save to the Saves sheet
   */
  static async appendSave(
    accessToken: string,
    spreadsheetId: string,
    save: SaveRecord
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Saves!A2',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[save.fileId, save.pnIdentifier, save.timestamp]]
        }
      });
    } catch (error: any) {
      console.error('Error appending save:', error);
      throw error;
    }
  }

  /**
   * Remove a save from the Saves sheet (by fileId and pnIdentifier)
   */
  static async removeSave(
    accessToken: string,
    spreadsheetId: string,
    fileId: string,
    pnIdentifier: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read all saves
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Saves!A2:C'
      });

      if (!response.data.values) {
        return;
      }

      // Filter out the save to remove
      const filteredSaves = response.data.values.filter((row: any[]) => {
        return !(row[0] === fileId && row[1] === pnIdentifier);
      });

      // Clear and rewrite
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Saves!A2:C'
      });

      if (filteredSaves.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Saves!A2',
          valueInputOption: 'RAW',
          requestBody: {
            values: filteredSaves
          }
        });
      }
    } catch (error: any) {
      console.error('Error removing save:', error);
      throw error;
    }
  }

  /**
   * Get all likes for a file
   */
  static async getLikes(
    accessToken: string,
    spreadsheetId: string,
    fileId: string
  ): Promise<LikeRecord[]> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Likes!A2:C'
      });

      if (!response.data.values) {
        return [];
      }

      return response.data.values
        .filter((row: any[]) => row[0] === fileId)
        .map((row: any[]) => ({
          fileId: row[0],
          pnIdentifier: row[1],
          timestamp: row[2]
        }));
    } catch (error: any) {
      console.error('Error getting likes:', error);
      return [];
    }
  }

  /**
   * Get all comments for a file
   */
  static async getComments(
    accessToken: string,
    spreadsheetId: string,
    fileId: string
  ): Promise<CommentRecord[]> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Comments!A2:F'
      });

      if (!response.data.values) {
        return [];
      }

      return response.data.values
        .filter((row: any[]) => row[0] === fileId)
        .map((row: any[]) => ({
          fileId: row[0],
          commentId: row[1],
          pnIdentifier: row[2],
          authorName: row[3],
          content: row[4],
          timestamp: row[5]
        }));
    } catch (error: any) {
      console.error('Error getting comments:', error);
      return [];
    }
  }
}

