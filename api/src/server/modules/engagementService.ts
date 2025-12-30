/**
 * Engagement Service
 * Manages likes, comments, and shares for files
 * Includes bot detection and verification tracking
 */

import { getDatabasePool } from '../utils/database';
import { BotDetectionService } from './botDetectionService';

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
  likes: string[]; // Array of user IDs who liked
  parentCommentId?: string; // For threaded replies
  replies?: Comment[];
  postReply?: {
    fileId: string;
    thumbnail?: string;
    title?: string;
  };
  fileOwnerDid?: string; // File owner DID (owns the content)
}

export interface EngagementStats {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface EngagementMetrics {
  total: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  verified: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  unverified: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  recommendationScore: number;
}

export class EngagementService {
  /**
   * Check if user is verified
   */
  private static async isUserVerified(userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    try {
      const result = await db.query(`
        SELECT 1 FROM verified_identities 
        WHERE identity_id = $1 AND is_active = TRUE
        LIMIT 1
      `, [userDid]);
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get recent action count for rate limiting
   */
  private static async getRecentActionCount(userDid: string, window: string): Promise<number> {
    const db = getDatabasePool();
    const windowMs = window === '1 hour' ? 3600000 : 3600000; // Default to 1 hour
    
    const result = await db.query(`
      SELECT COUNT(*) as count
      FROM engagement
      WHERE user_did = $1
      AND created_at > NOW() - INTERVAL '1 hour'
    `, [userDid]);
    
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Toggle like for a file with bot detection and verification tracking
   */
  static async toggleLike(fileId: string, userDid: string): Promise<{ liked: boolean; count: number }> {
    const db = getDatabasePool();
    
    try {
      // Check verification status
      const isVerified = await this.isUserVerified(userDid);
      
      // Calculate bot score for unverified users
      let botScore = 0.0;
      if (!isVerified) {
        const botResult = await BotDetectionService.calculateBotScore(userDid);
        botScore = botResult.botScore;
        
        // Check rate limits
        const rateLimit = BotDetectionService.getRateLimitForBotScore(botScore);
        const recentActions = await this.getRecentActionCount(userDid, rateLimit.window);
        
        if (recentActions >= rateLimit.maxActions) {
          throw new Error(`Rate limit: ${rateLimit.maxActions} actions per ${rateLimit.window} allowed`);
        }
      }

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
        // Like - add the engagement with verification and bot score
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type, is_verified, bot_score)
          VALUES ($1, $2, 'like', $3, $4)
          ON CONFLICT (file_id, user_did, type) DO NOTHING
        `, [fileId, userDid, isVerified, botScore]);
      }

      // Get updated count
      const countResult = await db.query(`
        SELECT COUNT(*) as count FROM engagement 
        WHERE file_id = $1 AND type = 'like'
      `, [fileId]);

      const count = parseInt(countResult.rows[0].count, 10);
      const liked = existing.rows.length === 0; // If it didn't exist, now it's liked

      // Note: Activity logging and notifications are handled by API endpoints
      // which have access to user credentials for Google Drive storage

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
   * Toggle dislike for a file
   */
  static async toggleDislike(fileId: string, userDid: string): Promise<{ disliked: boolean; count: number }> {
    const db = getDatabasePool();
    
    try {
      // Check if already disliked
      const existing = await db.query(`
        SELECT engagement_id FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'dislike'
        LIMIT 1
      `, [fileId, userDid]);

      if (existing.rows.length > 0) {
        // Remove dislike
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'dislike'
        `, [fileId, userDid]);
      } else {
        // Add dislike - remove like if exists (user can't like and dislike)
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'like'
        `, [fileId, userDid]);
        
        // Add dislike
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type)
          VALUES ($1, $2, 'dislike')
          ON CONFLICT (file_id, user_did, type) DO NOTHING
        `, [fileId, userDid]);
      }

      // Get updated count
      const countResult = await db.query(`
        SELECT COUNT(*) as count FROM engagement 
        WHERE file_id = $1 AND type = 'dislike'
      `, [fileId]);

      const count = parseInt(countResult.rows[0].count, 10);
      const disliked = existing.rows.length === 0; // If it didn't exist, now it's disliked

      return { disliked, count };
    } catch (error) {
      console.error('Failed to toggle dislike:', error);
      throw error;
    }
  }

