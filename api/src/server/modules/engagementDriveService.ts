/**
 * Engagement Drive Service
 * Manages user's own engagement data stored in Google Drive
 * Uses engagement.xlsx (Google Sheets) for better scalability
 * Migrates from engagement.json automatically on first access
 */

import { EngagementSheetsService, UserComment } from './engagementSheetsService';

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

export interface UserEngagement {
  userDid: string;
  updatedAt: string;
  likes: string[]; // File IDs
  dislikes: string[]; // File IDs
  comments: UserComment[];
  shares: string[]; // File IDs
  saves: string[]; // File IDs
}

export class EngagementDriveService {
  private static readonly ENGAGEMENT_FILE_NAME = 'engagement.json';

  /**
   * Migrate from JSON to Sheets if JSON exists
   */
  private static async migrateFromJsonIfNeeded(
    accessToken: string,
    metadataFolderId: string
  ): Promise<void> {
    try {
      // Check if JSON file exists
      const searchQuery = `name='${this.ENGAGEMENT_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok) {
        return; // No JSON file, nothing to migrate
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      if (!searchData.files || searchData.files.length === 0) {
        return; // No JSON file
      }

      // Download JSON file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return;
      }

      const jsonData = await getResponse.json() as UserEngagement;
      
      // Get or create Sheets file
      const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
        accessToken,
        metadataFolderId
      );

      // Migrate likes
      for (const fileId of jsonData.likes || []) {
        await EngagementSheetsService.addLike(accessToken, spreadsheetId, fileId);
      }

      // Migrate dislikes
      for (const fileId of jsonData.dislikes || []) {
        await EngagementSheetsService.addDislike(accessToken, spreadsheetId, fileId);
      }

      // Migrate comments
      for (const comment of jsonData.comments || []) {
        await EngagementSheetsService.addComment(accessToken, spreadsheetId, comment);
      }

      // Migrate shares
      for (const fileId of jsonData.shares || []) {
        await EngagementSheetsService.addShare(accessToken, spreadsheetId, fileId);
      }

      // Migrate saves
      for (const fileId of jsonData.saves || []) {
        await EngagementSheetsService.addSave(accessToken, spreadsheetId, fileId);
      }

      console.log('[EngagementDriveService] Migrated engagement.json to engagement.xlsx');
    } catch (error) {
      console.error('[EngagementDriveService] Error migrating from JSON:', error);
      // Don't throw - continue with Sheets even if migration fails
    }
  }

  /**
   * Get engagement file from user's Google Drive (now uses Sheets)
   */
  static async getEngagementFile(
    accessToken: string,
    metadataFolderId: string,
    userDid?: string
  ): Promise<UserEngagement | null> {
    try {
      // Migrate from JSON if needed
      await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

      // Get or create Sheets file
      const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
        accessToken,
        metadataFolderId
      );

      // Read from Sheets
      const [likes, dislikes, comments, shares, saves] = await Promise.all([
        EngagementSheetsService.getLikes(accessToken, spreadsheetId),
        EngagementSheetsService.getDislikes(accessToken, spreadsheetId),
        EngagementSheetsService.getComments(accessToken, spreadsheetId),
        EngagementSheetsService.getShares(accessToken, spreadsheetId),
        EngagementSheetsService.getSaves(accessToken, spreadsheetId)
      ]);

      return {
        userDid: userDid || '',
        updatedAt: new Date().toISOString(),
        likes,
        dislikes,
        comments,
        shares,
        saves
      };
    } catch (error) {
      console.error('Error getting engagement file:', error);
      return null;
    }
  }

  /**
   * Create or update engagement file (now uses Sheets)
   * Note: This method is kept for backward compatibility but now delegates to Sheets operations
   */
  static async updateEngagementFile(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    engagement: Partial<UserEngagement>
  ): Promise<UserEngagement> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    // Get or create Sheets file
    const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
      accessToken,
      metadataFolderId
    );

    // Get existing engagement
    const existing = await this.getEngagementFile(accessToken, metadataFolderId, userDid);

    // Update likes if provided
    if (engagement.likes !== undefined) {
      const currentLikes = existing?.likes || [];
      const newLikes = engagement.likes;
      
      // Remove likes that are no longer present
      for (const fileId of currentLikes) {
        if (!newLikes.includes(fileId)) {
          await EngagementSheetsService.removeLike(accessToken, spreadsheetId, fileId);
        }
      }
      
      // Add new likes
      for (const fileId of newLikes) {
        if (!currentLikes.includes(fileId)) {
          await EngagementSheetsService.addLike(accessToken, spreadsheetId, fileId);
        }
      }
    }

    // Similar logic for dislikes, shares, saves, comments...
    // For now, return the updated engagement
    return await this.getEngagementFile(accessToken, metadataFolderId, userDid) || {
      userDid,
      updatedAt: new Date().toISOString(),
      likes: [],
      dislikes: [],
      comments: [],
      shares: [],
      saves: []
    };
  }

  /**
   * Toggle like for a file
   */
  static async toggleLike(
    userDid: string,
    fileId: string,
    accessToken: string,
    metadataFolderId: string
  ): Promise<{ liked: boolean }> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
      accessToken,
      metadataFolderId
    );

    const likes = await EngagementSheetsService.getLikes(accessToken, spreadsheetId);
    const isLiked = likes.includes(fileId);

    if (isLiked) {
      // Unlike
      await EngagementSheetsService.removeLike(accessToken, spreadsheetId, fileId);
      // Also remove from dislikes if present
      const dislikes = await EngagementSheetsService.getDislikes(accessToken, spreadsheetId);
      if (dislikes.includes(fileId)) {
        await EngagementSheetsService.removeDislike(accessToken, spreadsheetId, fileId);
      }
      return { liked: false };
    } else {
      // Like
      await EngagementSheetsService.addLike(accessToken, spreadsheetId, fileId);
      // Remove from dislikes if present
      const dislikes = await EngagementSheetsService.getDislikes(accessToken, spreadsheetId);
      if (dislikes.includes(fileId)) {
        await EngagementSheetsService.removeDislike(accessToken, spreadsheetId, fileId);
      }
      return { liked: true };
    }
  }

  /**
   * Toggle dislike for a file
   */
  static async toggleDislike(
    userDid: string,
    fileId: string,
    accessToken: string,
    metadataFolderId: string
  ): Promise<{ disliked: boolean }> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
      accessToken,
      metadataFolderId
    );

    const dislikes = await EngagementSheetsService.getDislikes(accessToken, spreadsheetId);
    const isDisliked = dislikes.includes(fileId);

    if (isDisliked) {
      // Remove dislike
      await EngagementSheetsService.removeDislike(accessToken, spreadsheetId, fileId);
      return { disliked: false };
    } else {
      // Dislike
      await EngagementSheetsService.addDislike(accessToken, spreadsheetId, fileId);
      // Remove from likes if present
      const likes = await EngagementSheetsService.getLikes(accessToken, spreadsheetId);
      if (likes.includes(fileId)) {
        await EngagementSheetsService.removeLike(accessToken, spreadsheetId, fileId);
      }
      return { disliked: true };
    }
  }

  /**
   * Check if user has liked a file
   */
  static async isLiked(
    fileId: string,
    accessToken: string,
    metadataFolderId: string
  ): Promise<boolean> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
      accessToken,
      metadataFolderId
    );

    const likes = await EngagementSheetsService.getLikes(accessToken, spreadsheetId);
    return likes.includes(fileId);
  }

  /**
   * Check if user has disliked a file
   */
  static async isDisliked(
    fileId: string,
    accessToken: string,
    metadataFolderId: string
  ): Promise<boolean> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
      accessToken,
      metadataFolderId
    );

    const dislikes = await EngagementSheetsService.getDislikes(accessToken, spreadsheetId);
    return dislikes.includes(fileId);
  }

  /**
   * Add a comment
   */
  static async addComment(
    userDid: string,
    fileId: string,
    comment: Omit<UserComment, 'fileId'>,
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserComment> {
    // Migrate from JSON if needed
    await this.migrateFromJsonIfNeeded(accessToken, metadataFolderId);

    const spreadsheetId = await EngagementSheetsService.getOrCreateEngagementSheet(
      accessToken,
      metadataFolderId
    );

    const newComment: UserComment = {
      fileId,
      ...comment
    };

    await EngagementSheetsService.addComment(accessToken, spreadsheetId, newComment);

    return newComment;
  }

  /**
   * Get all user engagement
   */
  static async getUserEngagement(
    accessToken: string,
    metadataFolderId: string,
    userDid?: string
  ): Promise<UserEngagement | null> {
    return await this.getEngagementFile(accessToken, metadataFolderId, userDid);
  }
}

