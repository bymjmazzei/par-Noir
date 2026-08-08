/**
 * Feed Service
 * Manages feeds, subscriptions, and feed posts
 */

import { getDatabasePool } from '../utils/database';
import { DriveIndexError } from './pnDriveIndex';

// Types (duplicated from frontend to avoid circular dependencies)
export type FeedCategory =
  | 'entertainment'
  | 'education'
  | 'news'
  | 'opinion'
  | 'promotion'
  | 'art'
  | 'community'
  | 'ideology'
  | 'lifestyle';

// ContentRating removed - feeds now accept all content (public and NSFW based on user preferences)

export interface Feed {
  feedId: string;
  feedName: string;
  feedCategory: FeedCategory;
  feedDescription?: string;
  creatorId: string;
  creatorTier: 'free' | 'feed' | 'self-hosted';
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
    links?: Array<{
      label: string;
      url: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  subscriberCount?: number;
  postCount?: number;
  isPaid?: boolean;
  monthlyPrice?: number;
  annualPrice?: number;
  subdomain?: string;
}

export interface FeedRow {
  feed_id: string;
  feed_name: string;
  feed_category: string | null;
  feed_description: string | null;
  creator_did: string;
  creator_tier: string;
  rating_range: any[]; // Legacy field - kept for DB compatibility but not used
  branding: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
    links?: Array<{
      label: string;
      url: string;
    }>;
  };
  subscriber_count: number;
  post_count: number;
  created_at: string;
  updated_at: string;
  is_paid?: boolean;
  monthly_price?: number;
  annual_price?: number;
  subdomain?: string | null;
  sub_pn_identifier?: string | null;
  owner_pn_identifier?: string | null;
  status?: string | null;
  google_drive_folder_id?: string | null;
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
    isPaid?: boolean;
    monthlyPrice?: number;
    annualPrice?: number;
    subdomain?: string;
    // feedRatingRange removed - feeds accept all content
    branding?: {
      bannerImage?: string;
      avatar?: string;
      bio?: string;
    };
    googleDriveFolderId?: string; // Optional: Google Drive folder ID for feed
  }): Promise<Feed> {
    const db = getDatabasePool();
    
    const result = await db.query<FeedRow>(`
      INSERT INTO feeds (
        feed_name, feed_category, feed_description, creator_did, creator_tier,
        rating_range, branding, is_paid, monthly_price, annual_price, subdomain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      data.feedName,
      data.feedCategory || null,
      data.feedDescription || null,
      data.creatorDid,
      data.creatorTier || 'free',
      JSON.stringify([]), // Legacy field - always empty now
      JSON.stringify(data.branding || {}),
      data.isPaid || false,
      data.monthlyPrice ?? null,
      data.annualPrice ?? null,
      data.subdomain || null
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
   * Check if user has access to feed (owner or delegate)
   */
  static async hasFeedAccess(feedId: string, userPnIdentifier: string, requiredPermission: 'read' | 'write' | 'manage' = 'read'): Promise<boolean> {
    const db = getDatabasePool();
    
    // Check if user is owner
    const feed = await this.getFeedById(feedId);
    if (!feed) {
      return false;
    }

    if (feed.creatorId === userPnIdentifier) {
      return true; // Owner has all permissions
    }

    const normalizeUser = (pn: string) => {
      const t = pn.trim();
      return t.startsWith('pn-') ? t : `pn-${t}`;
    };
    const userNorm = normalizeUser(userPnIdentifier);

    // Check if user is a delegate with required permission (feed_delegations)
    const delegationResult = await db.query(`
      SELECT permissions FROM feed_delegations 
      WHERE feed_id = $1 AND (delegate_did = $2 OR delegate_did = $3)
      LIMIT 1
      `, [feedId, userPnIdentifier, userNorm]);

    let permissions: string[] | null = null;

    if (delegationResult.rows.length > 0) {
      permissions = JSON.parse(delegationResult.rows[0].permissions || '["read"]');
    } else {
      // Bridge: owned-asset feed scopes on pn_asset_delegations
      const assetDel = await db.query(
        `SELECT d.scope FROM pn_asset_delegations d
         JOIN pn_owned_assets oa ON oa.id = d.owned_asset_id
         WHERE oa.kind = 'feed' AND oa.status = 'active'
           AND (oa.metadata->>'feedId') = $1
           AND d.status = 'active'
           AND (d.delegatee_pn_identifier = $2 OR d.delegatee_pn_identifier = $3)
         LIMIT 1`,
        [feedId, userPnIdentifier, userNorm]
      );
      if (assetDel.rows.length > 0) {
        const scope = String(assetDel.rows[0].scope || 'read');
        if (scope === '*' || scope === 'manage') {
          permissions = ['read', 'write', 'manage'];
        } else if (scope === 'write') {
          permissions = ['read', 'write'];
        } else {
          permissions = ['read'];
        }
      }
    }

    if (!permissions) {
      return false;
    }
    
    // Permission hierarchy: manage > write > read
    if (requiredPermission === 'read') {
      return permissions.includes('read') || permissions.includes('write') || permissions.includes('manage');
    } else if (requiredPermission === 'write') {
      return permissions.includes('write') || permissions.includes('manage');
    } else if (requiredPermission === 'manage') {
      return permissions.includes('manage');
    }

    return false;
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
      // ratingRange removed - feeds accept all content
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

    // ratingRange update removed - feeds accept all content

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
  static async subscribeToFeed(feedId: string, userPnIdentifier: string, creatorGoogleTokens?: any): Promise<boolean> {
    const db = getDatabasePool();
    
    try {
      // Get feed to find creator
      const feed = await this.getFeedById(feedId);
      
      // Check if already subscribed
      const existing = await db.query(`
        SELECT subscription_id FROM feed_subscriptions 
        WHERE feed_id = $1 AND user_did = $2
        LIMIT 1
      `, [feedId, userPnIdentifier]);
      
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
      `, [feedId, userPnIdentifier]);

      // Add to creator subscriber index (database)
      await db.query(`
        INSERT INTO creator_subscriber_index (creator_did, subscriber_did, feed_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (creator_did, subscriber_did, feed_id) 
        DO UPDATE SET subscribed_at = NOW()
      `, [creatorDid, userPnIdentifier, feedId]);

      const { CreatorSubscriberStorage } = await import('./creatorSubscriberStorage');
      await CreatorSubscriberStorage.storeSubscriberOnCreatorDrive(
        creatorDid,
        feedId,
        userPnIdentifier,
        creatorGoogleTokens
      );

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
  static async unsubscribeFromFeed(feedId: string, userPnIdentifier: string, creatorGoogleTokens?: any): Promise<boolean> {
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
      `, [feedId, userPnIdentifier]);

      // Remove from creator subscriber index
      await db.query(`
        DELETE FROM creator_subscriber_index
        WHERE creator_did = $1 AND subscriber_did = $2 AND feed_id = $3
      `, [creatorDid, userPnIdentifier, feedId]);

      const { CreatorSubscriberStorage } = await import('./creatorSubscriberStorage');
      await CreatorSubscriberStorage.removeSubscriberFromCreatorDrive(
        creatorDid,
        feedId,
        userPnIdentifier,
        creatorGoogleTokens
      );

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
  static async isSubscribed(feedId: string, userPnIdentifier: string): Promise<boolean> {
    const db = getDatabasePool();
    
    const result = await db.query(`
      SELECT 1 FROM feed_subscriptions 
      WHERE feed_id = $1 AND user_did = $2
      LIMIT 1
      `, [feedId, userPnIdentifier]);

    return result.rows.length > 0;
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(userPnIdentifier: string): Promise<Feed[]> {
    const db = getDatabasePool();
    
    const result = await db.query<FeedRow>(`
      SELECT f.* FROM feeds f
      INNER JOIN feed_subscriptions fs ON f.feed_id = fs.feed_id
      WHERE fs.user_did = $1
      ORDER BY fs.subscribed_at DESC
    `, [userPnIdentifier]);

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

      // NOTE: Subscriber push from this path is intentionally deferred. This method has no
      // subscriber Google credentials; notifications are surfaced when subscribers pull (e.g.
      // inbox/notifications endpoints) or via a future background job that resolves credentials.

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
    userPnIdentifier: string;
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
    `, [filters.userPnIdentifier]);

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
    const params: any[] = [filters.userPnIdentifier];
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
   * Activate feed after verification
   * Creates sub-pN identifier, Google Drive folder structure, owned-asset registry row, and activates feed
   */
  static async activateFeedAfterVerification(
    feedId: string,
    creatorDid: string,
    verificationData: {
      verificationId: string;
      verifiedZKPs: any;
    },
    opts?: { cloudAccessToken?: string }
  ): Promise<Feed> {
    const db = getDatabasePool();
    const crypto = await import('crypto');

    try {
      // Get feed
      const feed = await this.getFeedById(feedId);
      if (!feed) {
        throw new Error('Feed not found');
      }

      const { storageCredentialsService } = await import('./storageCredentialsService');
      const creatorCredentials = await storageCredentialsService.findCredentialsByIdentityCandidates([creatorDid]);

      if (!creatorCredentials) {
        throw new Error('Creator storage not connected — designate a social cloud provider first');
      }

      const ownerPnIdentifier = creatorCredentials.identityId;
      const cloudAccessToken = opts?.cloudAccessToken?.trim();
      if (!cloudAccessToken) {
        throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
      }

      const registerOwnedFeedAsset = async (subPnIdentifier: string, rootPn: string) => {
        const existing = await db.query(
          `SELECT id FROM pn_owned_assets
           WHERE kind = 'feed' AND status = 'active' AND (metadata->>'feedId') = $1
           LIMIT 1`,
          [feedId]
        );
        if (existing.rows.length > 0) return;
        const { OwnedAssetService } = await import('./ownedAssetService');
        await OwnedAssetService.createAsset(
          {
            rootPnIdentifier: rootPn,
            subjectPnIdentifier: subPnIdentifier,
            kind: 'feed',
            metadata: {
              feedId,
              feedName: feed.feedName,
              label: feed.feedName
            }
          },
          { accessToken: cloudAccessToken }
        );
      };

      let activatedSubPn: string | null = null;

      try {
        const feedPnName = `feed_${feedId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`;
        const feedPasscode = crypto.randomBytes(16).toString('hex');

        const { generateKeyPairSync } = crypto;
        const { publicKey } = generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        const { encryptFeedTokenField } = await import('./feedTokenCrypto');
        const encryptedPnName = encryptFeedTokenField(feedPnName);
        const encryptedPasscode = encryptFeedTokenField(feedPasscode);
        
        // Store feed tokens (owned by creator's pN)
        await db.query(`
          INSERT INTO feed_tokens (
            feed_id, owner_pn_identifier, encrypted_pn_name, encrypted_passcode, public_key
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (feed_id) DO UPDATE SET
            encrypted_pn_name = $3,
            encrypted_passcode = $4,
            public_key = $5,
            updated_at = NOW()
        `, [feedId, ownerPnIdentifier, encryptedPnName, encryptedPasscode, publicKey]);
        
        // Generate sub-pN identifier from feed tokens using VolumeIdGenerator formula
        // Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → feed-{hash}
        const publicKeyHash = crypto.createHash('sha256').update(publicKey, 'utf8').digest('hex').substring(0, 12);
        const combined = `${feedPnName}:${feedPasscode}:${publicKeyHash}`;
        const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
        const subPnIdentifier = `feed-${hash.substring(0, 12)}`;

        const { isPortableSocialCloud } = await import('./storage/storageProviderUtils');
        const { metadataPath } = await import('@par-noir/user-owned-storage');

        let storageFolderRef: string | null = null;

        if (await isPortableSocialCloud(ownerPnIdentifier)) {
          storageFolderRef = metadataPath('feeds', feedId);
          const { writeSubscribersPortable } = await import('./storage/creatorSubscriberPortableService');
          await writeSubscribersPortable(ownerPnIdentifier, feedId, {
            creatorDid,
            feedId,
            subscribers: [],
            updatedAt: new Date().toISOString()
          });
        } else {
          // Creating the feed folder writes to the creator's Drive, which needs
          // their device-held token. Without one, fail rather than leave the feed
          // marked active with no folder behind it.
          const accessToken = opts?.cloudAccessToken?.trim();
          if (!accessToken) {
            throw new DriveIndexError(
              'Feed folder creation requires the creator\'s Drive token. Activate the feed from an unlocked session that forwards X-PN-Cloud-Access-Token.',
              'CLOUD_TOKEN_REQUIRED'
            );
          }
          const feedFolderName = `par Noir - Feed: ${feed.feedName}`;
          const feedFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: feedFolderName,
              mimeType: 'application/vnd.google-apps.folder'
            })
          });

          if (feedFolderResponse.ok) {
            const folderData = (await feedFolderResponse.json()) as { id: string };
            storageFolderRef = folderData.id;
            const subfolders = ['_metadata', 'top-post', 'posts'];
            for (const subfolderName of subfolders) {
              await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  name: subfolderName,
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: [storageFolderRef]
                })
              });
            }
          }
        }

        // Update feed with sub-pN, owner pN, status, and Google Drive folder ID
        const updateFields: string[] = [];
        const params: any[] = [];
        let paramCount = 0;

        paramCount++;
        updateFields.push(`sub_pn_identifier = $${paramCount}`);
        params.push(subPnIdentifier);

        paramCount++;
        updateFields.push(`owner_pn_identifier = $${paramCount}`);
        params.push(ownerPnIdentifier);

        paramCount++;
        updateFields.push(`status = $${paramCount}`);
        params.push('active');

        if (storageFolderRef) {
          paramCount++;
          updateFields.push(`google_drive_folder_id = $${paramCount}`);
          params.push(storageFolderRef);
        }

        paramCount++;
        updateFields.push(`updated_at = NOW()`);
        params.push(feedId);

        await db.query(`
          UPDATE feeds
          SET ${updateFields.join(', ')}
          WHERE feed_id = $${paramCount}
        `, params);

        // Update payment status
        await db.query(`
          UPDATE feed_payments
          SET status = 'completed', updated_at = NOW()
          WHERE feed_id = $1
        `, [feedId]);

        activatedSubPn = subPnIdentifier;
      } catch (error) {
        console.error('❌ [FeedService] Error activating feed storage path:', error);
        // If Google Drive folder creation fails, still activate the feed
        const combined = `${feedId}:${creatorDid}`;
        const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
        const subPnIdentifier = `feed-${hash.substring(0, 12)}`;

        await db.query(`
          UPDATE feeds
          SET sub_pn_identifier = $1, owner_pn_identifier = $2, status = 'active', updated_at = NOW()
          WHERE feed_id = $3
        `, [subPnIdentifier, ownerPnIdentifier, feedId]);

        await db.query(`
          UPDATE feed_payments
          SET status = 'completed', updated_at = NOW()
          WHERE feed_id = $1
        `, [feedId]);

        activatedSubPn = subPnIdentifier;
      }

      if (!activatedSubPn) {
        throw new Error('Failed to activate feed sub-pN');
      }

      await registerOwnedFeedAsset(activatedSubPn, ownerPnIdentifier);

      const updatedFeed = await this.getFeedById(feedId);
      if (!updatedFeed) {
        throw new Error('Failed to retrieve updated feed');
      }

      console.log(`✅ [FeedService] Feed ${feedId} activated with sub-pN: ${activatedSubPn}`);
      return updatedFeed;
    } catch (error) {
      console.error('❌ [FeedService] Error in activateFeedAfterVerification:', error);
      throw error;
    }
  }

  /**
   * Convert database row to Feed object
   */
  static rowToFeed(row: FeedRow): Feed {
    // Only return feeds for paid tiers (feed or self-hosted)
    // Free tier creators don't have feeds in the Feed interface
    const creatorTier = row.creator_tier === 'free' ? 'feed' : row.creator_tier as 'free' | 'feed' | 'self-hosted';
    
    return {
      feedId: row.feed_id,
      feedName: row.feed_name,
      feedCategory: (row.feed_category as FeedCategory) || 'lifestyle', // Default category
      feedDescription: row.feed_description || undefined,
      // feedRatingRange removed - feeds accept all content
      creatorId: row.creator_did,
      creatorTier: creatorTier,
      branding: row.branding || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      subscriberCount: row.subscriber_count,
      postCount: row.post_count,
      isPaid: row.is_paid || false,
      monthlyPrice: row.monthly_price ? parseFloat(row.monthly_price.toString()) : undefined,
      annualPrice: row.annual_price ? parseFloat(row.annual_price.toString()) : undefined,
      subdomain: row.subdomain || undefined
    };
  }
}

