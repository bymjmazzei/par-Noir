/**
 * Feed Routes
 * Handles feed CRUD, subscriptions, posts, and payment webhooks
 */

import { Request, Response } from 'express';
import { FeedService, Feed, FeedRow } from './feedService';
import { getDatabasePool } from '../utils/database';

export interface FeedPost {
  id: string;
  feedId: string;
  content: string;
  media?: Array<{
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
  }>;
  buttons?: Array<{
    label: string;
    url: string;
    style?: 'primary' | 'secondary' | 'link';
  }>;
  polls?: Array<{
    question: string;
    options: string[];
    votes?: Record<string, number>;
  }>;
  forms?: Array<{
    title: string;
    fields: Array<{
      name: string;
      type: 'text' | 'email' | 'textarea' | 'select';
      required?: boolean;
      options?: string[];
    }>;
  }>;
  isTopPost: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Setup feed routes
 */
export function setupFeedRoutes(app: any) {
  const db = getDatabasePool();

  /**
   * POST /api/feeds/:feedId/posts
   * Create a feed post
   */
  app.post('/api/feeds/:feedId/posts', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const { content, media, buttons, polls, forms, isTopPost } = req.body;

      // Get authenticated user from token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Create post
      const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await db.query(`
        INSERT INTO feed_posts (
          post_id, feed_id, content, media, buttons, polls, forms, is_top_post, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        postId,
        feedId,
        content || '',
        JSON.stringify(media || []),
        JSON.stringify(buttons || []),
        JSON.stringify(polls || []),
        JSON.stringify(forms || []),
        isTopPost || false,
        now,
        now
      ]);

      // Update feed post count
      await db.query(`
        UPDATE feeds 
        SET post_count = (
          SELECT COUNT(*) FROM feed_posts WHERE feed_id = $1
        )
        WHERE feed_id = $1
      `, [feedId]);

      const post: FeedPost = {
        id: postId,
        feedId,
        content: content || '',
        media: media || [],
        buttons: buttons || [],
        polls: polls || [],
        forms: forms || [],
        isTopPost: isTopPost || false,
        createdAt: now,
        updatedAt: now
      };

      return res.json(post);
    } catch (error) {
      console.error('Create post error:', error);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  });

  /**
   * GET /api/feeds/:feedId/posts
   * Get feed posts
   */
  app.get('/api/feeds/:feedId/posts', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await db.query(`
        SELECT * FROM feed_posts 
        WHERE feed_id = $1 
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `, [feedId, limit, offset]);

      const posts: FeedPost[] = result.rows.map(row => ({
        id: row.post_id,
        feedId: row.feed_id,
        content: row.content,
        media: row.media ? JSON.parse(row.media) : [],
        buttons: row.buttons ? JSON.parse(row.buttons) : [],
        polls: row.polls ? JSON.parse(row.polls) : [],
        forms: row.forms ? JSON.parse(row.forms) : [],
        isTopPost: row.is_top_post,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      return res.json({ posts });
    } catch (error) {
      console.error('Get posts error:', error);
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });

  /**
   * PUT /api/feeds/:feedId/top-post
   * Update top post (enhanced profile)
   */
  app.put('/api/feeds/:feedId/top-post', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const { content, media, buttons, polls, forms } = req.body;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Check if top post exists
      const existingResult = await db.query(`
        SELECT post_id FROM feed_posts 
        WHERE feed_id = $1 AND is_top_post = true
        LIMIT 1
      `, [feedId]);

      const now = new Date().toISOString();

      if (existingResult.rows.length > 0) {
        // Update existing top post
        const postId = existingResult.rows[0].post_id;
        await db.query(`
          UPDATE feed_posts 
          SET content = $1, media = $2, buttons = $3, polls = $4, forms = $5, updated_at = $6
          WHERE post_id = $7
        `, [
          content || '',
          JSON.stringify(media || []),
          JSON.stringify(buttons || []),
          JSON.stringify(polls || []),
          JSON.stringify(forms || []),
          now,
          postId
        ]);

        const post: FeedPost = {
          id: postId,
          feedId,
          content: content || '',
          media: media || [],
          buttons: buttons || [],
          polls: polls || [],
          forms: forms || [],
          isTopPost: true,
          createdAt: existingResult.rows[0].created_at,
          updatedAt: now
        };

        return res.json(post);
      } else {
        // Create new top post
        const postId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.query(`
          INSERT INTO feed_posts (
            post_id, feed_id, content, media, buttons, polls, forms, is_top_post, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          postId,
          feedId,
          content || '',
          JSON.stringify(media || []),
          JSON.stringify(buttons || []),
          JSON.stringify(polls || []),
          JSON.stringify(forms || []),
          true,
          now,
          now
        ]);

        const post: FeedPost = {
          id: postId,
          feedId,
          content: content || '',
          media: media || [],
          buttons: buttons || [],
          polls: polls || [],
          forms: forms || [],
          isTopPost: true,
          createdAt: now,
          updatedAt: now
        };

        return res.json(post);
      }
    } catch (error) {
      console.error('Update top post error:', error);
      return res.status(500).json({ error: 'Failed to update top post' });
    }
  });

  /**
   * POST /api/feeds/:feedId/subscriptions
   * Subscribe to a feed
   */
  app.post('/api/feeds/:feedId/subscriptions', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const { billingCycle, checkoutId, checkoutUrl } = req.body;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify feed exists
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      if (!feed.isPaid) {
        return res.status(400).json({ error: 'Feed is not a paid feed' });
      }

      // Create pending subscription
      const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await db.query(`
        INSERT INTO feed_subscriptions (
          subscription_id, feed_id, user_did, billing_cycle, status, checkout_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        subscriptionId,
        feedId,
        tokenPayload.did,
        billingCycle || 'monthly',
        'pending',
        checkoutId,
        now
      ]);

      return res.json({
        subscriptionId,
        checkoutUrl,
        status: 'pending'
      });
    } catch (error) {
      console.error('Create subscription error:', error);
      return res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  /**
   * DELETE /api/feeds/:feedId/subscriptions
   * Cancel subscription
   */
  app.delete('/api/feeds/:feedId/subscriptions', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Cancel subscription
      await db.query(`
        UPDATE feed_subscriptions 
        SET status = 'cancelled', cancelled_at = NOW()
        WHERE feed_id = $1 AND user_did = $2 AND status = 'active'
      `, [feedId, tokenPayload.did]);

      return res.json({ success: true });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  /**
   * GET /api/subscriptions
   * Get user's subscriptions
   */
  app.get('/api/subscriptions', async (req: Request, res: Response) => {
    try {
      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const result = await db.query(`
        SELECT * FROM feed_subscriptions 
        WHERE user_did = $1
        ORDER BY created_at DESC
      `, [tokenPayload.did]);

      const subscriptions = result.rows.map(row => ({
        id: row.subscription_id,
        feedId: row.feed_id,
        subscriberId: row.user_did,
        billingCycle: row.billing_cycle,
        status: row.status,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        nextBillingDate: row.next_billing_date,
        paymentId: row.payment_id
      }));

      return res.json({ subscriptions });
    } catch (error) {
      console.error('Get subscriptions error:', error);
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
  });

  /**
   * POST /api/subscriptions/confirm
   * Confirm subscription after payment
   */
  app.post('/api/subscriptions/confirm', async (req: Request, res: Response) => {
    try {
      const { checkoutId } = req.body;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Find subscription by checkout ID
      const result = await db.query(`
        SELECT * FROM feed_subscriptions 
        WHERE checkout_id = $1 AND user_did = $2
        LIMIT 1
      `, [checkoutId, tokenPayload.did]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      const subscription = result.rows[0];
      const billingCycle = subscription.billing_cycle;
      const now = new Date();
      const expiresAt = new Date(now);
      
      if (billingCycle === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      // Activate subscription
      await db.query(`
        UPDATE feed_subscriptions 
        SET status = 'active', expires_at = $1, next_billing_date = $2, activated_at = NOW()
        WHERE subscription_id = $3
      `, [expiresAt.toISOString(), expiresAt.toISOString(), subscription.subscription_id]);

      // Subscribe to feed
      await FeedService.subscribeToFeed(subscription.feed_id, tokenPayload.did);

      return res.json({
        id: subscription.subscription_id,
        feedId: subscription.feed_id,
        subscriberId: subscription.user_did,
        billingCycle: subscription.billing_cycle,
        status: 'active',
        createdAt: subscription.created_at,
        expiresAt: expiresAt.toISOString(),
        nextBillingDate: expiresAt.toISOString()
      });
    } catch (error) {
      console.error('Confirm subscription error:', error);
      return res.status(500).json({ error: 'Failed to confirm subscription' });
    }
  });

  /**
   * GET /api/feeds/payment-status/:checkoutId
   * Check payment status for feed creation
   */
  app.get('/api/feeds/payment-status/:checkoutId', async (req: Request, res: Response) => {
    try {
      const { checkoutId } = req.params;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Check feed_payments table
      const paymentResult = await db.query(`
        SELECT fp.*, f.feed_id, f.feed_name, f.creator_did
        FROM feed_payments fp
        LEFT JOIN feeds f ON f.feed_id = fp.feed_id
        WHERE fp.checkout_id = $1
        LIMIT 1
      `, [checkoutId]);

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      const payment = paymentResult.rows[0];

      // Verify user owns this payment
      if (payment.creator_did !== tokenPayload.did) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      return res.json({
        status: payment.status, // 'pending_verification', 'verified', 'active', 'failed'
        checkoutId: payment.checkout_id,
        paymentId: payment.payment_id,
        feedId: payment.feed_id,
        feedName: payment.feed_name
      });
    } catch (error) {
      console.error('Get payment status error:', error);
      return res.status(500).json({ error: 'Failed to get payment status' });
    }
  });

  /**
   * POST /api/feeds/:feedId/delegates
   * Delegate feed access to another pN
   */
  app.post('/api/feeds/:feedId/delegates', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const { delegateDid, permissions } = req.body;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (!delegateDid) {
        return res.status(400).json({ error: 'delegateDid is required' });
      }

      const validPermissions = ['read', 'write', 'manage'];
      const requestedPermissions = Array.isArray(permissions) 
        ? permissions.filter((p: string) => validPermissions.includes(p))
        : ['read'];

      // Ensure 'read' is always included
      if (!requestedPermissions.includes('read')) {
        requestedPermissions.push('read');
      }

      // Create delegation
      const delegationId = `delegation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();

      await db.query(`
        INSERT INTO feed_delegations (
          delegation_id, feed_id, owner_did, delegate_did, permissions, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (feed_id, delegate_did) DO UPDATE SET
          permissions = $5,
          updated_at = $7
      `, [
        delegationId,
        feedId,
        tokenPayload.did,
        delegateDid,
        JSON.stringify(requestedPermissions),
        now,
        now
      ]);

      return res.json({
        delegationId,
        feedId,
        delegateDid,
        permissions: requestedPermissions,
        createdAt: now
      });
    } catch (error) {
      console.error('Delegate feed error:', error);
      return res.status(500).json({ error: 'Failed to delegate feed access' });
    }
  });

  /**
   * GET /api/feeds/:feedId/delegates
   * Get list of delegates for a feed
   */
  app.get('/api/feeds/:feedId/delegates', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const result = await db.query(`
        SELECT * FROM feed_delegations 
        WHERE feed_id = $1
        ORDER BY created_at DESC
      `, [feedId]);

      const delegates = result.rows.map(row => ({
        delegationId: row.delegation_id,
        delegateDid: row.delegate_did,
        permissions: JSON.parse(row.permissions || '["read"]'),
        createdAt: row.created_at
      }));

      return res.json({ delegates });
    } catch (error) {
      console.error('Get delegates error:', error);
      return res.status(500).json({ error: 'Failed to get delegates' });
    }
  });

  /**
   * DELETE /api/feeds/:feedId/delegates/:delegationId
   * Remove a delegate from a feed
   */
  app.delete('/api/feeds/:feedId/delegates/:delegationId', async (req: Request, res: Response) => {
    try {
      const { feedId, delegationId } = req.params;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      await db.query(`
        DELETE FROM feed_delegations 
        WHERE delegation_id = $1 AND feed_id = $2
      `, [delegationId, feedId]);

      return res.json({ success: true });
    } catch (error) {
      console.error('Remove delegate error:', error);
      return res.status(500).json({ error: 'Failed to remove delegate' });
    }
  });

  /**
   * GET /api/users/:userDid/delegated-feeds
   * Get feeds where user is a delegate
   */
  app.get('/api/users/:userDid/delegated-feeds', async (req: Request, res: Response) => {
    try {
      const { userDid } = req.params;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user is requesting their own delegated feeds
      if (tokenPayload.did !== userDid) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const result = await db.query(`
        SELECT f.*, fd.permissions, fd.delegation_id
        FROM feeds f
        INNER JOIN feed_delegations fd ON f.feed_id = fd.feed_id
        WHERE fd.delegate_did = $1
        ORDER BY fd.created_at DESC
      `, [userDid]);

      const feeds = result.rows.map(row => {
        // Convert database row to FeedRow format
        const feedRow: FeedRow = {
          feed_id: row.feed_id,
          feed_name: row.feed_name,
          feed_category: row.feed_category,
          feed_description: row.feed_description,
          creator_did: row.creator_did,
          creator_tier: row.creator_tier,
          rating_range: [],
          branding: row.branding,
          subscriber_count: row.subscriber_count || 0,
          post_count: row.post_count || 0,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_paid: row.is_paid,
          monthly_price: row.monthly_price,
          annual_price: row.annual_price,
          subdomain: row.subdomain
        };
        const feed = FeedService.rowToFeed(feedRow);
        return {
          ...feed,
          delegationId: row.delegation_id,
          delegatePermissions: JSON.parse(row.permissions || '["read"]')
        };
      });

      return res.json({ feeds });
    } catch (error) {
      console.error('Get delegated feeds error:', error);
      return res.status(500).json({ error: 'Failed to get delegated feeds' });
    }
  });

  /**
   * POST /api/feeds/activate-after-verification
   * Activate feed after verification: creates sub-pN, Google Drive folder, and activates feed
   */
  app.post('/api/feeds/activate-after-verification', async (req: Request, res: Response) => {
    try {
      const { checkoutId, verificationId, verifiedZKPs } = req.body;

      // Get authenticated user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const tokenPayload = PNOAuthService.validateAccessToken(token);

      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Find feed by checkoutId
      const paymentResult = await db.query(`
        SELECT feed_id, status
        FROM feed_payments
        WHERE checkout_id = $1
      `, [checkoutId]);

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      const feedId = paymentResult.rows[0].feed_id;
      const feed = await FeedService.getFeedById(feedId);

      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      // Verify user is the creator
      if (feed.creatorId !== tokenPayload.did) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Activate feed (creates sub-pN, Google Drive folder, updates status)
      const activatedFeed = await FeedService.activateFeedAfterVerification(
        feedId,
        feed.creatorId,
        {
          verificationId,
          verifiedZKPs
        }
      );

      return res.json(activatedFeed);
    } catch (error) {
      console.error('Activate feed error:', error);
      return res.status(500).json({ error: 'Failed to activate feed' });
    }
  });
}