  /**
   * Check if user has disliked a file
   */
  static async isDisliked(fileId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    const result = await db.query(`
      SELECT 1 FROM engagement 
      WHERE file_id = $1 AND user_did = $2 AND type = 'dislike'
      LIMIT 1
    `, [fileId, userDid]);

    return result.rows.length > 0;
  }

  /**
   * Add a comment with bot detection and verification tracking
   * File owner has the content, pN commentor references it
   * Comments wouldn't exist without the content; creator owns original content and hosts it
   */
  static async addComment(
    fileId: string,
    userDid: string,
    content: string,
    authorName?: string,
    fileOwnerDid?: string,
    parentCommentId?: string,
    postReply?: { fileId: string; thumbnail?: string; title?: string }
  ): Promise<Comment> {
    const db = getDatabasePool();
    
    try {
      // Check verification status
      const isVerified = await this.isUserVerified(userDid);
      
      // Calculate bot score for unverified users
      let botScore = 0.0;
      if (!isVerified) {
        const botResult = await BotDetectionService.calculateBotScore(userDid);
        botScore = botResult.botScore;
        
        // Check rate limits
        const rateLimit = BotDetectionService.getRateLimitForBotScore(botScore);
        const recentActions = await this.getRecentActionCount(userDid, rateLimit.window);
        
        if (recentActions >= rateLimit.maxActions) {
          throw new Error(`Rate limit: ${rateLimit.maxActions} actions per ${rateLimit.window} allowed`);
        }
      }

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
        parentCommentId: parentCommentId || null,
        postReply: postReply || null,
        note: 'File owner owns content; commentor references it'
      };

      const result = await db.query<EngagementRow>(`
        INSERT INTO engagement (file_id, user_did, type, content, is_verified, bot_score)
        VALUES ($1, $2, 'comment', $3, $4, $5)
        RETURNING *
      `, [fileId, userDid, JSON.stringify(commentData), isVerified, botScore]);

      const row = result.rows[0];
      const parsedContent = JSON.parse(row.content || '{}');
      
      const comment: Comment = {
        id: row.engagement_id,
        fileId: row.file_id,
        authorId: row.user_did, // Commentor DID
        authorName: authorName || row.user_did.substring(0, 8),
        content: parsedContent.content || content,
        timestamp: row.created_at,
        likes: [],
        parentCommentId: parsedContent.parentCommentId || parentCommentId || undefined,
        postReply: parsedContent.postReply || postReply || undefined,
        // Add file owner reference
        fileOwnerDid: parsedContent.fileOwnerDid || ownerDid || undefined
      };

      // Note: Activity logging and notifications are handled by API endpoints
      // which have access to user credentials for Google Drive storage

      return comment;
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  }

