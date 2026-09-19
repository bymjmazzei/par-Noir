/**
 * Engagement Routes
 * Like, dislike, comment, share, save, and engagement stats endpoints
 */

import express, { Request, Response } from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface EngagementRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  driveNotInitialized: (res: express.Response) => express.Response;
}

/**
 * Setup engagement routes
 */
export function setupEngagementRoutes(app: any, deps: EngagementRouteDeps) {
  const { extractAccountId, getMetadataFolder, driveNotInitialized } = deps;

// Engagement APIs (Enhanced)
// ============================================================================

// POST /api/engagement/:fileId/like - Toggle like
app.post('/api/engagement/:fileId/like', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { EngagementDriveService } = await import('./engagementDriveService');
    const { PreferencesService } = await import('./preferencesService');
    const { extractTagsFromMetadata } = await import('../utils/tagExtractor');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
    const { googleDriveProxyService } = await import('./googleDriveProxy');
    const { storageCredentialsService } = await import('./storageCredentialsService');
    const { fileId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    // Use pn identifier directly (already normalized)
    const pnIdentifier = userPnIdentifier;

    const { isDeviceCloudCustodyEnabled } = await import(
      './socialMailboxService'
    );
    if (isDeviceCloudCustodyEnabled()) {
      // Public aggregator only — no mailbox jobs for likes.
      const aggregator = AggregatorMetadataServiceDB.getInstance();
      const fileMetadata = await aggregator.getFileMetadata(fileId);
      const fileOwnerDid = fileMetadata?.pnIdentifier;
      const currentlyLiked = await EngagementService.isLiked(fileId, pnIdentifier);
      const liked = !currentlyLiked;
      await EngagementService.toggleLikePublicCount(fileId, pnIdentifier, liked);
      if (liked && fileOwnerDid && fileOwnerDid !== pnIdentifier) {
        try {
          const { PushService } = await import('./pushService');
          PushService.send(fileOwnerDid, {
            title: 'New like',
            body: 'Someone liked your post',
            data: { file_id: fileId }
          }).catch(() => undefined);
        } catch {
          /* optional */
        }
      }
      const publicStats = await EngagementService.getEngagementStats(fileId);
      return res.json({ liked, count: publicStats.likes, delivery: 'public' });
    }

    return res.status(503).json({
      error: 'device_cloud_custody_required',
      message: 'Engagement requires device cloud custody. Set DEVICE_CLOUD_CUSTODY=1.'
    });


  } catch (error: any) {
    console.error('Error toggling like:', error);
    return res.status(500).json({ error: 'Failed to toggle like', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/:fileId/like - Check if liked
app.get('/api/engagement/:fileId/like', async (req: Request, res: Response) => {
  try {
    const { EngagementDriveService } = await import('./engagementDriveService');
    const { storageCredentialsService } = await import('./storageCredentialsService');
    const { fileId } = req.params;
    const userPnIdentifier = req.query.userPnIdentifier;

    if (!userPnIdentifier || typeof userPnIdentifier !== 'string') {
      return res.status(400).json({ error: 'userPnIdentifier query parameter is required' });
    }

    // Use pn identifier directly (already normalized)
    const pnIdentifier = userPnIdentifier;

    // Get user's credentials
    const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
    if (!userCredentials?.credentials) {
      return res.json({ liked: false });
    }

    const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
      (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
    
    if (googleDriveAccounts.length === 0) {
      return res.json({ liked: false });
    }

    const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
    const accountId = account ? extractAccountId(account) : undefined;

    const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
    let token;
    try {
      const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
      token = resolved.token;
    } catch (error) {
      if (respondDriveTokenError(res, error)) return;
      throw error;
    }
    const userAccessToken = token.access_token;

    let metadataFolderId = '';
    if (account) {
      const _g = await getMetadataFolder(token, pnIdentifier, accountId);
      if (!_g) return driveNotInitialized(res);
      metadataFolderId = _g.metadataFolderId;
    }

    // Read from user's Google Drive engagement.xlsx (Sheets)
    const liked = await EngagementDriveService.isLiked(fileId, userAccessToken, metadataFolderId, pnIdentifier, accountId);

    return res.json({ liked });
  } catch (error: any) {
    console.error('Error checking like:', error);
    return res.status(500).json({ error: 'Failed to check like', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// POST /api/engagement/:fileId/dislike - Toggle dislike
app.post('/api/engagement/:fileId/dislike', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { fileId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    const pnIdentifier = userPnIdentifier;

    const { isDeviceCloudCustodyEnabled } = await import('./socialMailboxService');
    if (isDeviceCloudCustodyEnabled()) {
      // Public aggregator only — align with like/comment under custody (no actor Drive write).
      const aggregator = AggregatorMetadataServiceDB.getInstance();
      const fileMetadata = await aggregator.getFileMetadata(fileId);
      const fileOwnerDid = fileMetadata?.pnIdentifier;
      const currentlyDisliked = await EngagementService.isDisliked(fileId, pnIdentifier);
      const disliked = !currentlyDisliked;
      await EngagementService.toggleDislikePublicCount(fileId, pnIdentifier, disliked);
      if (disliked && fileOwnerDid && fileOwnerDid !== pnIdentifier) {
        try {
          const { PushService } = await import('./pushService');
          PushService.send(fileOwnerDid, {
            title: 'Feedback on your post',
            body: 'Someone reacted to your post',
            data: { file_id: fileId }
          }).catch(() => undefined);
        } catch {
          /* optional */
        }
      }
      const publicStats = await EngagementService.getEngagementStats(fileId);
      return res.json({
        disliked,
        count: publicStats.likes,
        delivery: 'public'
      });
    }

    return res.status(503).json({
      error: 'device_cloud_custody_required',
      message: 'Engagement requires device cloud custody. Set DEVICE_CLOUD_CUSTODY=1.'
    });
  } catch (error: any) {
    console.error('Failed to toggle dislike:', error);
    return res.status(500).json({
      error: 'Failed to toggle dislike',
      message: safeClientErrorMessage(error, NODE_ENV === 'production')
    });
  }
});

// GET /api/engagement/:fileId/dislike - Check if disliked
app.get('/api/engagement/:fileId/dislike', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { fileId } = req.params;
    const { userPnIdentifier } = req.query;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier query parameter is required' });
    }

    const disliked = await EngagementService.isDisliked(fileId, userPnIdentifier as string);

    return res.json({ disliked });
  } catch (error: any) {
    console.error('Error checking dislike:', error);
    return res.status(500).json({ error: 'Failed to check dislike', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// POST /api/engagement/:fileId/comment - Add comment
// File owner has the content, pN commentor references it
app.post('/api/engagement/:fileId/comment', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { EngagementDriveService } = await import('./engagementDriveService');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
    const { googleDriveProxyService } = await import('./googleDriveProxy');
    const { storageCredentialsService } = await import('./storageCredentialsService');
    const { fileId } = req.params;
    const { userPnIdentifier, content, authorName, fileOwnerDid, parentCommentId, postReply } = req.body;

    if (!userPnIdentifier || !content) {
      return res.status(400).json({ error: 'userPnIdentifier and content are required' });
    }

    // Use pn identifier directly (already normalized)
    const pnIdentifier = userPnIdentifier;

    const { isDeviceCloudCustodyEnabled } = await import(
      './socialMailboxService'
    );
    if (isDeviceCloudCustodyEnabled()) {
      // Public aggregator only — no mailbox jobs for comments.
      const comment = await EngagementService.addComment(
        fileId,
        pnIdentifier,
        content,
        authorName,
        fileOwnerDid,
        parentCommentId,
        postReply
      );
      // Denormalize top-10 + sync comment count on aggregator metadata (feed tile).
      try {
        await AggregatorMetadataServiceDB.getInstance().refreshEngagementTopComments(fileId, {
          bumpCommentCount: true,
          userPnIdentifier: pnIdentifier,
        });
      } catch (err) {
        console.warn('[engagement] refreshEngagementTopComments after comment failed:', err);
      }
      const ownerPn =
        fileOwnerDid ||
        (await AggregatorMetadataServiceDB.getInstance().getFileMetadata(fileId))?.pnIdentifier;
      if (ownerPn && ownerPn !== pnIdentifier) {
        try {
          const { PushService } = await import('./pushService');
          PushService.send(ownerPn, {
            title: 'New comment',
            body: 'Someone commented on your post',
            data: { file_id: fileId, comment_id: comment.id }
          }).catch(() => undefined);
        } catch {
          /* optional */
        }
      }
      return res.json({
        success: true,
        delivery: 'public',
        comment
      });
    }

    return res.status(503).json({
      error: 'device_cloud_custody_required',
      message: 'Engagement requires device cloud custody. Set DEVICE_CLOUD_CUSTODY=1.'
    });

  } catch (error: any) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ error: 'Failed to add comment', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// POST /api/engagement/:fileId/comment/:commentId/like - Like a comment
app.post('/api/engagement/:fileId/comment/:commentId/like', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { fileId, commentId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    const result = await EngagementService.likeComment(fileId, commentId, userPnIdentifier);

    try {
      await AggregatorMetadataServiceDB.getInstance().refreshEngagementTopComments(fileId);
    } catch (err) {
      console.warn('[engagement] refreshEngagementTopComments after comment-like failed:', err);
    }

    return res.json({
      liked: result.liked,
      likes: result.likes,
      likeCount: result.likes.length
    });
  } catch (error: any) {
    console.error('Error liking comment:', error);
    return res.status(500).json({ error: 'Failed to like comment', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/:fileId/comments - Get comments
app.get('/api/engagement/:fileId/comments', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { fileId } = req.params;

    const comments = await EngagementService.getComments(fileId);

    return res.json({
      fileId,
      comments,
      count: comments.length
    });
  } catch (error: any) {
    console.error('Error getting comments:', error);
    return res.status(500).json({ error: 'Failed to get comments', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/:fileId/likes - Public likers list (who-liked sheet)
app.get('/api/engagement/:fileId/likes', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { fileId } = req.params;
    const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

    const likes = await EngagementService.listLikers(fileId, limit);

    return res.json({
      fileId,
      likes,
      count: likes.length,
    });
  } catch (error: any) {
    console.error('Error listing likes:', error);
    return res.status(500).json({
      error: 'Failed to list likes',
      message: safeClientErrorMessage(error, NODE_ENV === 'production'),
    });
  }
});

// DELETE /api/engagement/comments - Delete all comments (cleanup)
app.delete('/api/engagement/comments', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    
    const result = await EngagementService.deleteAllComments();

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} comments`
    });
  } catch (error: any) {
    console.error('Error deleting comments:', error);
    return res.status(500).json({ error: 'Failed to delete comments', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/user/:userPnIdentifier - Get all likes and comments for a user
app.get('/api/engagement/user/:userPnIdentifier', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { userPnIdentifier } = req.params;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    const db = (await import('../utils/database')).getDatabasePool();
    
    // Use userPnIdentifier directly (already normalized)
    // Engagement table stores pn identifier
    const withPrefix = userPnIdentifier;
    const withoutPrefix = userPnIdentifier.startsWith('pn-') ? userPnIdentifier.substring(3) : userPnIdentifier;
    
    // Get all files the user has liked (check both formats for legacy data)
    const likedResult = await db.query(`
      SELECT DISTINCT file_id 
      FROM engagement 
      WHERE (user_did = $1 OR user_did = $2) AND type = 'like'
    `, [withPrefix, withoutPrefix]);
    
    // Get all files the user has commented on (check both formats for legacy data)
    const commentedResult = await db.query(`
      SELECT DISTINCT file_id 
      FROM engagement 
      WHERE (user_did = $1 OR user_did = $2) AND type = 'comment'
    `, [withPrefix, withoutPrefix]);

    const likedFileIds = likedResult.rows.map(row => row.file_id);
    const commentedFileIds = commentedResult.rows.map(row => row.file_id);

    console.log(`📊 User engagement query: userPnIdentifier=${userPnIdentifier}, found ${likedFileIds.length} likes, ${commentedFileIds.length} comments`);

    return res.json({
      likedFileIds,
      commentedFileIds,
      likedCount: likedFileIds.length,
      commentedCount: commentedFileIds.length
    });
  } catch (error: any) {
    console.error('Error getting user engagement:', error);
    return res.status(500).json({ error: 'Failed to get user engagement', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// POST /api/engagement/:fileId/share - Record share
app.post('/api/engagement/:fileId/share', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
    const { fileId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    const count = await EngagementService.recordShare(fileId, userPnIdentifier);

    // Get file owner for activity logging and notifications
    const aggregator = AggregatorMetadataServiceDB.getInstance();
    const fileMetadataForOwner = await aggregator.getFileMetadata(fileId);
    const fileOwnerDid = fileMetadataForOwner?.pnIdentifier;

    // Record activity and send notification
    if (fileOwnerDid && fileOwnerDid !== userPnIdentifier) {
      try {
        const { ActivityLedgerService } = await import('./activityLedgerService');
        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Get user's credentials and metadata folder
        const pnIdentifier = userPnIdentifier;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (userCredentials?.credentials) {
          const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
            (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
          
          if (googleDriveAccounts.length > 0) {
            const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
            const accountId = account ? extractAccountId(account) : undefined;

            // Caller side-effect: resolve custody token; skip if unavailable (do not invent peer tokens).
            let token;
            try {
              const { resolveOwnerDriveToken } = await import('./ownerDriveToken');
              token = (await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId })).token;
            } catch {
              console.warn('[Engagement] Skipping share activity: cloud access token unavailable');
              token = null;
            }
            if (token) {
            const userAccessToken = token.access_token;
            const _gUser = await getMetadataFolder(token, pnIdentifier, accountId);
            if (!_gUser) {
              console.warn('[Engagement] Skipping activity: metadata folder not found');
            } else {
            const userMetadataFolderId = _gUser.metadataFolderId;

            // Record activity for sharer
            await ActivityLedgerService.recordActivity(
              userAccessToken,
              userMetadataFolderId,
              pnIdentifier,
              'share',
              {
                targetType: 'file',
                targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                metadata: { fileOwnerDid }
              }
            );
            }
            }
          }
        }

        // The owner's activity row and repost notification used to be written
        // into their Drive from here. Their device writes them from the rail.
        const ownerPnIdentifier = fileOwnerDid.startsWith('pn-') ? fileOwnerDid : `pn-${fileOwnerDid}`;
        if (ownerPnIdentifier !== pnIdentifier) {
          const { enqueueSocialJob } = await import('./socialRail');
          await enqueueSocialJob({
            jobType: 'notification_row',
            peerPn: ownerPnIdentifier,
            requestId: `share:${fileId}:${userPnIdentifier}`,
            sealed: { peerPnIdentifier: userPnIdentifier },
            extra: { kind: 'repost', fileId }
          });
        }
      } catch (error) {
        console.warn('Failed to record share activity/notification:', error);
        // Don't fail the operation if activity logging fails
      }
    }

    // Update engagement counts in database metadata
    const fileMetadata = await aggregator.getFileMetadata(fileId);
    if (fileMetadata) {
      await aggregator.syncEngagementStats(fileId);

      const ownerDid =
        fileMetadata.pnIdentifier ||
        fileMetadata.metadata.creator?.['@id'] ||
        fileMetadata.metadata.author?.did;
      if (ownerDid) {
        const { appendOwnerCompanionEngagement } = await import('./engagementCompanionSync');
        await appendOwnerCompanionEngagement(fileId, ownerDid, 'share', {
            fileId,
            pnIdentifier: userPnIdentifier,
            timestamp: new Date().toISOString()
          });
      }
    }

    return res.json({
      success: true,
      count
    });
  } catch (error: any) {
    console.error('Error recording share:', error);
    return res.status(500).json({ error: 'Failed to record share', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// POST /api/engagement/:fileId/save - Toggle save
app.post('/api/engagement/:fileId/save', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
    const { googleDriveProxyService } = await import('./googleDriveProxy');
    const { fileId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    const result = await EngagementService.toggleSave(fileId, userPnIdentifier);

    // Update engagement counts in database metadata
    const aggregator = AggregatorMetadataServiceDB.getInstance();
    const fileMetadata = await aggregator.getFileMetadata(fileId);

    if (fileMetadata) {
      await aggregator.syncEngagementStats(fileId);

      const ownerDid =
        fileMetadata.pnIdentifier ||
        fileMetadata.metadata.creator?.['@id'] ||
        fileMetadata.metadata.author?.did;
      if (ownerDid) {
        const { appendOwnerCompanionEngagement } = await import('./engagementCompanionSync');
        if (result.saved) {
          await appendOwnerCompanionEngagement(fileId, ownerDid, 'save', {
              fileId,
              pnIdentifier: userPnIdentifier,
              timestamp: new Date().toISOString()
            });
        } else {
          await appendOwnerCompanionEngagement(fileId, ownerDid, 'unsave', {
              pnIdentifier: userPnIdentifier
            });
        }
      }
    }

    return res.json({
      success: true,
      saved: result.saved,
      count: result.count
    });
  } catch (error: any) {
    console.error('Error toggling save:', error);
    return res.status(500).json({ error: 'Failed to toggle save', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/:fileId/stats - Get engagement stats
app.get('/api/engagement/:fileId/stats', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { fileId } = req.params;

    const stats = await EngagementService.getEngagementStats(fileId);

    return res.json({
      fileId,
      ...stats
    });
  } catch (error: any) {
    console.error('Error getting engagement stats:', error);
    return res.status(500).json({ error: 'Failed to get engagement stats', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// POST /api/engagement/bulk-stats - Get engagement stats for multiple files
app.post('/api/engagement/bulk-stats', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { getBearerTokenPayload } = await import('../middleware/authMiddleware');
    const { isFirstPartyClient } = await import('./integratorStoragePaths');
    const { fileIds, userPnIdentifier } = req.body;

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    const statsMap = await EngagementService.getBulkEngagementStats(fileIds);

    // Convert Map to object for JSON response
    const stats: Record<string, any> = {};
    statsMap.forEach((value, key) => {
      stats[key] = value;
    });

    // likedFiles only when a first-party Bearer proves the viewer — ignore body pn alone.
    const likedFiles: string[] = [];
    const payload = getBearerTokenPayload(req);
    const viewerPn =
      payload?.pnIdentifier && isFirstPartyClient(payload.clientId)
        ? payload.pnIdentifier
        : null;
    if (viewerPn && fileIds.length > 0) {
      // Optional body pn must match token when both present (no spoofing another user).
      const bodyPn = typeof userPnIdentifier === 'string' ? userPnIdentifier.trim() : '';
      const normalize = (id: string) =>
        id.startsWith('pn-') ? id.slice(3) : id;
      if (!bodyPn || normalize(bodyPn) === normalize(viewerPn)) {
        const likedSet = await EngagementService.getBulkLikedFiles(fileIds, viewerPn);
        likedFiles.push(...Array.from(likedSet));
      }
    }

    return res.json({
      stats,
      likedFiles,
      count: fileIds.length
    });
  } catch (error: any) {
    console.error('Error getting bulk engagement stats:', error);
    return res.status(500).json({ error: 'Failed to get bulk engagement stats', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/:fileId/metrics - Get detailed engagement metrics (verified/unverified breakdown)
app.get('/api/engagement/:fileId/metrics', async (req: Request, res: Response) => {
  try {
    const { EngagementService } = await import('./engagementService');
    const { fileId } = req.params;
    
    const metrics = await EngagementService.getEngagementMetrics(fileId);
    return res.json(metrics);
  } catch (error: any) {
    console.error('Error getting engagement metrics:', error);
    return res.status(500).json({ error: 'Failed to get engagement metrics', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

// GET /api/engagement/:fileId/monetization - Get monetization metrics (verified-only)
app.get('/api/engagement/:fileId/monetization', async (req: Request, res: Response) => {
  try {
    const { RecommendationService } = await import('./recommendationService');
    const { fileId } = req.params;
    
    const metrics = await RecommendationService.getMonetizationMetrics(fileId);
    return res.json(metrics);
  } catch (error: any) {
    console.error('Error getting monetization metrics:', error);
    return res.status(500).json({ error: 'Failed to get monetization metrics', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
  }
});

}
