/**
 * Feed Routes
 * Handles feed CRUD, subscriptions, posts, and payment webhooks
 */

import { Request, Response } from 'express';
import { FeedService, Feed } from './feedService';
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

      // Verify user owns the feed
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      if (feed.creatorId !== tokenPayload.did) {
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

      // Verify user owns the feed
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      if (feed.creatorId !== tokenPayload.did) {
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
}