  /**
   * Get comments for a file
   * Returns comments with file owner reference, threaded structure
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

      // Get all comments (including replies)
      const result = await db.query<EngagementRow>(`
        SELECT * FROM engagement 
        WHERE file_id = $1 AND type = 'comment'
        ORDER BY created_at ASC
      `, [fileId]);

      // Get comment likes
      const likesResult = await db.query(`
        SELECT content, user_did 
        FROM engagement 
        WHERE file_id = $1 AND type = 'comment_like'
      `, [fileId]);

      // Build a map of comment likes
      const commentLikesMap = new Map<string, string[]>();
      likesResult.rows.forEach(row => {
        try {
          const parsed = JSON.parse(row.content || '{}');
          const commentId = parsed.commentId;
          if (commentId) {
            if (!commentLikesMap.has(commentId)) {
              commentLikesMap.set(commentId, []);
            }
            commentLikesMap.get(commentId)!.push(row.user_did);
          }
        } catch {
          // Skip invalid entries
        }
      });

      // Parse all comments
      const allComments = result.rows.map(row => {
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

        const commentId = row.engagement_id;
        const likes = commentLikesMap.get(commentId) || [];

        return {
          id: commentId,
          fileId: row.file_id,
          authorId: row.user_did, // Commentor DID
          authorName: row.user_did.substring(0, 8),
          content: commentContent,
          timestamp: row.created_at,
          likes,
          parentCommentId: parsedContent.parentCommentId || undefined,
          postReply: parsedContent.postReply || undefined,
          replies: [] as Comment[],
          fileOwnerDid: parsedContent.fileOwnerDid || fileOwnerDid // File owner reference
        } as Comment;
      });

      // Build threaded structure
      const topLevelComments: Comment[] = [];
      const commentMap = new Map<string, Comment>();
      
      // First pass: create map of all comments
      allComments.forEach(comment => {
        commentMap.set(comment.id, comment);
      });

      // Second pass: build tree structure
      allComments.forEach(comment => {
        if (comment.parentCommentId) {
          // This is a reply - add it to parent's replies
          const parent = commentMap.get(comment.parentCommentId);
          if (parent) {
            if (!parent.replies) {
              parent.replies = [];
            }
            parent.replies.push(comment);
          }
        } else {
          // This is a top-level comment
          topLevelComments.push(comment);
        }
      });

      return topLevelComments;
    } catch (error) {
      console.error('Failed to get comments:', error);
      throw error;
    }
  }

  /**
   * Delete all comments (cleanup old comments)
   */
  static async deleteAllComments(): Promise<{ deletedCount: number }> {
    const db = getDatabasePool();
    
    try {
      // Delete all comments
      const result = await db.query(`
        DELETE FROM engagement 
        WHERE type = 'comment'
        RETURNING engagement_id
      `);

      // Also delete all comment likes
      await db.query(`
        DELETE FROM engagement 
        WHERE type = 'comment_like'
      `);

      return { deletedCount: result.rowCount || 0 };
    } catch (error) {
      console.error('Failed to delete all comments:', error);
      throw error;
    }
  }

