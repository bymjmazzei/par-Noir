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
 * SECURITY: Sensitive fields (ownerDid, ownerIdentifier) are encrypted
 * before storage to make them machine-readable only.
 */

import { google } from 'googleapis';
import { MetadataEncryption } from '../utils/metadataEncryption';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export interface CompanionMetadata {
  fileId: string;
  googleDriveFileId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileType?: string; // Technical file type (image, video, text, thought, collection, etc.)
  contentClass?: 'media' | 'thought' | 'collection'; // Content classification for feed filtering
  visibility: 'public' | 'private' | 'friends';
  uploadedAt: string;
  owner: {
    did: string;
    identifier: string;
  };
  tags?: string[];
  description?: string;
  thumbnail?: string;
  thumbnailFileId?: string; // Reference to thumbnail file used in feeds
  mainFileId?: string; // Reference to main file (for thumbnails) - the main file is for owner download only
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

export interface ViewRecord {
  fileId: string;
  viewerPnIdentifier: string;
  timestamp: string;
}

export class CompanionMetadataSheets {
  /**
   * Create a new companion metadata spreadsheet with all sheets
   */
  static async createSpreadsheet(
    token: GoogleDriveToken,
    folderId: string,
    fileId: string,
    metadata: CompanionMetadata,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
                  columnCount: 18
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
            },
            {
              properties: {
                title: 'Views',
                gridProperties: {
                  rowCount: 10000,
                  columnCount: 2
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

      // 2. Determine contentClass and get/create subfolder
      let contentClass = metadata.contentClass;
      if (!contentClass) {
        // Use centralized utility function for consistency
        const { determineContentClass } = await import('../utils/fileTypeUtils');
        const metadataAny = metadata as any;
        contentClass = determineContentClass({
          fileType: metadataAny.fileType,
          collection: metadataAny.collection,
          textPost: metadataAny.textPost,
          thought: metadataAny.thought,
          isThoughtThumbnail: metadataAny.isThoughtThumbnail,
          isPartOfCollection: metadataAny.isPartOfCollection
        });
      }

      // Lookup content type subfolder only (created at connect via initializeContentClassFolders)
      const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass;
      const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const contentTypeFolderResponse = await drive.files.list({
        q: contentTypeFolderQuery,
        fields: 'files(id,name)',
        pageSize: 1
      });

      if (!contentTypeFolderResponse.data.files || contentTypeFolderResponse.data.files.length === 0) {
        throw new Error('DRIVE_NOT_INITIALIZED: Content folder not found. Please connect and initialize Google Drive in your dashboard first.');
      }
      const contentTypeFolderId = contentTypeFolderResponse.data.files[0].id!;

      // 3. Move to content type subfolder
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: contentTypeFolderId,
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
              'fileType',
              'contentClass',
              'size',
              'visibility',
              'uploadedAt',
              'ownerDid',
              'ownerIdentifier',
              'tags',
              'description',
              'thumbnail',
              'thumbnailFileId',
              'mainFileId',
              'lastUpdated'
            ],
            // Data row (encrypt sensitive fields)
            [
              metadata.fileId,
              metadata.googleDriveFileId,
              metadata.fileName,
              metadata.originalName,
              metadata.mimeType,
              metadata.fileType || '',
              metadata.contentClass || '',
              metadata.size.toString(),
              metadata.visibility,
              metadata.uploadedAt,
              MetadataEncryption.encryptField(metadata.owner.did), // Encrypted
              MetadataEncryption.encryptField(metadata.owner.identifier), // Encrypted
              (metadata.tags || []).join(','),
              metadata.description || '',
              metadata.thumbnail || '',
              metadata.thumbnailFileId || '',
              metadata.mainFileId || '',
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

      // 8. Populate Views sheet headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Views!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['Viewer PN', 'Timestamp']
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
    token: GoogleDriveToken,
    folderId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

    const drive = google.drive({ version: 'v3', auth });

    try {
      // Search in content type subfolders first (new structure)
      const contentTypes = ['media', 'thoughts', 'collections'];
      for (const contentType of contentTypes) {
        const subfolderQuery = `name='${contentType}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const subfolderResponse = await drive.files.list({
          q: subfolderQuery,
          fields: 'files(id)',
          pageSize: 1
        });

        if (subfolderResponse.data.files && subfolderResponse.data.files.length > 0) {
          const subfolderId = subfolderResponse.data.files[0].id!;
          const query = `name='${fileId}.metadata' and '${subfolderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`;
          const response = await drive.files.list({
            q: query,
            fields: 'files(id)',
            pageSize: 1
          });

          if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id || null;
          }
        }
      }

      // Fallback to old structure (flat - search directly in metadata folder)
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<CompanionMetadata | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read Metadata sheet (read up to 18 columns for new schema, but handle fewer gracefully)
      const metadataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Metadata!A1:R2'
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

      // Helper to safely get column index (backward compatibility for missing columns)
      const getColumnIndex = (columnName: string): number => {
        const idx = headers.indexOf(columnName);
        return idx >= 0 ? idx : -1;
      };

      const metadata: CompanionMetadata = {
        fileId: data[getColumnIndex('fileId')] || '',
        googleDriveFileId: data[getColumnIndex('googleDriveFileId')] || '',
        fileName: data[getColumnIndex('fileName')] || '',
        originalName: data[getColumnIndex('originalName')] || '',
        mimeType: data[getColumnIndex('mimeType')] || '',
        fileType: getColumnIndex('fileType') >= 0 ? (data[getColumnIndex('fileType')] || undefined) : undefined,
        contentClass: getColumnIndex('contentClass') >= 0 ? (data[getColumnIndex('contentClass')] as 'media' | 'thought' | 'collection' | undefined) : undefined,
        size: parseInt(data[getColumnIndex('size')] || '0', 10),
        visibility: (data[getColumnIndex('visibility')] || 'private') as 'public' | 'private' | 'friends',
        uploadedAt: data[getColumnIndex('uploadedAt')] || new Date().toISOString(),
        owner: {
          did: MetadataEncryption.decryptField(ownerDidEncrypted), // Decrypted
          identifier: MetadataEncryption.decryptField(ownerIdentifierEncrypted) // Decrypted
        },
        tags: data[getColumnIndex('tags')] ? (data[getColumnIndex('tags')] as string).split(',').filter(Boolean) : [],
        description: data[getColumnIndex('description')] || undefined,
        thumbnail: data[getColumnIndex('thumbnail')] || undefined,
        thumbnailFileId: getColumnIndex('thumbnailFileId') >= 0 ? (data[getColumnIndex('thumbnailFileId')] || undefined) : undefined,
        mainFileId: getColumnIndex('mainFileId') >= 0 ? (data[getColumnIndex('mainFileId')] || undefined) : undefined
      };

      // Derive engagement counts from sheets
      const engagement = await this.getEngagementCounts(token, spreadsheetId, userPnIdentifier, accountId);
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    lastUpdated: string;
  }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Get all engagement sheet data (excluding headers)
      const [likesResponse, commentsResponse, sharesResponse, savesResponse, viewsResponse] = await Promise.all([
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
        }).catch(() => ({ data: { values: undefined } })), // Saves sheet might not exist yet
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Views!A2:B'
        }).catch(() => ({ data: { values: undefined } })) // Views sheet might not exist (older spreadsheets)
      ]);

      const likesCount = likesResponse.data.values ? likesResponse.data.values.length : 0;
      const commentsCount = commentsResponse.data.values ? commentsResponse.data.values.length : 0;
      const sharesCount = sharesResponse.data.values ? sharesResponse.data.values.length : 0;
      const savesCount = savesResponse.data.values ? savesResponse.data.values.length : 0;
      const viewsCount = viewsResponse.data.values ? viewsResponse.data.values.length : 0;

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

      // Check views for latest timestamp (column B)
      if (viewsResponse.data.values && viewsResponse.data.values.length > 0) {
        const latestView = viewsResponse.data.values[viewsResponse.data.values.length - 1];
        if (latestView && latestView[1] && latestView[1] > lastUpdated) {
          lastUpdated = latestView[1];
        }
      }

      return {
        views: viewsCount,
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    metadata: Partial<CompanionMetadata>,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read current metadata to get headers (read up to 19 columns for new schema)
      const metadataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Metadata!A1:S2'
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
      if (metadata.fileType !== undefined) {
        const idx = headers.indexOf('fileType');
        if (idx >= 0) currentData[idx] = metadata.fileType || '';
      }
      if (metadata.contentClass !== undefined) {
        const idx = headers.indexOf('contentClass');
        if (idx >= 0) currentData[idx] = metadata.contentClass || '';
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
      if (metadata.thumbnailFileId !== undefined) {
        const idx = headers.indexOf('thumbnailFileId');
        if (idx >= 0) currentData[idx] = metadata.thumbnailFileId || '';
      }
      if (metadata.mainFileId !== undefined) {
        const idx = headers.indexOf('mainFileId');
        if (idx >= 0) currentData[idx] = metadata.mainFileId || '';
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
    token: GoogleDriveToken,
    spreadsheetId: string,
    like: LikeRecord,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    pnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    comment: CommentRecord,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    share: ShareRecord,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    save: SaveRecord,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
   * Append a view to the Views sheet (creator's source of truth)
   */
  static async appendView(
    token: GoogleDriveToken,
    spreadsheetId: string,
    view: ViewRecord,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Views!A2',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[view.viewerPnIdentifier, view.timestamp]]
        }
      });
    } catch (error: any) {
      console.error('Error appending view:', error);
      throw error;
    }
  }

  /**
   * Remove a save from the Saves sheet (by fileId and pnIdentifier)
   */
  static async removeSave(
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    pnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<LikeRecord[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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
    token: GoogleDriveToken,
    spreadsheetId: string,
    fileId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<CommentRecord[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);

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

