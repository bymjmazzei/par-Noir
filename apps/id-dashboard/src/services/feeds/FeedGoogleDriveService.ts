/**
 * Feed Google Drive Service
 * Manages Google Drive folder creation and structure for feeds
 */

import { GoogleDriveBackend } from '../storage/GoogleDriveBackend';

export interface FeedFolderStructure {
  feedFolderId: string;
  metadataFolderId: string;
  topPostFolderId: string;
  postsFolderId: string;
}

export class FeedGoogleDriveService {
  private static readonly FEED_FOLDER_PREFIX = 'par Noir - Feed: ';
  private static readonly METADATA_FOLDER_NAME = '_metadata';
  private static readonly TOP_POST_FOLDER_NAME = 'top-post';
  private static readonly POSTS_FOLDER_NAME = 'posts';

  /**
   * Create feed folder structure in Google Drive
   */
  static async createFeedFolderStructure(
    feedId: string,
    feedName: string,
    creatorPnIdentifier: string,
    googleDriveBackend: GoogleDriveBackend
  ): Promise<FeedFolderStructure> {
    try {
      // Get or create creator's pN folder first
      const creatorFolderId = await googleDriveBackend.getOrCreateFolder(
        `par Noir - ${creatorPnIdentifier}`,
        creatorPnIdentifier
      );

      // Create feed folder inside creator's pN folder
      const feedFolderName = `${this.FEED_FOLDER_PREFIX}${feedName}`;
      const feedFolderId = await googleDriveBackend.getOrCreateFolder(
        feedFolderName,
        creatorPnIdentifier,
        creatorFolderId
      );

      // Create metadata folder inside feed folder
      const metadataFolderId = await googleDriveBackend.getOrCreateFolder(
        this.METADATA_FOLDER_NAME,
        creatorPnIdentifier,
        feedFolderId
      );

      // Create top-post folder inside feed folder
      const topPostFolderId = await googleDriveBackend.getOrCreateFolder(
        this.TOP_POST_FOLDER_NAME,
        creatorPnIdentifier,
        feedFolderId
      );

      // Create posts folder inside feed folder
      const postsFolderId = await googleDriveBackend.getOrCreateFolder(
        this.POSTS_FOLDER_NAME,
        creatorPnIdentifier,
        feedFolderId
      );

      console.log(`✅ [FeedGoogleDriveService] Created feed folder structure for ${feedName}:`, {
        feedFolderId,
        metadataFolderId,
        topPostFolderId,
        postsFolderId
      });

      return {
        feedFolderId,
        metadataFolderId,
        topPostFolderId,
        postsFolderId
      };
    } catch (error) {
      console.error('❌ [FeedGoogleDriveService] Failed to create feed folder structure:', error);
      throw new Error(`Failed to create feed folder structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get feed folder ID (if it exists)
   */
  static async getFeedFolderId(
    feedId: string,
    feedName: string,
    creatorPnIdentifier: string,
    googleDriveBackend: GoogleDriveBackend
  ): Promise<string | null> {
    try {
      const creatorFolderId = await googleDriveBackend.getOrCreateFolder(
        `par Noir - ${creatorPnIdentifier}`,
        creatorPnIdentifier
      );

      const feedFolderName = `${this.FEED_FOLDER_PREFIX}${feedName}`;

      const token = await googleDriveBackend.ensureAccessToken();
      if (!token) {
        throw new Error('Google Drive not connected or access token unavailable');
      }

      const searchQuery = `name='${feedFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${creatorFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)&pageSize=1`;

      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }

      return null;
    } catch (error) {
      console.error('❌ [FeedGoogleDriveService] Failed to get feed folder:', error);
      return null;
    }
  }
}

