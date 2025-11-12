/**
 * Feed Service
 * Manages feeds, subscriptions, and feed posts
 */

import { getDatabasePool } from '../utils/database';

// Types (duplicated from frontend to avoid circular dependencies)
export type FeedCategory =
  | 'beauty-fashion'
  | 'sports-fitness'
  | 'tv-film-entertainment'
  | 'music-performing-arts'
  | 'gaming-esports'
  | 'technology-gadgets'
  | 'home-interior-design'
  | 'food-culinary'
  | 'travel-adventure'
  | 'wellness-mental-health'
  | 'business-entrepreneurship'
  | 'science-education'
  | 'art-design'
  | 'diy-maker-culture'
  | 'parenting-family-life'
  | 'eco-sustainability'
  | 'finance-investing'
  | 'motors-automotive'
  | 'humor-meme-culture'
  | 'adults-only';

export type ContentRating =
  | 'GA'
  | 'FF'
  | 'T13+'
  | 'YA16+'
  | 'M18+'
  | 'NSFW'
  | 'X18+';

export interface Feed {
  feedId: string;
  feedName: string;
  feedCategory: FeedCategory;
  feedDescription?: string;
  feedRatingRange: ContentRating[];
  creatorId: string;
  creatorTier: 'feed' | 'self-hosted';
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
  };
  createdAt: string;
  updatedAt: string;
  subscriberCount?: number;
  postCount?: number;
}

export interface FeedRow {
  feed_id: string;
  feed_name: string;
  feed_category: string | null;
  feed_description: string | null;
  creator_did: string;
  creator_tier: string;
  rating_range: ContentRating[];
  branding: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
  };
  subscriber_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
}

