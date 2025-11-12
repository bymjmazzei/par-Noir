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
  authorId: string;
  authorName: string;
  content: string;
  timestamp: string;
  likes?: number;
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
   */
  static async addComment(
    fileId: string,
    userDid: string,
    content: string,
    authorName?: string
  ): Promise<Comment> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query<EngagementRow>(`
        INSERT INTO engagement (file_id, user_did, type, content)
        VALUES ($1, $2, 'comment', $3)
        RETURNING *
      `, [fileId, userDid, content]);

      const row = result.rows[0];
      
      return {
        id: row.engagement_id,
        fileId: row.file_id,
        authorId: row.user_did,
        authorName: authorName || row.user_did.substring(0, 8),
        content: row.content || '',
        timestamp: row.created_at,
        likes: 0
      };
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  }

  /**
   * Get comments for a file
   */
  static async getComments(fileId: string): Promise<Comment[]> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query<EngagementRow>(`
        SELECT * FROM engagement 
        WHERE file_id = $1 AND type = 'comment'
        ORDER BY created_at ASC
      `, [fileId]);

      return result.rows.map(row => ({
        id: row.engagement_id,
        fileId: row.file_id,
        authorId: row.user_did,
        authorName: row.user_did.substring(0, 8),
        content: row.content || '',
        timestamp: row.created_at,
        likes: 0 // TODO: Add comment likes if needed
      }));
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

