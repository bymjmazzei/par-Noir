/**
 * Feed Service
 * Manages feeds, subscriptions, and feed posts
 */

import { randomUUID } from 'crypto';
import {
  assertMlDsa65PublicKeyB64,
  deriveCanonicalPnIdentifier
} from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { canonicalPersonalFeedBytes, parsePersonalFeedStatement } from '@par-noir/standard-data-points';
import { getDatabasePool } from '../utils/database';
import { cacheActorId } from '../utils/cacheActor';
import { DriveIndexError } from './pnDriveIndex';
import { verifyRootSignedStatement } from './ownedAssetService';

function normalizePn(pn: string): string {
  const t = String(pn || '').trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

function invalidInput(message: string): Error {
  return Object.assign(new Error(message), { code: 'INVALID_INPUT' });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
  creatorTier: FeedTier;
  /** Feed sub-pN subject; personal feeds derive it from the root key. */
  subPnIdentifier?: string;
  /** Legal name shown on the feed after identity verification (owner opt-in). */
  verifiedDisplayName?: string;
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
}

export type FeedTier = 'personal' | 'feed' | 'self-hosted';

export interface PersonalFeedRegistration {
  feed: Feed;
  assetId: string;
  subPnIdentifier: string;
  created: boolean;
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
  sub_pn_identifier?: string | null;
  owner_pn_identifier?: string | null;
  status?: string | null;
  verified_display_name?: string | null;
  last_activity_at?: string | null;
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
        rating_range, branding, is_paid, monthly_price, annual_price
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      data.annualPrice ?? null
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

  /** Public follower count only. The follower's device records the follow on its own cloud. */
  static async subscribeToFeed(feedId: string, _userPnIdentifier: string): Promise<boolean> {
    try {
      const feed = await this.getFeedById(feedId);
      if (!feed) {
        throw new Error('Feed not found');
      }
      await getDatabasePool().query(
        `UPDATE feeds SET subscriber_count = subscriber_count + 1 WHERE feed_id = $1`,
        [feedId]
      );
      return true;
    } catch (error) {
      console.error('Failed to subscribe to feed:', error);
      return false;
    }
  }

  static async unsubscribeFromFeed(feedId: string, _userPnIdentifier: string): Promise<boolean> {
    try {
      const feed = await this.getFeedById(feedId);
      if (!feed) {
        throw new Error('Feed not found');
      }
      await getDatabasePool().query(
        `UPDATE feeds SET subscriber_count = GREATEST(subscriber_count - 1, 0) WHERE feed_id = $1`,
        [feedId]
      );
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from feed:', error);
      return false;
    }
  }

  /**
   * Get creator's subscriber index (all users subscribed to creator's feeds)
   */
  static async getCreatorSubscriberIndex(_creatorDid: string): Promise<Array<{
    subscriberDid: string;
    feedId: string;
    subscribedAt: string;
    syncedToDrive: boolean;
  }>> {
    return [];
  }

  /**
   * Check if user is subscribed to feed
   */
  static async isSubscribed(_feedId: string, _userPnIdentifier: string): Promise<boolean> {
    return false;
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(_userPnIdentifier: string): Promise<Feed[]> {
    return [];
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

      // Update post count; activity keeps an unverified owner's handle from expiring
      await db.query(`
        UPDATE feeds 
        SET post_count = (
          SELECT COUNT(*) FROM feed_posts WHERE feed_id = $1
        ),
        last_activity_at = NOW()
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
    `, [cacheActorId(filters.userPnIdentifier)]);

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
    const params: any[] = [cacheActorId(filters.userPnIdentifier)];
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
   * Creates the sub-pN identifier and owned-asset authz row and activates the feed. The device
   * creates the feed folder on Google Drive and submits its id; other clouds use a path.
   */
  static async activateFeedAfterVerification(
    feedId: string,
    creatorDid: string,
    verificationData: {
      verificationId: string;
      verifiedZKPs: any;
    },
    opts?: { deviceFolderId?: string }
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
      const deviceFolderId = opts?.deviceFolderId?.trim();

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
          }
        );
      };

      let activatedSubPn: string | null = null;

      try {
        const feedKey1 = `feed_${feedId.substring(0, 8)}_${crypto.randomBytes(4).toString('hex')}`;
        const feedKey2 = crypto.randomBytes(16).toString('hex');

        const { generateKeyPairSync } = crypto;
        const { publicKey } = generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        const { encryptFeedTokenField } = await import('./feedTokenCrypto');
        const encryptedKey1 = encryptFeedTokenField(feedKey1);
        const encryptedKey2 = encryptFeedTokenField(feedKey2);
        
        // Store feed tokens (owned by creator's pN)
        await db.query(`
          INSERT INTO feed_tokens (
            feed_id, owner_pn_identifier, encrypted_key1, encrypted_key2, public_key
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (feed_id) DO UPDATE SET
            encrypted_key1 = $3,
            encrypted_key2 = $4,
            public_key = $5,
            updated_at = NOW()
        `, [feedId, ownerPnIdentifier, encryptedKey1, encryptedKey2, publicKey]);
        
        // Generate sub-pN identifier from feed tokens
        // Formula: SHA256(key1:key2:publicKey) → first 12 hex chars → feed-{hash}
        const publicKeyHash = crypto.createHash('sha256').update(publicKey, 'utf8').digest('hex').substring(0, 12);
        const combined = `${feedKey1}:${feedKey2}:${publicKeyHash}`;
        const hash = crypto.createHash('sha256').update(combined, 'utf8').digest('hex');
        const subPnIdentifier = `feed-${hash.substring(0, 12)}`;

        const { isPortableSocialCloud } = await import('./storage/storageProviderUtils');
        const { metadataPath } = await import('@par-noir/user-owned-storage');

        let storageFolderRef: string | null = null;

        if (await isPortableSocialCloud(ownerPnIdentifier)) {
          storageFolderRef = metadataPath('feeds', feedId);
        } else {
          // Creating the feed folder writes to the creator's Drive, which needs
          // their device-held token. Without one, fail rather than leave the feed
          // marked active with no folder behind it.
          if (!deviceFolderId) {
            throw new DriveIndexError(
              'Create the feed folder on the device and submit deviceFolderId.',
              'CLOUD_TOKEN_REQUIRED'
            );
          }
          storageFolderRef = deviceFolderId;
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
   * One personal feed per pN. The browser derives the feed key from the root key and the
   * root signs a statement binding it; the device writes the Drive owned-asset row.
   * Idempotent: repeat calls return the same feed. A new feed key re-keys in place so the
   * feed id, posts and handles stay put.
   */
  static async registerPersonalFeed(params: {
    rootPn: string;
    statement: unknown;
    signature: string;
    label?: string;
    now?: number;
  }): Promise<PersonalFeedRegistration> {
    const root = normalizePn(params.rootPn);
    const raw = typeof params.statement === 'string' ? safeJson(params.statement) : params.statement;
    const statement = parsePersonalFeedStatement(raw);
    if (!statement) throw invalidInput('personal_feed_statement_required');
    verifyRootSignedStatement({
      prefix: 'personal_feed',
      root,
      rootPublicKey: statement.rootPublicKey,
      bytes: canonicalPersonalFeedBytes(statement),
      signature: params.signature,
      issuedAt: statement.issuedAt,
      now: params.now ?? Date.now(),
      beforeFreshness: () => {
        if (
          !assertMlDsa65PublicKeyB64(statement.feedPublicKey) ||
          deriveCanonicalPnIdentifier(statement.feedPublicKey) !== statement.feedPnIdentifier
        ) {
          throw invalidInput('personal_feed_key_mismatch');
        }
        if (statement.feedPnIdentifier === root) throw invalidInput('personal_feed_is_root');
      }
    });
    const subject = statement.feedPnIdentifier;
    const label = String(params.label || '').trim().slice(0, 64) || 'Personal feed';

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.upsertPersonalFeed({
          root,
          subject,
          publicKey: statement.feedPublicKey,
          label,
          statement,
          signature: params.signature
        });
      } catch (err: any) {
        if (err?.code === '23505' && attempt === 0) continue;
        throw err;
      }
    }
  }

  private static async upsertPersonalFeed(args: {
    root: string;
    subject: string;
    publicKey: string;
    label: string;
    statement: unknown;
    signature: string;
  }): Promise<PersonalFeedRegistration> {
    const db = getDatabasePool();
    const existing = await db.query<FeedRow>(
      `SELECT * FROM feeds WHERE owner_pn_identifier = $1 AND creator_tier = 'personal' LIMIT 1`,
      [args.root]
    );
    let row = existing.rows[0];
    const assets = await db.query(
      `SELECT id, root_pn_identifier, kind FROM pn_owned_assets
       WHERE (kind = 'feed' AND metadata->>'feedId' = $1) OR subject_pn_identifier = $2`,
      [row?.feed_id ?? '', args.subject]
    );
    for (const a of assets.rows as Record<string, unknown>[]) {
      if (String(a.root_pn_identifier) !== args.root || String(a.kind) !== 'feed') {
        throw Object.assign(new Error('personal_feed_conflict'), { code: 'FORBIDDEN' });
      }
    }
    let created = false;
    if (!row) {
      const inserted = await db.query<FeedRow>(
        `INSERT INTO feeds (
          feed_name, creator_did, creator_tier, status, sub_pn_identifier, owner_pn_identifier,
          rating_range, branding, is_paid
        ) VALUES ($1, $2, 'personal', 'active', $3, $2, '[]'::jsonb, '{}'::jsonb, false)
        RETURNING *`,
        [args.label, args.root, args.subject]
      );
      row = inserted.rows[0];
      created = true;
    } else if (row.sub_pn_identifier !== args.subject) {
      const rekeyed = await db.query<FeedRow>(
        `UPDATE feeds SET sub_pn_identifier = $2, updated_at = NOW() WHERE feed_id = $1 RETURNING *`,
        [row.feed_id, args.subject]
      );
      row = rekeyed.rows[0] ?? row;
    }

    const assetId = assets.rows.length > 0 ? String(assets.rows[0].id) : randomUUID();
    await db.query(
      `INSERT INTO pn_owned_assets (
        id, root_pn_identifier, subject_pn_identifier, kind, status, metadata, subject_public_key,
        delegation_statement, delegation_signature
      ) VALUES ($1, $2, $3, 'feed', 'active', $4::jsonb, $5, $6::jsonb, $7)
      ON CONFLICT (id) DO UPDATE SET
        status = 'active',
        subject_pn_identifier = EXCLUDED.subject_pn_identifier,
        metadata = EXCLUDED.metadata,
        subject_public_key = EXCLUDED.subject_public_key,
        delegation_statement = EXCLUDED.delegation_statement,
        delegation_signature = EXCLUDED.delegation_signature,
        updated_at = NOW(),
        revoked_at = NULL`,
      [
        assetId,
        args.root,
        args.subject,
        JSON.stringify({ feedId: row.feed_id, tier: 'personal', label: row.feed_name }),
        args.publicKey,
        JSON.stringify(args.statement),
        args.signature
      ]
    );
    return { feed: this.rowToFeed(row), assetId, subPnIdentifier: args.subject, created };
  }

  /**
   * Convert database row to Feed object
   */
  static rowToFeed(row: FeedRow): Feed {
    // Only return feeds for paid tiers (feed or self-hosted)
    // Free tier creators don't have feeds in the Feed interface
    const creatorTier: FeedTier =
      row.creator_tier === 'personal' || row.creator_tier === 'self-hosted' ? row.creator_tier : 'feed';

    return {
      feedId: row.feed_id,
      feedName: row.feed_name,
      feedCategory: (row.feed_category as FeedCategory) || 'lifestyle', // Default category
      feedDescription: row.feed_description || undefined,
      // feedRatingRange removed - feeds accept all content
      creatorId: row.creator_did,
      creatorTier: creatorTier,
      subPnIdentifier: row.sub_pn_identifier || undefined,
      verifiedDisplayName: row.verified_display_name || undefined,
      branding: row.branding || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      subscriberCount: row.subscriber_count,
      postCount: row.post_count,
      isPaid: row.is_paid || false,
      monthlyPrice: row.monthly_price ? parseFloat(row.monthly_price.toString()) : undefined,
      annualPrice: row.annual_price ? parseFloat(row.annual_price.toString()) : undefined
    };
  }
}

