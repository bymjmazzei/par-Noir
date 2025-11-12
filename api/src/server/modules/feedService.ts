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
   * Creator stores subscriber info on their Google Drive
   * Subscriber stores local reference (handled by frontend)
   */
  static async subscribeToFeed(feedId: string, userDid: string, creatorGoogleTokens?: any): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      // Get feed to find creator
      const feed = await this.getFeedById(feedId);
      
      // Check if already subscribed
      const existing = await db.query(`
        SELECT subscription_id FROM feed_subscriptions 
        WHERE feed_id = $1 AND user_did = $2
        LIMIT 1
      `, [feedId, userDid]);
      
      const isNewSubscription = existing.rows.length === 0;
      if (!feed) {
        throw new Error('Feed not found');
      }

      const creatorDid = feed.creatorId;

      // Add to feed_subscriptions table (existing)
      await db.query(`
        INSERT INTO feed_subscriptions (feed_id, user_did)
        VALUES ($1, $2)
        ON CONFLICT (feed_id, user_did) DO NOTHING
      `, [feedId, userDid]);

      // Add to creator subscriber index (database)
      await db.query(`
        INSERT INTO creator_subscriber_index (creator_did, subscriber_did, feed_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (creator_did, subscriber_did, feed_id) 
        DO UPDATE SET subscribed_at = NOW()
      `, [creatorDid, userDid, feedId]);

      // Store subscriber info on creator's Google Drive (if creator has Drive connected)
      if (creatorGoogleTokens) {
        const { CreatorSubscriberStorage } = await import('./creatorSubscriberStorage');
        await CreatorSubscriberStorage.storeSubscriberOnCreatorDrive(
          creatorDid,
          feedId,
          userDid,
          creatorGoogleTokens
        );
      }

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
   * Removes from database and creator's Google Drive
   */
  static async unsubscribeFromFeed(feedId: string, userDid: string, creatorGoogleTokens?: any): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      // Get feed to find creator
      const feed = await this.getFeedById(feedId);
      if (!feed) {
        throw new Error('Feed not found');
      }

      const creatorDid = feed.creatorId;

      // Remove from feed_subscriptions table
      await db.query(`
        DELETE FROM feed_subscriptions 
        WHERE feed_id = $1 AND user_did = $2
      `, [feedId, userDid]);

      // Remove from creator subscriber index
      await db.query(`
        DELETE FROM creator_subscriber_index
        WHERE creator_did = $1 AND subscriber_did = $2 AND feed_id = $3
      `, [creatorDid, userDid, feedId]);

      // Remove from creator's Google Drive (if creator has Drive connected)
      if (creatorGoogleTokens) {
        const { CreatorSubscriberStorage } = await import('./creatorSubscriberStorage');
        await CreatorSubscriberStorage.removeSubscriberFromCreatorDrive(
          creatorDid,
          feedId,
          userDid,
          creatorGoogleTokens
        );
      }

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
   * Get creator's subscriber index (all users subscribed to creator's feeds)
   */
  static async getCreatorSubscriberIndex(creatorDid: string): Promise<Array<{
    subscriberDid: string;
    feedId: string;
    subscribedAt: string;
    syncedToDrive: boolean;
  }>> {
    const db = getDatabasePool();
    
    const result = await db.query<{
      subscriber_did: string;
      feed_id: string;
      subscribed_at: string;
      synced_to_drive: boolean;
    }>(`
      SELECT subscriber_did, feed_id, subscribed_at, synced_to_drive
      FROM creator_subscriber_index
      WHERE creator_did = $1
      ORDER BY subscribed_at DESC
    `, [creatorDid]);

    return result.rows.map(row => ({
      subscriberDid: row.subscriber_did,
      feedId: row.feed_id,
      subscribedAt: row.subscribed_at,
      syncedToDrive: row.synced_to_drive
    }));
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

      // Trigger notification for feed subscribers
      try {
        const feed = await this.getFeedById(feedId);
        if (feed) {
          const { NotificationService } = await import('./notificationService');
          await NotificationService.notifyFeedNewPost(feedId, fileId, feed.feedName, feed.creatorId);
        }
      } catch (error) {
        console.warn('Failed to send feed new post notification:', error);
        // Don't fail the operation if notification fails
      }

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
   * Discover feeds with filters (for catalogue/store interface)
   */
  static async discoverFeeds(filters?: {
    category?: FeedCategory;
    sort?: 'new' | 'trending' | 'popular';
    limit?: number;
    offset?: number;
  }): Promise<{ feeds: Feed[]; total: number }> {
    const db = getDatabasePool();
    
    let query = `
      SELECT f.*, 
        COUNT(DISTINCT fs.user_did) as subscriber_count,
        COUNT(DISTINCT fp.file_id) as post_count
      FROM feeds f
      LEFT JOIN feed_subscriptions fs ON f.feed_id = fs.feed_id
      LEFT JOIN feed_posts fp ON f.feed_id = fp.feed_id
      WHERE f.creator_tier IN ('feed', 'self-hosted')
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (filters?.category) {
      paramCount++;
      query += ` AND f.feed_category = $${paramCount}`;
      params.push(filters.category);
    }

    // Group by feed fields for aggregation
    query += ' GROUP BY f.feed_id';

    // Sorting
    if (filters?.sort === 'trending') {
      // Trending: most subscribers in last 7 days
      query += ` ORDER BY 
        (SELECT COUNT(*) FROM feed_subscriptions fs2 
         WHERE fs2.feed_id = f.feed_id 
         AND fs2.subscribed_at > NOW() - INTERVAL '7 days') DESC,
        subscriber_count DESC`;
    } else if (filters?.sort === 'popular') {
      // Popular: most subscribers overall
      query += ' ORDER BY subscriber_count DESC, post_count DESC';
    } else {
      // New: most recently created
      query += ' ORDER BY f.created_at DESC';
    }

    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(DISTINCT f.feed_id) as total FROM');
    const countResult = await db.query(countQuery.replace(/GROUP BY.*/, '').replace(/ORDER BY.*/, ''), params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Add pagination
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
   * Get feed categories with counts
   */
  static async getFeedCategories(): Promise<Array<{ category: FeedCategory; count: number }>> {
    const db = getDatabasePool();
    
    const result = await db.query<{ feed_category: string; count: string }>(`
      SELECT feed_category, COUNT(*) as count
      FROM feeds
      WHERE creator_tier IN ('feed', 'self-hosted')
        AND feed_category IS NOT NULL
      GROUP BY feed_category
      ORDER BY count DESC
    `);

    return result.rows.map(row => ({
      category: row.feed_category as FeedCategory,
      count: parseInt(row.count, 10)
    }));
  }

  /**
   * Get trending feeds (most subscribers in last 7 days)
   */
  static async getTrendingFeeds(filters?: {
    limit?: number;
    category?: FeedCategory;
  }): Promise<Feed[]> {
    const db = getDatabasePool();
    
    let query = `
      SELECT f.*,
        COUNT(DISTINCT fs.user_did) as subscriber_count,
        COUNT(DISTINCT fp.file_id) as post_count
      FROM feeds f
      LEFT JOIN feed_subscriptions fs ON f.feed_id = fs.feed_id
      LEFT JOIN feed_posts fp ON f.feed_id = fp.feed_id
      WHERE f.creator_tier IN ('feed', 'self-hosted')
        AND EXISTS (
          SELECT 1 FROM feed_subscriptions fs2
          WHERE fs2.feed_id = f.feed_id
          AND fs2.subscribed_at > NOW() - INTERVAL '7 days'
        )
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (filters?.category) {
      paramCount++;
      query += ` AND f.feed_category = $${paramCount}`;
      params.push(filters.category);
    }

    query += ' GROUP BY f.feed_id';
    query += ` ORDER BY 
      (SELECT COUNT(*) FROM feed_subscriptions fs3 
       WHERE fs3.feed_id = f.feed_id 
       AND fs3.subscribed_at > NOW() - INTERVAL '7 days') DESC,
      subscriber_count DESC`;

    if (filters?.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    const result = await db.query<FeedRow>(query, params);
    
    return result.rows.map(row => this.rowToFeed(row));
  }

  /**
   * Get recommended feeds for user (based on their subscriptions and categories)
   */
  static async getRecommendedFeeds(filters: {
    userDid: string;
    limit?: number;
  }): Promise<Feed[]> {
    const db = getDatabasePool();
    
    // Get user's subscribed feed categories
    const userCategoriesResult = await db.query<{ feed_category: string }>(`
      SELECT DISTINCT f.feed_category
      FROM feeds f
      INNER JOIN feed_subscriptions fs ON f.feed_id = fs.feed_id
      WHERE fs.user_did = $1
        AND f.feed_category IS NOT NULL
    `, [filters.userDid]);

    const userCategories = userCategoriesResult.rows.map(row => row.feed_category);

    let query = `
      SELECT f.*,
        COUNT(DISTINCT fs.user_did) as subscriber_count,
        COUNT(DISTINCT fp.file_id) as post_count
      FROM feeds f
      LEFT JOIN feed_subscriptions fs ON f.feed_id = fs.feed_id
      LEFT JOIN feed_posts fp ON f.feed_id = fp.feed_id
      WHERE f.creator_tier IN ('feed', 'self-hosted')
        AND NOT EXISTS (
          SELECT 1 FROM feed_subscriptions fs2
          WHERE fs2.feed_id = f.feed_id
          AND fs2.user_did = $1
        )
    `;
    const params: any[] = [filters.userDid];
    let paramCount = 1;

    // Prioritize feeds in categories user already subscribes to
    if (userCategories.length > 0) {
      paramCount++;
      query += ` AND (f.feed_category = ANY($${paramCount}::text[]) OR f.feed_category IS NULL)`;
      params.push(userCategories);
    }

    query += ' GROUP BY f.feed_id';
    query += ' ORDER BY subscriber_count DESC, post_count DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(filters.limit);
    }

    const result = await db.query<FeedRow>(query, params);
    
    return result.rows.map(row => this.rowToFeed(row));
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

