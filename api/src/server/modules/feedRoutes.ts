/**
 * Feed Routes
 * Handles feed CRUD, subscriptions, posts, and payment webhooks
 */

import { Application, Request, Response } from 'express';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { FeedService, Feed, FeedRow } from './feedService';
import { getDatabasePool } from '../utils/database';
import { feedPlatformSubscriptionsDisabledPayload } from '../utils/feedSubscriptionPolicy';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

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
export function setupFeedRoutes(app: Application) {
  const db = getDatabasePool();

  /**
   * POST /api/feeds/:feedId/posts
   * Create a feed post OR add an existing file to a feed
   * If fileId is provided, adds existing file to feed
   * Otherwise, creates a new feed post with content/media/buttons
   */
  app.post('/api/feeds/:feedId/posts', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const { fileId, addedBy, content, media, buttons, polls, forms, isTopPost } = req.body;

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // If fileId is provided, add existing file to feed
      if (fileId) {
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const metadataService = AggregatorMetadataServiceDB.getInstance();
        const fileEntry = await metadataService.getFileMetadata(fileId);

        // Repeat infringer and DMCA gate
        if (fileEntry) {
          const ownerPn = fileEntry.pnIdentifier ?? '';
          const { isRepeatInfringer } = await import('./repeatInfringerService');
          if (await isRepeatInfringer(ownerPn)) {
            return res.status(403).json({
              error: 'Account restricted',
              message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
            });
          }
          const { isFileApprovedByPrism, addToPrismQueue } = await import('./prismQueueService');
          const alreadyApproved = await isFileApprovedByPrism(fileId);
          if (!alreadyApproved) {
            const { googleDriveProxyService } = await import('./googleDriveProxy');
            const { runDMCACheck } = await import('./dmcaGate');
            const driveFileId = String((fileEntry.metadata as any)?.backendFileId ?? fileId ?? '');
            const mimeType = String((fileEntry.metadata as any)?.mimeType ?? 'application/octet-stream');
            const dmcaResult = await runDMCACheck(googleDriveProxyService, ownerPn, driveFileId, mimeType);
            if (!dmcaResult.passed) {
              const queueItemId = await addToPrismQueue({
                fileId,
                ownerPnIdentifier: ownerPn,
                flagSource: 'bot',
                reporterPnIdentifier: null,
              });
              const { addContentNotice } = await import('./contentNoticesService');
              await addContentNotice({
                ownerPnIdentifier: ownerPn,
                fileId,
                type: 'pending_review',
                source: 'bot',
              });
              return res.status(202).json({
                status: 'pending_review',
                error: 'Content flagged for DMCA review',
                message: dmcaResult.reason || 'This content has been flagged for copyright review and is pending human review.',
                queueItemId: queueItemId || undefined,
              });
            }
          }
        }

        const success = await FeedService.addPostToFeed(feedId, fileId, addedBy || tokenPayload.did);
        if (!success) {
          return res.status(500).json({ error: 'Failed to add file to feed' });
        }

        // Update file metadata to include this feedId in feedIds array
        try {
          const currentEntry = await metadataService.getFileMetadata(fileId);
          if (currentEntry) {
            const currentFeedIds = (currentEntry.metadata as any).feedIds || [];
            if (!currentFeedIds.includes(feedId)) {
              // Update metadata to include this feedId
              // CRITICAL: Do NOT include isPublic - it will be preserved by submitMetadata
              const updatedMetadata = {
                ...currentEntry.metadata,
                feedIds: [...currentFeedIds, feedId]
              };
              // Explicitly remove isPublic to ensure it's not changed
              delete (updatedMetadata as any).isPublic;
              await metadataService.submitMetadata(updatedMetadata, currentEntry.pnIdentifier);
            }
          }
        } catch (metadataError) {
          console.warn('Failed to update file metadata with feedId:', metadataError);
          // Don't fail the operation if metadata update fails
        }

        return res.json({ success: true, feedId, fileId });
      }

      // Otherwise, create a new feed post with content
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
   * DELETE /api/feeds/:feedId/posts/:fileId
   * Remove a file from a feed
   */
  app.delete('/api/feeds/:feedId/posts/:fileId', async (req: Request, res: Response) => {
    try {
      const { feedId, fileId } = req.params;
      const { creatorDid } = req.body;

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;

      // Verify user has write access to the feed (owner or delegate with write permission)
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      const hasAccess = await FeedService.hasFeedAccess(feedId, tokenPayload.did, 'write');
      if (!hasAccess) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      // Remove file from feed
      const success = await FeedService.removePostFromFeed(feedId, fileId);
      if (!success) {
        return res.status(500).json({ error: 'Failed to remove file from feed' });
      }

      // Update file metadata to remove this feedId from feedIds array
      try {
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const metadataService = AggregatorMetadataServiceDB.getInstance();
        
        // Get current metadata
        const currentEntry = await metadataService.getFileMetadata(fileId);
        if (currentEntry) {
          const currentFeedIds = (currentEntry.metadata as any).feedIds || [];
          const updatedFeedIds = currentFeedIds.filter((id: string) => id !== feedId);
          
          // Update metadata to remove this feedId
          // CRITICAL: Do NOT include isPublic - it will be preserved by submitMetadata
          const updatedMetadata = {
            ...currentEntry.metadata,
            feedIds: updatedFeedIds
          };
          // Explicitly remove isPublic to ensure it's not changed
          delete (updatedMetadata as any).isPublic;
          await metadataService.submitMetadata(updatedMetadata, currentEntry.pnIdentifier);
        }
      } catch (metadataError) {
        console.warn('Failed to update file metadata to remove feedId:', metadataError);
        // Don't fail the operation if metadata update fails
      }

      return res.json({ success: true, feedId, fileId });
    } catch (error) {
      console.error('Remove post from feed error:', error);
      return res.status(500).json({ error: 'Failed to remove post from feed' });
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
   * GET /api/feeds/:feedId/top-post
   * Get pinned top post for branded feed page
   */
  app.get('/api/feeds/:feedId/top-post', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const result = await db.query(
        `SELECT * FROM feed_posts WHERE feed_id = $1 AND is_top_post = true LIMIT 1`,
        [feedId]
      );
      if (result.rows.length === 0) {
        return res.json({ topPost: null });
      }
      const row = result.rows[0];
      const topPost: FeedPost = {
        id: row.post_id,
        feedId: row.feed_id,
        content: row.content,
        media: row.media ? JSON.parse(row.media) : [],
        buttons: row.buttons ? JSON.parse(row.buttons) : [],
        polls: row.polls ? JSON.parse(row.polls) : [],
        forms: row.forms ? JSON.parse(row.forms) : [],
        isTopPost: true,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      return res.json({ topPost });
    } catch (error) {
      console.error('Get top post error:', error);
      return res.status(500).json({ error: 'Failed to fetch top post' });
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

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;

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
   * (Deprecated) Platform-hosted paid feed subscriptions are not offered.
   */
  app.post('/api/feeds/:feedId/subscriptions', async (_req: Request, res: Response) => {
    return res.status(410).json(feedPlatformSubscriptionsDisabledPayload());
  });

  /**
   * DELETE /api/feeds/:feedId/subscriptions
   * (Deprecated) No-op success — platform does not host paid feed subscriptions.
   */
  app.delete('/api/feeds/:feedId/subscriptions', async (_req: Request, res: Response) => {
    return res.json({ success: true });
  });

  /**
   * GET /api/subscriptions
   * Platform-hosted paid feed subscriptions are not offered; list is always empty.
   */
  app.get('/api/subscriptions', async (req: Request, res: Response) => {
    const tokenPayload = getBearerTokenPayload(req);
    if (!tokenPayload) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.json({ subscriptions: [] });
  });

  /**
   * POST /api/subscriptions/confirm
   * (Deprecated) Platform-hosted paid feed subscriptions are not offered.
   */
  app.post('/api/subscriptions/confirm', async (_req: Request, res: Response) => {
    return res.status(410).json(feedPlatformSubscriptionsDisabledPayload());
  });

  /**
   * GET /api/feeds/payment-status/:checkoutId
   * Check payment status for feed creation
   */
  app.get('/api/feeds/payment-status/:checkoutId', async (req: Request, res: Response) => {
    try {
      const { checkoutId } = req.params;

      const tokenPayload = getBearerTokenPayload(req);
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

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;

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

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;

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

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;

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
   * GET /api/users/:userPnIdentifier/delegated-feeds
   * Get feeds where user is a delegate (feed_delegations + owned-asset feed scopes)
   */
  app.get('/api/users/:userPnIdentifier/delegated-feeds', async (req: Request, res: Response) => {
    try {
      const { userPnIdentifier } = req.params;

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Verify user is requesting their own delegated feeds
      // Check both DID and pnIdentifier since userPnIdentifier param could be either format
      const isAuthorized = tokenPayload.did === userPnIdentifier || 
                          tokenPayload.pnIdentifier === userPnIdentifier ||
                          (userPnIdentifier.startsWith('pn-') && tokenPayload.pnIdentifier === userPnIdentifier) ||
                          (!userPnIdentifier.startsWith('pn-') && tokenPayload.did === userPnIdentifier);
      
      if (!isAuthorized) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const normPn = userPnIdentifier.startsWith('pn-')
        ? userPnIdentifier
        : `pn-${userPnIdentifier}`;

      const result = await db.query(`
        SELECT f.*, fd.permissions, fd.delegation_id
        FROM feeds f
        INNER JOIN feed_delegations fd ON f.feed_id = fd.feed_id
        WHERE fd.delegate_did = $1 OR fd.delegate_did = $2
        ORDER BY fd.created_at DESC
      `, [userPnIdentifier, normPn]);

      const byFeedId = new Map<string, ReturnType<typeof FeedService.rowToFeed> & {
        delegationId?: string;
        delegatePermissions?: string[];
      }>();

      for (const row of result.rows) {
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
        byFeedId.set(feed.feedId, {
          ...feed,
          delegationId: row.delegation_id,
          delegatePermissions: JSON.parse(row.permissions || '["read"]')
        });
      }

      const { OwnedAssetService } = await import('./ownedAssetService');
      const assetDels = await OwnedAssetService.listDelegatedFeedIdsFromCache(normPn);
      for (const d of assetDels) {
        if (byFeedId.has(d.feedId)) continue;
        const feed = await FeedService.getFeedById(d.feedId);
        if (!feed) continue;
        const perms =
          d.scope === '*' || d.scope === 'manage'
            ? ['read', 'write', 'manage']
            : d.scope === 'write'
              ? ['read', 'write']
              : ['read'];
        byFeedId.set(d.feedId, {
          ...feed,
          delegationId: d.assetId,
          delegatePermissions: perms
        });
      }

      return res.json({ feeds: Array.from(byFeedId.values()) });
    } catch (error) {
      console.error('Get delegated feeds error:', error);
      return res.status(500).json({ error: 'Failed to get delegated feeds' });
    }
  });

  /**
   * GET /api/users/:userPnIdentifier/controlled-feeds
   * Owned feed contexts from Sub-pN registry (+ creator fallback) and delegated feeds.
   */
  app.get('/api/users/:userPnIdentifier/controlled-feeds', async (req: Request, res: Response) => {
    try {
      const { userPnIdentifier } = req.params;
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const isAuthorized =
        tokenPayload.did === userPnIdentifier ||
        tokenPayload.pnIdentifier === userPnIdentifier ||
        (userPnIdentifier.startsWith('pn-') && tokenPayload.pnIdentifier === userPnIdentifier) ||
        (!userPnIdentifier.startsWith('pn-') && tokenPayload.did === userPnIdentifier);

      if (!isAuthorized) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const normPn = userPnIdentifier.startsWith('pn-')
        ? userPnIdentifier
        : `pn-${userPnIdentifier}`;

      const { OwnedAssetService } = await import('./ownedAssetService');
      const feedAssets = await OwnedAssetService.listFeedAssetsFromCache(normPn);
      const ownedById = new Map<string, Feed>();

      for (const asset of feedAssets) {
        const feedId = asset.metadata?.feedId;
        if (typeof feedId !== 'string' || !feedId.trim()) continue;
        const feed = await FeedService.getFeedById(feedId.trim());
        if (feed) ownedById.set(feed.feedId, feed);
      }

      // Fallback: active feeds still owned by creator before asset backfill
      const creatorFeeds = await db.query(
        `SELECT feed_id FROM feeds
         WHERE (creator_did = $1 OR creator_did = $2 OR owner_pn_identifier = $1 OR owner_pn_identifier = $2)
           AND (status IS NULL OR status = 'active')`,
        [userPnIdentifier, normPn]
      );
      for (const row of creatorFeeds.rows as { feed_id: string }[]) {
        if (ownedById.has(row.feed_id)) continue;
        const feed = await FeedService.getFeedById(row.feed_id);
        if (feed) ownedById.set(feed.feedId, feed);
      }

      const delegatedRes = await db.query(
        `SELECT DISTINCT f.feed_id
         FROM feeds f
         INNER JOIN feed_delegations fd ON f.feed_id = fd.feed_id
         WHERE fd.delegate_did = $1 OR fd.delegate_did = $2`,
        [userPnIdentifier, normPn]
      );
      const delegatedById = new Map<string, Feed & { delegatePermissions?: string[] }>();
      for (const row of delegatedRes.rows as { feed_id: string }[]) {
        const feed = await FeedService.getFeedById(row.feed_id);
        if (feed && !ownedById.has(feed.feedId)) {
          delegatedById.set(feed.feedId, feed);
        }
      }
      const assetDels = await OwnedAssetService.listDelegatedFeedIdsFromCache(normPn);
      for (const d of assetDels) {
        if (ownedById.has(d.feedId) || delegatedById.has(d.feedId)) continue;
        const feed = await FeedService.getFeedById(d.feedId);
        if (!feed) continue;
        const perms =
          d.scope === '*' || d.scope === 'manage'
            ? ['read', 'write', 'manage']
            : d.scope === 'write'
              ? ['read', 'write']
              : ['read'];
        delegatedById.set(d.feedId, { ...feed, delegatePermissions: perms });
      }

      return res.json({
        owned: Array.from(ownedById.values()),
        delegated: Array.from(delegatedById.values())
      });
    } catch (error) {
      console.error('Get controlled feeds error:', error);
      return res.status(500).json({ error: 'Failed to get controlled feeds' });
    }
  });

  /**
   * GET /api/feeds/tokens
   * Get feed tokens for authenticated user's pN
   * Returns decrypted tokens for feeds owned by the user
   */
  app.get('/api/feeds/tokens', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      // Get pN identifier from token
      const pnIdentifier = tokenPayload.pnIdentifier;
      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pN identifier not found in token' });
      }

      // Fetch feed tokens owned by this pN (safe metadata only; never return pn name or passcode)
      const result = await db.query(`
        SELECT 
          ft.feed_id,
          ft.public_key,
          f.feed_name,
          f.sub_pn_identifier
        FROM feed_tokens ft
        JOIN feeds f ON ft.feed_id = f.feed_id
        WHERE ft.owner_pn_identifier = $1
        AND f.status = 'active'
      `, [pnIdentifier]);

      const feedTokens = result.rows.map(row => ({
        feedId: row.feed_id,
        feedName: row.feed_name,
        subPnIdentifier: row.sub_pn_identifier,
        publicKey: row.public_key
      }));

      return res.json({ feedTokens });
    } catch (error) {
      console.error('Get feed tokens error:', error);
      return res.status(500).json({ error: 'Failed to get feed tokens' });
    }
  });

  /**
   * POST /api/feeds/activate-after-verification
   * Activate feed after verification: creates sub-pN, Google Drive folder, owned-asset row, and activates feed
   */
  app.post('/api/feeds/activate-after-verification', async (req: Request, res: Response) => {
    try {
      const { checkoutId, verificationId, verifiedZKPs } = req.body;

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { extractCloudAccessToken } = await import('./cloudAccessToken');
      const cloudAccessToken = extractCloudAccessToken(req);
      if (!cloudAccessToken) {
        return res.status(409).json({
          error: 'cloud_token_required',
          error_description: 'Reconnect storage on this device to register the feed sub-pN'
        });
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

      const { EngagementService } = await import('./engagementService');
      const identityCandidates = [
        tokenPayload.pnIdentifier,
        tokenPayload.did,
        feed.creatorId
      ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      let identityVerified = false;
      for (const id of identityCandidates) {
        if (await EngagementService.isIdentityVerifiedForMonetization(id)) {
          identityVerified = true;
          break;
        }
      }
      if (!identityVerified) {
        return res.status(403).json({
          error: 'identity_not_verified',
          error_description: 'Verify your identity before activating a feed sub-pN'
        });
      }

      // Activate feed (creates sub-pN, Google Drive folder, owned asset, updates status)
      const activatedFeed = await FeedService.activateFeedAfterVerification(
        feedId,
        feed.creatorId,
        {
          verificationId: verificationId || 'already-verified',
          verifiedZKPs: verifiedZKPs || {}
        },
        { cloudAccessToken }
      );

      return res.json(activatedFeed);
    } catch (error) {
      console.error('Activate feed error:', error);
      if ((error as { code?: string }).code === 'CLOUD_TOKEN_REQUIRED') {
        return res.status(409).json({
          error: 'cloud_token_required',
          error_description: 'Reconnect storage on this device to register the feed sub-pN'
        });
      }
      return res.status(500).json({ error: 'Failed to activate feed' });
    }
  });

    // ============================================================================
    // Feed Management APIs
    // ============================================================================

    // POST /api/feeds - Create a new feed
    app.post('/api/feeds', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (tokenPayload?.pnIdentifier) {
          if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;
        }

        const { FeedService } = await import('./feedService');
        const {
          feedName,
          feedCategory,
          feedDescription,
          creatorDid,
          creatorTier,
          branding,
          isPaid,
          monthlyPrice,
          annualPrice,
          subdomain,
        } = req.body;

        if (!feedName || !creatorDid) {
          return res.status(400).json({ error: 'feedName and creatorDid are required' });
        }

        // Only paid tiers can create feeds
        if (creatorTier === 'free') {
          return res.status(403).json({ error: 'Free tier cannot create feeds. Upgrade to feed or self-hosted tier.' });
        }

        const { isDidRevokedForNetwork } = await import('./identitySuccessionService');
        if (isDidRevokedForNetwork(creatorDid)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description: 'This creator DID is retired on the par Noir network. Create feeds with your successor identity.'
          });
        }

        const feed = await FeedService.createFeed({
          feedName,
          feedCategory,
          feedDescription,
          creatorDid,
          creatorTier: creatorTier || 'feed',
          // feedRatingRange removed - feeds accept all content
          branding
        });

        // Optional feed plan metadata (owner paid tier / list pricing). Platform does not
        // process viewer subscriptions to feeds; see feedSubscriptionPolicy.
        if (isPaid !== undefined || monthlyPrice !== undefined || annualPrice !== undefined || subdomain) {
          const db = (await import('../utils/database')).getDatabasePool();
          const updates: string[] = [];
          const params: any[] = [];
          let paramCount = 0;

          if (isPaid !== undefined) {
            paramCount++;
            updates.push(`is_paid = $${paramCount}`);
            params.push(isPaid);
          }
          if (monthlyPrice !== undefined) {
            paramCount++;
            updates.push(`monthly_price = $${paramCount}`);
            params.push(monthlyPrice);
          }
          if (annualPrice !== undefined) {
            paramCount++;
            updates.push(`annual_price = $${paramCount}`);
            params.push(annualPrice);
          }
          if (subdomain !== undefined) {
            paramCount++;
            updates.push(`subdomain = $${paramCount}`);
            params.push(subdomain || null);
          }

          if (updates.length > 0) {
            paramCount++;
            updates.push(`updated_at = NOW()`);
            paramCount++;
            params.push(feed.feedId);

            await db.query(
              `UPDATE feeds SET ${updates.join(', ')} WHERE feed_id = $${paramCount}`,
              params
            );

            const updatedFeed = await FeedService.getFeedById(feed.feedId);
            if (updatedFeed) {
              return res.status(201).json({
                ...updatedFeed,
                isPaid: isPaid !== undefined ? isPaid : updatedFeed.isPaid,
                monthlyPrice: monthlyPrice !== undefined ? monthlyPrice : updatedFeed.monthlyPrice,
                annualPrice: annualPrice !== undefined ? annualPrice : updatedFeed.annualPrice,
                subdomain: subdomain !== undefined ? subdomain : updatedFeed.subdomain,
              });
            }
          }
        }

        return res.status(201).json(feed);
      } catch (error: any) {
        console.error('Error creating feed:', error);
        return res.status(500).json({ error: 'Failed to create feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // ============================================================================
    // Saved Feed APIs (Private curated feed for each user)
    // MUST come before /api/feeds/:feedId to avoid route conflict
    // ============================================================================

    // GET /api/feeds/saved?userPnIdentifier=... - Get user's saved posts (index query, not a feed)
    app.get('/api/feeds/saved', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        const db = (await import('../utils/database')).getDatabasePool();

        if (!userPnIdentifier || typeof userPnIdentifier !== 'string') {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // Saved posts use feed_id format: "saved-{userPnIdentifier}"
        const savedFeedId = `saved-${userPnIdentifier}`;

        // Query saved posts directly - no need to create a feed entry
        const postsResult = await db.query(`
          SELECT file_id, added_at
          FROM feed_posts
          WHERE feed_id = $1
          ORDER BY added_at DESC
        `, [savedFeedId]);

        const fileIds = postsResult.rows.map(row => row.file_id);
        const latestAddedAt = postsResult.rows.length > 0 ? postsResult.rows[0].added_at : null;

        return res.json({
          feed: {
            feedId: savedFeedId,
            feedName: 'Saved',
            fileIds,
            createdAt: latestAddedAt || new Date().toISOString(),
            updatedAt: latestAddedAt || new Date().toISOString()
          }
        });
      } catch (error: any) {
        console.error('Error getting saved feed:', error);
        return res.status(500).json({ error: 'Failed to get saved feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/feeds - List feeds with filters
    app.get('/api/feeds', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { category, creatorDid, creatorTier, search, limit, offset } = req.query;

        const result = await FeedService.listFeeds({
          category: category as any,
          creatorDid: creatorDid as string,
          creatorTier: creatorTier as any,
          search: search as string,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined
        });

        return res.json({
          feeds: result.feeds,
          total: result.total,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined
        });
      } catch (error: any) {
        console.error('Error listing feeds:', error);
        return res.status(500).json({ error: 'Failed to list feeds', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/feeds/:feedId - Get feed by ID
    app.get('/api/feeds/:feedId', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { feedId } = req.params;

        const feed = await FeedService.getFeedById(feedId);

        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        return res.json(feed);
      } catch (error: any) {
        console.error('Error getting feed:', error);
        return res.status(500).json({ error: 'Failed to get feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // PUT /api/feeds/:feedId - Update feed
    app.put('/api/feeds/:feedId', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (tokenPayload?.pnIdentifier) {
          if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;
        }

        const { FeedService } = await import('./feedService');
        const { feedId } = req.params;
        const { feedName, feedDescription, feedCategory, branding, creatorDid } = req.body;

        // Verify creator owns the feed
        const existingFeed = await FeedService.getFeedById(feedId);
        if (!existingFeed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        if (existingFeed.creatorId !== creatorDid) {
          return res.status(403).json({ error: 'Only feed creator can update feed' });
        }

        const feed = await FeedService.updateFeed(feedId, {
          feedName,
          feedDescription,
          feedCategory,
          branding
        });

        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        return res.json(feed);
      } catch (error: any) {
        console.error('Error updating feed:', error);
        return res.status(500).json({ error: 'Failed to update feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // DELETE /api/feeds/:feedId - Delete feed
    app.delete('/api/feeds/:feedId', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (tokenPayload?.pnIdentifier) {
          if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) return;
        }

        const { FeedService } = await import('./feedService');
        const { feedId } = req.params;
        const { creatorDid } = req.body;

        if (!creatorDid) {
          return res.status(400).json({ error: 'creatorDid is required' });
        }

        const deleted = await FeedService.deleteFeed(feedId, creatorDid);

        if (!deleted) {
          return res.status(404).json({ error: 'Feed not found or unauthorized' });
        }

        return res.json({ success: true, message: 'Feed deleted' });
      } catch (error: any) {
        console.error('Error deleting feed:', error);
        return res.status(500).json({ error: 'Failed to delete feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET/POST/DELETE /api/feeds/:feedId/posts are handled by feedRoutes (registered first)

    // ============================================================================
    // Feed Subscription APIs
    // ============================================================================

    // POST /api/feeds/:feedId/subscribe - Subscribe to feed
    // Creator stores subscriber info on their Google Drive
    // Subscriber stores local reference (handled by frontend)
    app.post('/api/feeds/:feedId/subscribe', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { feedId } = req.params;
        const { userPnIdentifier, creatorGoogleTokens } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // Note: creatorGoogleTokens is optional - if creator doesn't have Drive connected,
        // subscription is stored in database only and can sync to Drive later

        const success = await FeedService.subscribeToFeed(feedId, userPnIdentifier, creatorGoogleTokens);

        if (!success) {
          return res.status(500).json({ error: 'Failed to subscribe to feed' });
        }

        return res.json({ 
          success: true, 
          message: 'Subscribed to feed',
          note: 'Subscription stored in database and creator Google Drive (if connected)'
        });
      } catch (error: any) {
        console.error('Error subscribing to feed:', error);
        return res.status(500).json({ error: 'Failed to subscribe to feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // DELETE /api/feeds/:feedId/subscribe - Unsubscribe from feed
    app.delete('/api/feeds/:feedId/subscribe', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { feedId } = req.params;
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const success = await FeedService.unsubscribeFromFeed(feedId, userPnIdentifier);

        if (!success) {
          return res.status(500).json({ error: 'Failed to unsubscribe from feed' });
        }

        return res.json({ success: true, message: 'Unsubscribed from feed' });
      } catch (error: any) {
        console.error('Error unsubscribing from feed:', error);
        return res.status(500).json({ error: 'Failed to unsubscribe from feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });
    // GET /api/feeds/:feedId/subscribers - Get feed subscribers count
    app.get('/api/feeds/:feedId/subscribers', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { feedId } = req.params;

        const feed = await FeedService.getFeedById(feedId);

        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        return res.json({
          feedId,
          subscriberCount: feed.subscriberCount || 0
        });
      } catch (error: any) {
        console.error('Error getting feed subscribers:', error);
        return res.status(500).json({ error: 'Failed to get subscribers', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });
    // POST /api/feeds/saved - Add file to saved feed
    app.post('/api/feeds/saved', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        const db = (await import('../utils/database')).getDatabasePool();

        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        const savedFeedId = `saved-${userPnIdentifier}`;

        // Check if saved feed exists, create if not
        let feedResult = await db.query(`
          SELECT feed_id, feed_name, created_at, updated_at
          FROM feeds
          WHERE feed_id = $1
        `, [savedFeedId]);

        if (feedResult.rows.length === 0) {
          // Create saved feed - rating_range must be JSON string for PostgreSQL JSON column
          await db.query(`
            INSERT INTO feeds (feed_id, feed_name, creator_did, creator_tier, rating_range)
            VALUES ($1, $2, $3, $4, $5::jsonb)
          `, [savedFeedId, 'Saved', userPnIdentifier, 'free', JSON.stringify(['GA', 'FF', 'T13+', 'YA16+', 'M18+', 'NSFW', 'X18+'])]);

          feedResult = await db.query(`
            SELECT feed_id, feed_name, created_at, updated_at
            FROM feeds
            WHERE feed_id = $1
          `, [savedFeedId]);
        }

        // Check if file is already in saved feed
        const existingPost = await db.query(`
          SELECT file_id
          FROM feed_posts
          WHERE feed_id = $1 AND file_id = $2
        `, [savedFeedId, fileId]);

        if (existingPost.rows.length > 0) {
          // File already saved, return existing feed
          const postsResult = await db.query(`
            SELECT file_id
            FROM feed_posts
            WHERE feed_id = $1
            ORDER BY added_at DESC
          `, [savedFeedId]);

          const fileIds = postsResult.rows.map(row => row.file_id);

          return res.json({
            feed: {
              feedId: feedResult.rows[0].feed_id,
              feedName: feedResult.rows[0].feed_name,
              fileIds,
              createdAt: feedResult.rows[0].created_at,
              updatedAt: feedResult.rows[0].updated_at
            }
          });
        }

        // Add file to saved feed
        await db.query(`
          INSERT INTO feed_posts (feed_id, file_id, added_by)
          VALUES ($1, $2, $3)
        `, [savedFeedId, fileId, userPnIdentifier]);

        // Update feed updated_at
        await db.query(`
          UPDATE feeds
          SET updated_at = NOW()
          WHERE feed_id = $1
        `, [savedFeedId]);

        // Get all file IDs
        const postsResult = await db.query(`
          SELECT file_id
          FROM feed_posts
          WHERE feed_id = $1
          ORDER BY added_at DESC
        `, [savedFeedId]);

        const fileIds = postsResult.rows.map(row => row.file_id);

        return res.json({
          feed: {
            feedId: feedResult.rows[0].feed_id,
            feedName: feedResult.rows[0].feed_name,
            fileIds,
            createdAt: feedResult.rows[0].created_at,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error: any) {
        console.error('Error saving to feed:', error);
        return res.status(500).json({ error: 'Failed to save to feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // DELETE /api/feeds/saved - Remove file from saved feed
    app.delete('/api/feeds/saved', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        const db = (await import('../utils/database')).getDatabasePool();

        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        const savedFeedId = `saved-${userPnIdentifier}`;

        // Remove file from saved feed
        const result = await db.query(`
          DELETE FROM feed_posts
          WHERE feed_id = $1 AND file_id = $2
        `, [savedFeedId, fileId]);

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'File not found in saved feed' });
        }

        // Update feed updated_at
        await db.query(`
          UPDATE feeds
          SET updated_at = NOW()
          WHERE feed_id = $1
        `, [savedFeedId]);

        return res.json({ success: true, message: 'File removed from saved feed' });
      } catch (error: any) {
        console.error('Error removing from saved feed:', error);
        return res.status(500).json({ error: 'Failed to remove from saved feed', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // ============================================================================
    // Feed Discovery APIs (Catalogue/Store Interface)
    // ============================================================================

    // GET /api/feeds/discover - Discover feeds with filters (categories, trending, new)
    app.get('/api/feeds/discover', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { category, sort = 'new', limit = 20, offset = 0 } = req.query;

        const result = await FeedService.discoverFeeds({
          category: category as any,
          sort: sort as 'new' | 'trending' | 'popular',
          limit: limit ? parseInt(limit as string, 10) : 20,
          offset: offset ? parseInt(offset as string, 10) : 0
        });

        return res.json(result);
      } catch (error: any) {
        console.error('Error discovering feeds:', error);
        return res.status(500).json({ error: 'Failed to discover feeds', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/feeds/categories - List all feed categories with counts
    app.get('/api/feeds/categories', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const categories = await FeedService.getFeedCategories();

        return res.json({
          categories,
          total: categories.reduce((sum, cat) => sum + cat.count, 0)
        });
      } catch (error: any) {
        console.error('Error getting feed categories:', error);
        return res.status(500).json({ error: 'Failed to get categories', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/feeds/trending - Get trending feeds
    app.get('/api/feeds/trending', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { limit = 20, category } = req.query;

        const feeds = await FeedService.getTrendingFeeds({
          limit: limit ? parseInt(limit as string, 10) : 20,
          category: category as any
        });

        return res.json({
          feeds,
          count: feeds.length,
          period: '7d' // Last 7 days
        });
      } catch (error: any) {
        console.error('Error getting trending feeds:', error);
        return res.status(500).json({ error: 'Failed to get trending feeds', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/feeds/recommended - Get recommended feeds for user
    app.get('/api/feeds/recommended', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { userPnIdentifier, limit = 10 } = req.query;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const feeds = await FeedService.getRecommendedFeeds({
          userPnIdentifier: userPnIdentifier as string,
          limit: limit ? parseInt(limit as string, 10) : 10
        });

        return res.json({
          feeds,
          count: feeds.length,
          userPnIdentifier
        });
      } catch (error: any) {
        console.error('Error getting recommended feeds:', error);
        return res.status(500).json({ error: 'Failed to get recommended feeds', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });
}