  /**
   * Like a comment with bot detection and verification tracking
   */
  static async likeComment(fileId: string, commentId: string, userDid: string): Promise<{ liked: boolean; likes: string[] }> {
    const db = getDatabasePool();
    
    try {
      // Check verification status
      const isVerified = await this.isUserVerified(userDid);
      
      // Calculate bot score for unverified users
      let botScore = 0.0;
      if (!isVerified) {
        const botResult = await BotDetectionService.calculateBotScore(userDid);
        botScore = botResult.botScore;
        
        // Check rate limits
        const rateLimit = BotDetectionService.getRateLimitForBotScore(botScore);
        const recentActions = await this.getRecentActionCount(userDid, rateLimit.window);
        
        if (recentActions >= rateLimit.maxActions) {
          throw new Error(`Rate limit: ${rateLimit.maxActions} actions per ${rateLimit.window} allowed`);
        }
      }

      // Check if already liked by looking for existing like with this commentId in content
      const existing = await db.query(`
        SELECT engagement_id FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'comment_like' 
        AND content::jsonb->>'commentId' = $3
        LIMIT 1
      `, [fileId, userDid, commentId]);

      if (existing.rows.length > 0) {
        // Unlike - remove the like
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'comment_like' 
          AND content::jsonb->>'commentId' = $3
        `, [fileId, userDid, commentId]);
      } else {
        // Like - add the like with verification and bot score
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type, content, is_verified, bot_score)
          VALUES ($1, $2, 'comment_like', $3, $4, $5)
        `, [fileId, userDid, JSON.stringify({ commentId }), isVerified, botScore]);
      }

      // Get updated likes list
      const likesResult = await db.query(`
        SELECT user_did FROM engagement 
        WHERE file_id = $1 AND type = 'comment_like' 
        AND content::jsonb->>'commentId' = $2
      `, [fileId, commentId]);

      const likes = likesResult.rows.map(row => row.user_did);
      const liked = existing.rows.length === 0; // If it didn't exist, now it's liked

      return { liked, likes };
    } catch (error) {
      console.error('Failed to like comment:', error);
      throw error;
    }
  }

  /**
   * Record a share with bot detection and verification tracking
   */
  static async recordShare(fileId: string, userDid: string): Promise<number> {
    const db = getDatabasePool();
    
    try {
      // Check verification status
      const isVerified = await this.isUserVerified(userDid);
      
      // Calculate bot score for unverified users
      let botScore = 0.0;
      if (!isVerified) {
        const botResult = await BotDetectionService.calculateBotScore(userDid);
        botScore = botResult.botScore;
        
        // Check rate limits
        const rateLimit = BotDetectionService.getRateLimitForBotScore(botScore);
        const recentActions = await this.getRecentActionCount(userDid, rateLimit.window);
        
        if (recentActions >= rateLimit.maxActions) {
          throw new Error(`Rate limit: ${rateLimit.maxActions} actions per ${rateLimit.window} allowed`);
        }
      }

      await db.query(`
        INSERT INTO engagement (file_id, user_did, type, is_verified, bot_score)
        VALUES ($1, $2, 'share', $3, $4)
        ON CONFLICT (file_id, user_did, type) DO NOTHING
      `, [fileId, userDid, isVerified, botScore]);

      // Get share count
      const countResult = await db.query(`
        SELECT COUNT(*) as count FROM engagement 
        WHERE file_id = $1 AND type = 'share'
      `, [fileId]);

      // Note: Activity logging and notifications are handled by API endpoints
      // which have access to user credentials for Google Drive storage

      return parseInt(countResult.rows[0].count, 10);
    } catch (error) {
      console.error('Failed to record share:', error);
      throw error;
    }
  }

  /**
   * Toggle save for a file with bot detection and verification tracking
   */
  static async toggleSave(fileId: string, userDid: string): Promise<{ saved: boolean; count: number }> {
    const db = getDatabasePool();
    
    try {
      // Check verification status
      const isVerified = await this.isUserVerified(userDid);
      
      // Calculate bot score for unverified users
      let botScore = 0.0;
      if (!isVerified) {
        const botResult = await BotDetectionService.calculateBotScore(userDid);
        botScore = botResult.botScore;
        
        // Check rate limits
        const rateLimit = BotDetectionService.getRateLimitForBotScore(botScore);
        const recentActions = await this.getRecentActionCount(userDid, rateLimit.window);
        
        if (recentActions >= rateLimit.maxActions) {
          throw new Error(`Rate limit: ${rateLimit.maxActions} actions per ${rateLimit.window} allowed`);
        }
      }

      // Check if already saved
      const existing = await db.query(`
        SELECT engagement_id FROM engagement 
        WHERE file_id = $1 AND user_did = $2 AND type = 'save'
        LIMIT 1
      `, [fileId, userDid]);

      if (existing.rows.length > 0) {
        // Unsave - remove the engagement
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'save'
        `, [fileId, userDid]);
      } else {
        // Save - add the engagement with verification and bot score
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type, is_verified, bot_score)
          VALUES ($1, $2, 'save', $3, $4)
          ON CONFLICT (file_id, user_did, type) DO NOTHING
        `, [fileId, userDid, isVerified, botScore]);
      }

      // Get updated count
      const countResult = await db.query(`
        SELECT COUNT(*) as count FROM engagement 
        WHERE file_id = $1 AND type = 'save'
      `, [fileId]);

      const count = parseInt(countResult.rows[0].count, 10);
      const saved = existing.rows.length === 0; // If it didn't exist, now it's saved

      return { saved, count };
    } catch (error) {
      console.error('Failed to toggle save:', error);
      throw error;
    }
  }

  /**
   * Check if user has saved a file
   */
  static async isSaved(fileId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    const result = await db.query(`
      SELECT 1 FROM engagement 
      WHERE file_id = $1 AND user_did = $2 AND type = 'save'
      LIMIT 1
    `, [fileId, userDid]);

    return result.rows.length > 0;
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
        shares: 0,
        saves: 0
      };

      result.rows.forEach(row => {
        const type = row.type;
        const count = parseInt(row.count, 10);
        if (type === 'like') stats.likes = count;
        else if (type === 'comment') stats.comments = count;
        else if (type === 'share') stats.shares = count;
        else if (type === 'save') stats.saves = count;
      });

      return stats;
    } catch (error) {
      console.error('Failed to get engagement stats:', error);
      return { likes: 0, comments: 0, shares: 0, saves: 0 };
    }
  }

  /**
   * Get comprehensive engagement metrics with verified/unverified breakdown
   */
  static async getEngagementMetrics(fileId: string): Promise<EngagementMetrics> {
    const db = getDatabasePool();
    
    try {
      const result = await db.query(`
        SELECT 
          type,
          COUNT(*) FILTER (WHERE is_verified = TRUE) as verified_count,
          COUNT(*) FILTER (WHERE is_verified = FALSE AND bot_score < 0.5) as unverified_count,
          COUNT(*) as total_count
        FROM engagement
        WHERE file_id = $1
        GROUP BY type
      `, [fileId]);

      const metrics: EngagementMetrics = {
        total: { likes: 0, comments: 0, shares: 0, saves: 0 },
        verified: { likes: 0, comments: 0, shares: 0, saves: 0 },
        unverified: { likes: 0, comments: 0, shares: 0, saves: 0 },
        recommendationScore: 0
      };

      result.rows.forEach(row => {
        const type = row.type;
        const verifiedCount = parseInt(row.verified_count, 10) || 0;
        const unverifiedCount = parseInt(row.unverified_count, 10) || 0;
        const totalCount = parseInt(row.total_count, 10) || 0;

        if (type === 'like') {
          metrics.total.likes = totalCount;
          metrics.verified.likes = verifiedCount;
          metrics.unverified.likes = unverifiedCount;
        } else if (type === 'comment') {
          metrics.total.comments = totalCount;
          metrics.verified.comments = verifiedCount;
          metrics.unverified.comments = unverifiedCount;
        } else if (type === 'share') {
          metrics.total.shares = totalCount;
          metrics.verified.shares = verifiedCount;
          metrics.unverified.shares = unverifiedCount;
        } else if (type === 'save') {
          metrics.total.saves = totalCount;
          metrics.verified.saves = verifiedCount;
          metrics.unverified.saves = unverifiedCount;
        }
      });

      // Calculate recommendation score using weighted algorithm
      metrics.recommendationScore = this.calculateRecommendationScore(metrics);

      return metrics;
    } catch (error) {
      console.error('Failed to get engagement metrics:', error);
      return {
        total: { likes: 0, comments: 0, shares: 0, saves: 0 },
        verified: { likes: 0, comments: 0, shares: 0, saves: 0 },
        unverified: { likes: 0, comments: 0, shares: 0, saves: 0 },
        recommendationScore: 0
      };
    }
  }

  /**
   * Calculate recommendation score using weighted algorithm
   * Verified engagement weighted 10-15x, unverified weighted 0.5-1x
   */
  private static calculateRecommendationScore(metrics: EngagementMetrics): number {
    // Weight configuration
    const WEIGHTS = {
      verified: {
        like: 10.0,      // Verified likes worth 10x
        comment: 15.0,   // Verified comments worth 15x (more valuable)
        share: 8.0,      // Verified shares worth 8x
        save: 5.0        // Verified saves worth 5x
      },
      unverified: {
        like: 0.5,       // Unverified likes worth 0.5x (heavily discounted)
        comment: 1.0,    // Unverified comments worth 1x (slightly discounted)
        share: 0.3,      // Unverified shares worth 0.3x (heavily discounted)
        save: 0.2        // Unverified saves worth 0.2x (heavily discounted)
      }
    };

    // Calculate weighted score
    const verifiedScore = 
      (metrics.verified.likes * WEIGHTS.verified.like) +
      (metrics.verified.comments * WEIGHTS.verified.comment) +
      (metrics.verified.shares * WEIGHTS.verified.share) +
      (metrics.verified.saves * WEIGHTS.verified.save);

    const unverifiedScore = 
      (metrics.unverified.likes * WEIGHTS.unverified.like) +
      (metrics.unverified.comments * WEIGHTS.unverified.comment) +
      (metrics.unverified.shares * WEIGHTS.unverified.share) +
      (metrics.unverified.saves * WEIGHTS.unverified.save);

    // Total recommendation score
    return verifiedScore + unverifiedScore;
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
        statsMap.set(fileId, { likes: 0, comments: 0, shares: 0, saves: 0 });
      });

      // Populate stats
      result.rows.forEach(row => {
        const fileId = row.file_id;
        const type = row.type;
        const count = parseInt(row.count, 10);
        
        const stats = statsMap.get(fileId) || { likes: 0, comments: 0, shares: 0, saves: 0 };
        if (type === 'like') stats.likes = count;
        else if (type === 'comment') stats.comments = count;
        else if (type === 'share') stats.shares = count;
        else if (type === 'save') stats.saves = count;
        
        statsMap.set(fileId, stats);
      });

      return statsMap;
    } catch (error) {
      console.error('Failed to get bulk engagement stats:', error);
      // Return empty stats for all files
      fileIds.forEach(fileId => {
        statsMap.set(fileId, { likes: 0, comments: 0, shares: 0, saves: 0 });
      });
      return statsMap;
    }
  }

  /**
   * Update public like count (insert or delete record for counting)
   * Used for event-driven updates when user likes/unlikes
   * Note: Individual user engagement is stored in Google Drive, this is only for public count aggregation
   */
  static async toggleLikePublicCount(fileId: string, userDid: string, liked: boolean): Promise<void> {
    const db = getDatabasePool();
    
    try {
      if (liked) {
        // Insert record to increment count
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type)
          VALUES ($1, $2, 'like')
          ON CONFLICT (file_id, user_did, type) DO NOTHING
        `, [fileId, userDid]);
      } else {
        // Delete record to decrement count
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'like'
        `, [fileId, userDid]);
      }
    } catch (error) {
      console.error('Failed to update public like count:', error);
      // Don't throw - counting is best effort, user engagement is in Google Drive
    }
  }

  /**
   * Update public dislike count (insert or delete record for counting)
   */
  static async toggleDislikePublicCount(fileId: string, userDid: string, disliked: boolean): Promise<void> {
    const db = getDatabasePool();
    
    try {
      if (disliked) {
        // Insert record to increment count
        await db.query(`
          INSERT INTO engagement (file_id, user_did, type)
          VALUES ($1, $2, 'dislike')
          ON CONFLICT (file_id, user_did, type) DO NOTHING
        `, [fileId, userDid]);
      } else {
        // Delete record to decrement count
        await db.query(`
          DELETE FROM engagement 
          WHERE file_id = $1 AND user_did = $2 AND type = 'dislike'
        `, [fileId, userDid]);
      }
    } catch (error) {
      console.error('Failed to update public dislike count:', error);
      // Don't throw - counting is best effort
    }
  }

  /**
   * Increment public comment count
   * Note: Individual comment content is stored in Google Drive, this is only for counting
   */
  static async incrementCommentCount(fileId: string, userDid: string): Promise<void> {
    const db = getDatabasePool();
    
    try {
      // Insert a record to increment count
      // Note: The UNIQUE constraint limits one record per user per file per type,
      // but comments can be multiple per user. This is a limitation of the current schema.
      // For now, we'll insert and let it fail silently on conflict (best effort counting)
      await db.query(`
        INSERT INTO engagement (file_id, user_did, type)
        VALUES ($1, $2, 'comment')
        ON CONFLICT (file_id, user_did, type) DO NOTHING
      `, [fileId, userDid]);
    } catch (error) {
      console.error('Failed to increment comment count:', error);
      // Don't throw - counting is best effort
    }
  }
}

