/**
 * Engagement Service
 * Manages likes, comments, and shares for files
 */

import { getDatabasePool } from '../utils/database';

export interface EngagementRow {
  engagement_id: string;
  file_id: string;
  user_did: string;
  type: string;
  content: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  fileId: string;
  authorId: string; // Commentor DID (references the content)
  authorName: string;
  content: string;
  timestamp: string;
  likes?: number;
  fileOwnerDid?: string; // File owner DID (owns the content)
}

export interface EngagementStats {
  likes: number;
  comments: number;
  shares: number;
}

export class EngagementService {
  /**
   * Toggle like for a file
   */
  static async toggleLike(fileId: string, userDid: string): Promise<{ liked: boolean; count: number }> {
    const db = getDatabasePool();
    
    try {
      // Check if already liked
      const existing = await db.query(`
        SELECT engagement_id FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'like'
        LIMIT 1
      `, [fileId, userDid]);

      if (existing.rows.length > 0) {
        // Unlike - remove the engagement
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'like'
        `, [fileId, userDid]);
      } else {
        // Like - add the engagement
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type)
          VALUES ($1, $2, 'like')
          ON CONFLICT (file_id, user_did, type) DO NOTHING
        `, [fileId, userDid]);
      }

      // Get updated count
      const countResult = await db.query(`
        SELECT COUNT(*) as count FROM engagement 
        WHERE file_id = $1 AND type = 'like'
      `, [fileId]);

      const count = parseInt(countResult.rows[0].count, 10);
      const liked = existing.rows.length === 0; // If it didn't exist, now it's liked

      // Trigger notification for file owner (only when liking, not unliking)
      if (liked) {
        try {
          // Get file owner from metadata
          const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
          const aggregator = AggregatorMetadataServiceDB.getInstance();
          const fileMetadata = await aggregator.getFileMetadata(fileId);
          const fileOwnerDid = fileMetadata?.pnIdentifier;
          
          if (fileOwnerDid && fileOwnerDid !== userDid) {
            const { NotificationService } = await import('./notificationService');
            await NotificationService.notifyFileLike(fileId, userDid, fileOwnerDid);
          }
        } catch (error) {
          console.warn('Failed to send like notification:', error);
          // Don't fail the operation if notification fails
        }
      }

      return { liked, count };
    } catch (error) {
      console.error('Failed to toggle like:', error);
      throw error;
    }
  }

  /**
   * Check if user has liked a file
   */
  static async isLiked(fileId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    const result = await db.query(`
      SELECT 1 FROM engagement 
      WHERE file_id = $1 AND user_did = $2 AND type = 'like'
      LIMIT 1
    `, [fileId, userDid]);

    return result.rows.length > 0;
  }

  /**
   * Add a comment
   * File owner has the content, pN commentor references it
   * Comments wouldn't exist without the content; creator owns original content and hosts it
   */
  static async addComment(
    fileId: string,
    userDid: string,
    content: string,
    authorName?: string,
    fileOwnerDid?: string
  ): Promise<Comment> {
    const db = getDatabasePool();
    
    try {
      // If fileOwnerDid not provided, get it from aggregator metadata
      let ownerDid = fileOwnerDid;
      if (!ownerDid) {
        try {
          const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
          const aggregator = AggregatorMetadataServiceDB.getInstance();
          const fileMetadata = await aggregator.getFileMetadata(fileId);
          ownerDid = fileMetadata?.pnIdentifier || undefined;
        } catch (error) {
          console.warn('Could not fetch file owner from metadata:', error);
        }
      }

      // Store comment with reference to file owner
      // Note: We store file_owner in a JSONB field in content for now
      // In production, you might want to add a separate file_owner column
      const commentData = {
        content,
        fileOwnerDid: ownerDid || null,
        commentorDid: userDid,
        note: 'File owner owns content; commentor references it'
      };

      const result = await db.query<EngagementRow>(`
        INSERT INTO engagement (file_id, user_did, type, content)
        VALUES ($1, $2, 'comment', $3)
        RETURNING *
      `, [fileId, userDid, JSON.stringify(commentData)]);

      const row = result.rows[0];
      const parsedContent = JSON.parse(row.content || '{}');
      
      const comment = {
        id: row.engagement_id,
        fileId: row.file_id,
        authorId: row.user_did, // Commentor DID
        authorName: authorName || row.user_did.substring(0, 8),
        content: parsedContent.content || content,
        timestamp: row.created_at,
        likes: 0,
        // Add file owner reference
        fileOwnerDid: parsedContent.fileOwnerDid || ownerDid || undefined
      };

      // Trigger notification for file owner
      if (ownerDid && ownerDid !== userDid) {
        try {
          const { NotificationService } = await import('./notificationService');
          await NotificationService.notifyFileComment(fileId, comment.id, userDid, ownerDid);
        } catch (error) {
          console.warn('Failed to send comment notification:', error);
          // Don't fail the operation if notification fails
        }
      }

      return comment;
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  }

  /**
   * Get comments for a file
   * Returns comments with file owner reference
   */
  static async getComments(fileId: string): Promise<Comment[]> {
    const db = getDatabasePool();
    
    try {
      // Get file owner from aggregator metadata
      let fileOwnerDid: string | undefined;
      try {
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const fileMetadata = await aggregator.getFileMetadata(fileId);
        fileOwnerDid = fileMetadata?.pnIdentifier;
      } catch (error) {
        console.warn('Could not fetch file owner from metadata:', error);
      }

      const result = await db.query<EngagementRow>(`
        SELECT * FROM engagement 
        WHERE file_id = $1 AND type = 'comment'
        ORDER BY created_at ASC
      `, [fileId]);

      return result.rows.map(row => {
        // Try to parse JSON content (new format) or use plain text (old format)
        let parsedContent: any = {};
        let commentContent = row.content || '';
        
        try {
          parsedContent = JSON.parse(row.content || '{}');
          commentContent = parsedContent.content || row.content || '';
        } catch {
          // Old format - plain text content
          commentContent = row.content || '';
        }

        return {
          id: row.engagement_id,
          fileId: row.file_id,
          authorId: row.user_did, // Commentor DID
          authorName: row.user_did.substring(0, 8),
          content: commentContent,
          timestamp: row.created_at,
          likes: 0, // TODO: Add comment likes if needed
          fileOwnerDid: parsedContent.fileOwnerDid || fileOwnerDid // File owner reference
        };
      });
    } catch (error) {
      console.error('Failed to get comments:', error);
      throw error;
    }
  }

  /**
   * Record a share
   */
  static async recordShare(fileId: string, userDid: string): Promise<number> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        INSERT INTO engagement (file_id, user_did, type)
        VALUES ($1, $2, 'share')
        ON CONFLICT (file_id, user_did, type) DO NOTHING
      `, [fileId, userDid]);

      // Get share count
      const countResult = await db.query(`
        SELECT COUNT(*) as count FROM engagement 
        WHERE file_id = $1 AND type = 'share'
      `, [fileId]);

      return parseInt(countResult.rows[0].count, 10);
    } catch (error) {
      console.error('Failed to record share:', error);
      throw error;
    }
  }

  /**
   * Get engagement stats for a file
   */
  static async getEngagementStats(fileId: string): Promise<EngagementStats> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(`
        SELECT 
          type,
          COUNT(*) as count
        FROM engagement
        WHERE file_id = $1
        GROUP BY type
      `, [fileId]);

      const stats: EngagementStats = {
        likes: 0,
        comments: 0,
        shares: 0
      };

      result.rows.forEach(row => {
        const type = row.type;
        const count = parseInt(row.count, 10);
        if (type === 'like') stats.likes = count;
        else if (type === 'comment') stats.comments = count;
        else if (type === 'share') stats.shares = count;
      });

      return stats;
    } catch (error) {
      console.error('Failed to get engagement stats:', error);
      return { likes: 0, comments: 0, shares: 0 };
    }
  }

  /**
   * Check which files a user has liked (bulk)
   */
  static async getBulkLikedFiles(fileIds: string[], userDid: string): Promise<Set<string>> {
    const db = getDatabasePool();
    const likedSet = new Set<string>();

    if (fileIds.length === 0) {
      return likedSet;
    }

    try {
      const result = await db.query(`
        SELECT file_id FROM engagement 
        WHERE file_id = ANY($1::text[]) AND user_did = $2 AND type = 'like'
      `, [fileIds, userDid]);

      result.rows.forEach(row => {
        likedSet.add(row.file_id);
      });

      return likedSet;
    } catch (error) {
      console.error('Failed to get bulk liked files:', error);
      return likedSet;
    }
  }

  /**
   * Get engagement stats for multiple files
   */
  static async getBulkEngagementStats(fileIds: string[]): Promise<Map<string, EngagementStats>> {
    const db = getDatabasePool();
    const statsMap = new Map<string, EngagementStats>();

    if (fileIds.length === 0) {
      return statsMap;
    }

    try {
      const result = await db.query(`
        SELECT 
          file_id,
          type,
          COUNT(*) as count
        FROM engagement
        WHERE file_id = ANY($1::text[])
        GROUP BY file_id, type
      `, [fileIds]);

      // Initialize all files with zero stats
      fileIds.forEach(fileId => {
        statsMap.set(fileId, { likes: 0, comments: 0, shares: 0 });
      });

      // Populate stats
      result.rows.forEach(row => {
        const fileId = row.file_id;
        const type = row.type;
        const count = parseInt(row.count, 10);
        
        const stats = statsMap.get(fileId) || { likes: 0, comments: 0, shares: 0 };
        if (type === 'like') stats.likes = count;
        else if (type === 'comment') stats.comments = count;
        else if (type === 'share') stats.shares = count;
        
        statsMap.set(fileId, stats);
      });

      return statsMap;
    } catch (error) {
      console.error('Failed to get bulk engagement stats:', error);
      // Return empty stats for all files
      fileIds.forEach(fileId => {
        statsMap.set(fileId, { likes: 0, comments: 0, shares: 0 });
      });
      return statsMap;
    }
  }
}

