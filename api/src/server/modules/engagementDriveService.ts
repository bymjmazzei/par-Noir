/**
 * Engagement Drive Service
 * Manages user's own engagement data stored in Google Drive
 * Uses engagement.xlsx (Google Sheets) for better scalability
 */

import { EngagementSheetsService, UserComment } from './engagementSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import {
  getOrInitEngagementPortable,
  saveEngagementPortable
} from './storage/engagementPortableService';

// Re-export UserComment for backward compatibility
export type { UserComment };

export interface UserEngagement {
  userPnIdentifier: string;
  updatedAt: string;
  likes: string[]; // File IDs
  dislikes: string[]; // File IDs
  comments: UserComment[];
  shares: string[]; // File IDs
  saves: string[]; // File IDs
}

export class EngagementDriveService {

  /**
   * Get engagement file from user's Google Drive (uses Sheets)
   */
  static async getEngagementFile(
    token: GoogleDriveToken | string,
    metadataFolderId: string,
    userPnIdentifier?: string,
    accountId?: string
  ): Promise<UserEngagement | null> {
    // Convert accessToken string to token object if needed (backward compatibility)
    const tokenObj: GoogleDriveToken = typeof token === 'string' ? { access_token: token } : token;
    if (!userPnIdentifier) {
      throw new Error('userPnIdentifier is required');
    }
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    if (await isPortableStorageProvider(normalized)) {
      return getOrInitEngagementPortable(normalized, accountId);
    }
    try {
      const spreadsheetId = await EngagementSheetsService.getEngagementSheet(
        tokenObj,
        metadataFolderId,
        userPnIdentifier,
        accountId
      );

      // Read from Sheets
      const [likes, dislikes, comments, shares, saves] = await Promise.all([
        EngagementSheetsService.getLikes(tokenObj, spreadsheetId, userPnIdentifier, accountId),
        EngagementSheetsService.getDislikes(tokenObj, spreadsheetId, userPnIdentifier, accountId),
        EngagementSheetsService.getComments(tokenObj, spreadsheetId, userPnIdentifier, accountId),
        EngagementSheetsService.getShares(tokenObj, spreadsheetId, userPnIdentifier, accountId),
        EngagementSheetsService.getSaves(tokenObj, spreadsheetId, userPnIdentifier, accountId)
      ]);

      return {
        userPnIdentifier: userPnIdentifier || '',
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
   * Create or update engagement file (uses Sheets)
   */
  static async updateEngagementFile(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    engagement: Partial<UserEngagement>,
    accountId?: string
  ): Promise<UserEngagement> {
    // Convert accessToken string to token object
    const token: GoogleDriveToken = { access_token: accessToken };

    // Get or create Sheets file
    const spreadsheetId = await EngagementSheetsService.getEngagementSheet(
      token,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );

    // Get existing engagement
    const existing = await this.getEngagementFile(token, metadataFolderId, userPnIdentifier, accountId);

    // Update likes if provided
    if (engagement.likes !== undefined) {
      const currentLikes = existing?.likes || [];
      const newLikes = engagement.likes;
      
      // Remove likes that are no longer present
      for (const fileId of currentLikes) {
        if (!newLikes.includes(fileId)) {
          await EngagementSheetsService.removeLike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
        }
      }
      
      // Add new likes
      for (const fileId of newLikes) {
        if (!currentLikes.includes(fileId)) {
          await EngagementSheetsService.addLike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
        }
      }
    }

    // Similar logic for dislikes, shares, saves, comments...
    // For now, return the updated engagement
    return await this.getEngagementFile(token, metadataFolderId, userPnIdentifier, accountId) || {
      userPnIdentifier,
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
    userPnIdentifier: string,
    fileId: string,
    accessToken: string,
    metadataFolderId: string,
    accountId?: string
  ): Promise<{ liked: boolean }> {
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    if (await isPortableStorageProvider(normalized)) {
      const state = await getOrInitEngagementPortable(normalized, accountId);
      const isLiked = state.likes.includes(fileId);
      if (isLiked) {
        state.likes = state.likes.filter((id) => id !== fileId);
        state.dislikes = state.dislikes.filter((id) => id !== fileId);
        await saveEngagementPortable(normalized, state, accountId);
        return { liked: false };
      }
      state.likes = [...state.likes.filter((id) => id !== fileId), fileId];
      state.dislikes = state.dislikes.filter((id) => id !== fileId);
      await saveEngagementPortable(normalized, state, accountId);
      return { liked: true };
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await EngagementSheetsService.ensureEngagementSheet(
      token,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );

    const likes = await EngagementSheetsService.getLikes(token, spreadsheetId, userPnIdentifier, accountId);
    const isLiked = likes.includes(fileId);

    if (isLiked) {
      // Unlike
      await EngagementSheetsService.removeLike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
      // Also remove from dislikes if present
      const dislikes = await EngagementSheetsService.getDislikes(token, spreadsheetId, userPnIdentifier, accountId);
      if (dislikes.includes(fileId)) {
        await EngagementSheetsService.removeDislike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
      }
      return { liked: false };
    } else {
      // Like
      await EngagementSheetsService.addLike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
      // Remove from dislikes if present
      const dislikes = await EngagementSheetsService.getDislikes(token, spreadsheetId, userPnIdentifier, accountId);
      if (dislikes.includes(fileId)) {
        await EngagementSheetsService.removeDislike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
      }
      return { liked: true };
    }
  }

  /**
   * Toggle dislike for a file
   */
  static async toggleDislike(
    userPnIdentifier: string,
    fileId: string,
    accessToken: string,
    metadataFolderId: string,
    accountId?: string
  ): Promise<{ disliked: boolean }> {
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    if (await isPortableStorageProvider(normalized)) {
      const state = await getOrInitEngagementPortable(normalized, accountId);
      const isDisliked = state.dislikes.includes(fileId);
      if (isDisliked) {
        state.dislikes = state.dislikes.filter((id) => id !== fileId);
        await saveEngagementPortable(normalized, state, accountId);
        return { disliked: false };
      }
      state.dislikes = [...state.dislikes.filter((id) => id !== fileId), fileId];
      state.likes = state.likes.filter((id) => id !== fileId);
      await saveEngagementPortable(normalized, state, accountId);
      return { disliked: true };
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await EngagementSheetsService.ensureEngagementSheet(
      token,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );

    const dislikes = await EngagementSheetsService.getDislikes(token, spreadsheetId, userPnIdentifier, accountId);
    const isDisliked = dislikes.includes(fileId);

    if (isDisliked) {
      // Remove dislike
      await EngagementSheetsService.removeDislike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
      return { disliked: false };
    } else {
      // Dislike
      await EngagementSheetsService.addDislike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
      // Remove from likes if present
      const likes = await EngagementSheetsService.getLikes(token, spreadsheetId, userPnIdentifier, accountId);
      if (likes.includes(fileId)) {
        await EngagementSheetsService.removeLike(token, spreadsheetId, fileId, userPnIdentifier, accountId);
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
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<boolean> {
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    if (await isPortableStorageProvider(normalized)) {
      const state = await getOrInitEngagementPortable(normalized, accountId);
      return state.likes.includes(fileId);
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await EngagementSheetsService.ensureEngagementSheet(
      token,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );

    const likes = await EngagementSheetsService.getLikes(token, spreadsheetId, userPnIdentifier, accountId);
    return likes.includes(fileId);
  }

  /**
   * Check if user has disliked a file
   */
  static async isDisliked(
    fileId: string,
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<boolean> {
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    if (await isPortableStorageProvider(normalized)) {
      const state = await getOrInitEngagementPortable(normalized, accountId);
      return state.dislikes.includes(fileId);
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await EngagementSheetsService.ensureEngagementSheet(
      token,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );

    const dislikes = await EngagementSheetsService.getDislikes(token, spreadsheetId, userPnIdentifier, accountId);
    return dislikes.includes(fileId);
  }

  /**
   * Add a comment
   */
  static async addComment(
    userPnIdentifier: string,
    fileId: string,
    comment: Omit<UserComment, 'fileId'>,
    accessToken: string,
    metadataFolderId: string,
    accountId?: string
  ): Promise<UserComment> {
    const newComment: UserComment = { fileId, ...comment };
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    if (await isPortableStorageProvider(normalized)) {
      const state = await getOrInitEngagementPortable(normalized, accountId);
      state.comments = [...state.comments, newComment];
      await saveEngagementPortable(normalized, state, accountId);
      return newComment;
    }

    const token: GoogleDriveToken = { access_token: accessToken };

    const spreadsheetId = await EngagementSheetsService.ensureEngagementSheet(
      token,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );

    await EngagementSheetsService.addComment(token, spreadsheetId, newComment, userPnIdentifier, accountId);

    return newComment;
  }

  /**
   * Get all user engagement
   */
  static async getUserEngagement(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier?: string,
    accountId?: string
  ): Promise<UserEngagement | null> {
    // Convert accessToken string to token object
    const token: GoogleDriveToken = typeof accessToken === 'string' ? { access_token: accessToken } : accessToken;
    return await this.getEngagementFile(token, metadataFolderId, userPnIdentifier, accountId);
  }
}

