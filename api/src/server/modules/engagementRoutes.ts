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
      if (typeof req.body?.liked !== 'boolean') {
        return res.status(400).json({ error: 'liked boolean is required' });
      }
      const liked = req.body.liked as boolean;
      await EngagementService.toggleLikePublicCount(fileId, liked);
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

// GET /api/engagement/:fileId/like — membership is the device engagement sheet.
app.get('/api/engagement/:fileId/like', async (_req: Request, res: Response) => {
  return res.status(409).json({
    error: 'like_state_on_device',
    message: 'Like membership is on the device engagement sheet.'
  });
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

    const { isDeviceCloudCustodyEnabled } = await import('./socialMailboxService');
    if (isDeviceCloudCustodyEnabled()) {
      if (typeof req.body?.disliked !== 'boolean') {
        return res.status(400).json({ error: 'disliked boolean is required' });
      }
      const disliked = req.body.disliked as boolean;
      await EngagementService.toggleDislikePublicCount(fileId, disliked);
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
app.get('/api/engagement/:fileId/dislike', async (_req: Request, res: Response) => {
  try {
    return res.status(409).json({
      error: 'dislike_state_on_device',
      message: 'Dislike membership is on the device engagement sheet.'
    });
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
    const likedFileIds: string[] = [];

    // Get all files the user has commented on (check both formats for legacy data)
    const commentedResult = await db.query(`
      SELECT DISTINCT file_id 
      FROM engagement 
      WHERE (user_did = $1 OR user_did = $2) AND type = 'comment'
    `, [withPrefix, withoutPrefix]);

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

    // Owner notification is a mailbox job. The sharer's sheet is written on the device.
    if (fileOwnerDid && fileOwnerDid !== userPnIdentifier) {
      try {
        const pnIdentifier = userPnIdentifier;
        const ownerPnIdentifier = fileOwnerDid.startsWith('pn-') ? fileOwnerDid : `pn-${fileOwnerDid}`;
        if (ownerPnIdentifier !== pnIdentifier) {
          const { enqueueSocialJob } = await import('./socialRail');
          const { mailboxRequestId } = await import('./socialMailboxService');
          await enqueueSocialJob({
            jobType: 'notification_row',
            peerPn: ownerPnIdentifier,
            requestId: mailboxRequestId(['share', fileId, userPnIdentifier]),
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
