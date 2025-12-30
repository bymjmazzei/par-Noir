/**
 * Engagement Drive Service
 * Manages user's own engagement data stored in Google Drive
 * Each user stores their engagement in engagement.json in their _metadata folder
 */

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
   * Get engagement file from user's Google Drive
   */
  static async getEngagementFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserEngagement | null> {
    try {
      // Search for engagement.json in metadata folder
      const searchQuery = `name='${this.ENGAGEMENT_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok || searchResponse.status === 404) {
        return null;
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }

      // Download engagement file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as UserEngagement;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting engagement file:', error);
      return null;
    }
  }

  /**
   * Create or update engagement file
   */
  static async updateEngagementFile(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    engagement: Partial<UserEngagement>
  ): Promise<UserEngagement> {
    // Get existing engagement or create new
    let existingEngagement = await this.getEngagementFile(accessToken, metadataFolderId);
    
    const now = new Date().toISOString();
    const updatedEngagement: UserEngagement = {
      userDid,
      updatedAt: now,
      likes: engagement.likes ?? existingEngagement?.likes ?? [],
      dislikes: engagement.dislikes ?? existingEngagement?.dislikes ?? [],
      comments: engagement.comments ?? existingEngagement?.comments ?? [],
      shares: engagement.shares ?? existingEngagement?.shares ?? [],
      saves: engagement.saves ?? existingEngagement?.saves ?? []
    };

    const engagementContent = JSON.stringify(updatedEngagement, null, 2);

    try {
      // Search for existing engagement.json
      const searchQuery = `name='${this.ENGAGEMENT_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: engagementContent
          });
          return updatedEngagement;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.ENGAGEMENT_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="engagement.json"',
        'Content-Type: application/json',
        '',
        engagementContent,
        `--${boundary}--`
      ].join('\r\n');

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
      
      return updatedEngagement;
    } catch (error) {
      console.error('Error updating engagement file:', error);
      throw error;
    }
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
    const engagement = await this.getEngagementFile(accessToken, metadataFolderId);
    const likes = engagement?.likes || [];
    const dislikes = engagement?.dislikes || [];
    
    let newLikes = [...likes];
    let newDislikes = [...dislikes];
    let liked = false;

    if (likes.includes(fileId)) {
      // Unlike - remove from likes
      newLikes = newLikes.filter(id => id !== fileId);
    } else {
      // Like - add to likes and remove from dislikes
      newLikes.push(fileId);
      newDislikes = newDislikes.filter(id => id !== fileId);
      liked = true;
    }

    await this.updateEngagementFile(accessToken, metadataFolderId, userDid, {
      likes: newLikes,
      dislikes: newDislikes
    });

    return { liked };
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
    const engagement = await this.getEngagementFile(accessToken, metadataFolderId);
    const likes = engagement?.likes || [];
    const dislikes = engagement?.dislikes || [];
    
    let newLikes = [...likes];
    let newDislikes = [...dislikes];
    let disliked = false;

    if (dislikes.includes(fileId)) {
      // Remove dislike
      newDislikes = newDislikes.filter(id => id !== fileId);
    } else {
      // Dislike - add to dislikes and remove from likes
      newDislikes.push(fileId);
      newLikes = newLikes.filter(id => id !== fileId);
      disliked = true;
    }

    await this.updateEngagementFile(accessToken, metadataFolderId, userDid, {
      likes: newLikes,
      dislikes: newDislikes
    });

    return { disliked };
  }

  /**
   * Check if user has liked a file
   */
  static async isLiked(
    fileId: string,
    accessToken: string,
    metadataFolderId: string
  ): Promise<boolean> {
    const engagement = await this.getEngagementFile(accessToken, metadataFolderId);
    return engagement?.likes.includes(fileId) ?? false;
  }

  /**
   * Check if user has disliked a file
   */
  static async isDisliked(
    fileId: string,
    accessToken: string,
    metadataFolderId: string
  ): Promise<boolean> {
    const engagement = await this.getEngagementFile(accessToken, metadataFolderId);
    return engagement?.dislikes.includes(fileId) ?? false;
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
    const engagement = await this.getEngagementFile(accessToken, metadataFolderId);
    const comments = engagement?.comments || [];
    
    const newComment: UserComment = {
      fileId,
      ...comment
    };

    comments.push(newComment);

    await this.updateEngagementFile(accessToken, metadataFolderId, userDid, {
      comments
    });

    return newComment;
  }

  /**
   * Get all user engagement
   */
  static async getUserEngagement(
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserEngagement | null> {
    return await this.getEngagementFile(accessToken, metadataFolderId);
  }
}