export class FeedService {
  /**
   * Create a new feed
   */
  static async createFeed(data: {
    feedName: string;
    feedCategory?: FeedCategory;
    feedDescription?: string;
    creatorDid: string;
    creatorTier?: 'free' | 'feed' | 'self-hosted';
    feedRatingRange?: ContentRating[];
    branding?: {
      bannerImage?: string;
      avatar?: string;
      bio?: string;
    };
  }): Promise<Feed> {
    const db = getDatabasePool();
    
    const result = await db.query<FeedRow>(`
      INSERT INTO feeds (
        feed_name, feed_category, feed_description, creator_did, creator_tier,
        rating_range, branding
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      data.feedName,
      data.feedCategory || null,
      data.feedDescription || null,
      data.creatorDid,
      data.creatorTier || 'free',
      JSON.stringify(data.feedRatingRange || []),
      JSON.stringify(data.branding || {})
    ]);

    return this.rowToFeed(result.rows[0]);
  }

  /**
   * Get feed by ID
   */
  static async getFeedById(feedId: string): Promise<Feed | null> {
    const db = getDatabasePool();
    
    const result = await db.query<FeedRow>(`
      SELECT * FROM feeds WHERE feed_id = $1
    `, [feedId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToFeed(result.rows[0]);
  }

  /**
   * List feeds with optional filters
   */
  static async listFeeds(filters?: {
    category?: FeedCategory;
    creatorDid?: string;
    creatorTier?: 'free' | 'feed' | 'self-hosted';
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ feeds: Feed[]; total: number }> {
    const db = getDatabasePool();
    
    let query = 'SELECT * FROM feeds WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (filters?.category) {
      paramCount++;
      query += ` AND feed_category = $${paramCount}`;
      params.push(filters.category);
    }

    if (filters?.creatorDid) {
      paramCount++;
      query += ` AND creator_did = $${paramCount}`;
      params.push(filters.creatorDid);
    }

    if (filters?.creatorTier) {
      paramCount++;
      query += ` AND creator_tier = $${paramCount}`;
      params.push(filters.creatorTier);
    }

    if (filters?.search) {
      paramCount++;
      query += ` AND (feed_name ILIKE $${paramCount} OR feed_description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Add ordering and pagination
    query += ' ORDER BY created_at DESC';
    
    if (filters?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    if (filters?.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(filters.offset);
    }

    const result = await db.query<FeedRow>(query, params);
    
    return {
      feeds: result.rows.map(row => this.rowToFeed(row)),
      total
    };
  }

  /**
   * Update feed
   */
  static async updateFeed(
    feedId: string,
    updates: {
      feedName?: string;
      feedDescription?: string;
      feedCategory?: FeedCategory;
      ratingRange?: ContentRating[];
      branding?: {
        bannerImage?: string;
        avatar?: string;
        bio?: string;
      };
    }
  ): Promise<Feed | null> {
    const db = getDatabasePool();
    
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (updates.feedName !== undefined) {
      paramCount++;
      updateFields.push(`feed_name = $${paramCount}`);
      params.push(updates.feedName);
    }

    if (updates.feedDescription !== undefined) {
      paramCount++;
      updateFields.push(`feed_description = $${paramCount}`);
      params.push(updates.feedDescription);
    }

    if (updates.feedCategory !== undefined) {
      paramCount++;
      updateFields.push(`feed_category = $${paramCount}`);
      params.push(updates.feedCategory);
    }

    if (updates.ratingRange !== undefined) {
      paramCount++;
      updateFields.push(`rating_range = $${paramCount}`);
      params.push(JSON.stringify(updates.ratingRange));
    }

    if (updates.branding !== undefined) {
      paramCount++;
      updateFields.push(`branding = $${paramCount}`);
      params.push(JSON.stringify(updates.branding));
    }

    if (updateFields.length === 0) {
      return this.getFeedById(feedId);
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    paramCount++;
    params.push(feedId);

    const query = `
      UPDATE feeds 
      SET ${updateFields.join(', ')}
      WHERE feed_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query<FeedRow>(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToFeed(result.rows[0]);
  }

  /**
   * Delete feed
   */
  static async deleteFeed(feedId: string, creatorDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    const result = await db.query(`
      DELETE FROM feeds 
      WHERE feed_id = $1 AND creator_did = $2
    `, [feedId, creatorDid]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Subscribe to feed
   */
  static async subscribeToFeed(feedId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        INSERT INTO feed_subscriptions (feed_id, user_did)
        VALUES ($1, $2)
        ON CONFLICT (feed_id, user_did) DO NOTHING
      `, [feedId, userDid]);

      // Update subscriber count
      await db.query(`
        UPDATE feeds 
        SET subscriber_count = (
          SELECT COUNT(*) FROM feed_subscriptions WHERE feed_id = $1
        )
        WHERE feed_id = $1
      `, [feedId]);

      return true;
    } catch (error) {
      console.error('Failed to subscribe to feed:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from feed
   */
  static async unsubscribeFromFeed(feedId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        DELETE FROM feed_subscriptions 
        WHERE feed_id = $1 AND user_did = $2
      `, [feedId, userDid]);

      // Update subscriber count
      await db.query(`
        UPDATE feeds 
        SET subscriber_count = (
          SELECT COUNT(*) FROM feed_subscriptions WHERE feed_id = $1
        )
        WHERE feed_id = $1
      `, [feedId]);

      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from feed:', error);
      return false;
    }
  }

  /**
   * Check if user is subscribed to feed
   */
  static async isSubscribed(feedId: string, userDid: string): Promise<boolean> {
    const db = getDatabasePool();
    
    const result = await db.query(`
      SELECT 1 FROM feed_subscriptions 
      WHERE feed_id = $1 AND user_did = $2
      LIMIT 1
    `, [feedId, userDid]);

    return result.rows.length > 0;
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(userDid: string): Promise<Feed[]> {
    const db = getDatabasePool();
    
    const result = await db.query<FeedRow>(`
      SELECT f.* FROM feeds f
      INNER JOIN feed_subscriptions fs ON f.feed_id = fs.feed_id
      WHERE fs.user_did = $1
      ORDER BY fs.subscribed_at DESC
    `, [userDid]);

    return result.rows.map(row => this.rowToFeed(row));
  }

  /**
   * Add post to feed
   */
  static async addPostToFeed(
    feedId: string,
    fileId: string,
    addedBy: string
  ): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        INSERT INTO feed_posts (feed_id, file_id, added_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (feed_id, file_id) DO NOTHING
      `, [feedId, fileId, addedBy]);

      // Update post count
      await db.query(`
        UPDATE feeds 
        SET post_count = (
          SELECT COUNT(*) FROM feed_posts WHERE feed_id = $1
        )
        WHERE feed_id = $1
      `, [feedId]);

      return true;
    } catch (error) {
      console.error('Failed to add post to feed:', error);
      return false;
    }
  }

  /**
   * Remove post from feed
   */
  static async removePostFromFeed(feedId: string, fileId: string): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      await db.query(`
        DELETE FROM feed_posts 
        WHERE feed_id = $1 AND file_id = $2
      `, [feedId, fileId]);

      // Update post count
      await db.query(`
        UPDATE feeds 
        SET post_count = (
          SELECT COUNT(*) FROM feed_posts WHERE feed_id = $1
        )
        WHERE feed_id = $1
      `, [feedId]);

      return true;
    } catch (error) {
      console.error('Failed to remove post from feed:', error);
      return false;
    }
  }

  /**
   * Get posts in feed
   */
  static async getFeedPosts(feedId: string): Promise<string[]> {
    const db = getDatabasePool();
    
    const result = await db.query<{ file_id: string }>(`
      SELECT file_id FROM feed_posts 
      WHERE feed_id = $1
      ORDER BY added_at DESC
    `, [feedId]);

    return result.rows.map(row => row.file_id);
  }

  /**
   * Convert database row to Feed object
   */
  private static rowToFeed(row: FeedRow): Feed {
    // Only return feeds for paid tiers (feed or self-hosted)
    // Free tier creators don't have feeds in the Feed interface
    const creatorTier = row.creator_tier === 'free' ? 'feed' : row.creator_tier as 'feed' | 'self-hosted';
    
    return {
      feedId: row.feed_id,
      feedName: row.feed_name,
      feedCategory: (row.feed_category as FeedCategory) || 'beauty-fashion', // Default category
      feedDescription: row.feed_description || undefined,
      feedRatingRange: row.rating_range || [],
      creatorId: row.creator_did,
      creatorTier: creatorTier,
      branding: row.branding || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      subscriberCount: row.subscriber_count,
      postCount: row.post_count
    };
  }
}

