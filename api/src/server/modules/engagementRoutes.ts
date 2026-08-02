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
    const { googleDriveProxyService } = await import('./googleDriveProxy');
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
    
    // Get full token object (not just access token string) for automatic refresh
    const token = {
      access_token: account?.access_token || account?.accessToken || '',
      refresh_token: account?.refresh_token || account?.refreshToken,
      expires_at: account?.expires_at,
      expires_in: account?.expires_in
    };
    const userAccessToken = token.access_token; // Keep for backward compatibility
    
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
    const { EngagementDriveService } = await import('./engagementDriveService');
    const { PreferencesService } = await import('./preferencesService');
    const { extractTagsFromMetadata } = await import('../utils/tagExtractor');
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const { googleDriveProxyService } = await import('./googleDriveProxy');
    const { storageCredentialsService } = await import('./storageCredentialsService');
    const { fileId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    // Use pn identifier directly (already normalized)
    const pnIdentifier = userPnIdentifier;

    // Get user's credentials and metadata folder for Google Drive operations
    const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
    if (!userCredentials?.credentials) {
      return res.status(404).json({ error: 'User credentials not found' });
    }

    const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
      (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
    
    const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
    const _portableSocial = await isPortableStorageProvider(pnIdentifier || userPnIdentifier || '');
    if (!_portableSocial && googleDriveAccounts.length === 0) {
      return res.status(404).json({ error: 'Storage not connected' });
    }

    let accountId: string | undefined;
    let token: any = { access_token: '' };
    let userAccessToken = '';
    let metadataFolderId = '';
    if (!_portableSocial) {
      const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
      accountId = extractAccountId(account);
      token = {
        access_token: account?.access_token || account?.accessToken || '',
        refresh_token: account?.refresh_token || account?.refreshToken,
        expires_at: account?.expires_at,
        expires_in: account?.expires_in
      };
      userAccessToken = token.access_token;
      const _g = await getMetadataFolder(token, pnIdentifier, accountId);
      if (!_g) return driveNotInitialized(res);
      metadataFolderId = _g.metadataFolderId;
    }

    // 1. Update user's Google Drive engagement.xlsx (Sheets)
    const driveResult = await EngagementDriveService.toggleDislike(
      pnIdentifier,
      fileId,
      userAccessToken,
      metadataFolderId
    );

    // 2. Update database public count (event-driven)
    await EngagementService.toggleDislikePublicCount(fileId, pnIdentifier, driveResult.disliked);

    // Get file metadata for tag extraction
    const aggregator = AggregatorMetadataServiceDB.getInstance();
    const fileMetadata = await aggregator.getFileMetadata(fileId);

    // 3. Extract tags and save as preferences (only when disliking, not removing dislike)
    if (driveResult.disliked && fileMetadata?.metadata) {
      try {
        const tags = extractTagsFromMetadata(fileMetadata.metadata, {
          fileId
        });

        for (const tag of tags) {
          await PreferencesService.addTagPreference(
            userAccessToken,
            metadataFolderId,
            pnIdentifier,
            tag.id,
            'dislike',
            'swipe_dislike',
            {
              sourceFileId: fileId,
              confidence: 0.7,
              metadata: {
                fileType: fileMetadata.metadata.fileType,
                category: fileMetadata.metadata.feedCategories?.[0],
                subject: tag.displayName
              }
            }
          );
        }
      } catch (tagError) {
        console.warn('Failed to extract and save tags:', tagError);
        // Don't fail the dislike operation if tag extraction fails
      }
    }

    // Get file owner for activity logging and notifications (fileMetadata already fetched above)
    const fileOwnerDid = fileMetadata?.pnIdentifier;

    // Get public count for response
    const publicStats = await EngagementService.getEngagementStats(fileId);
    const result = {
      disliked: driveResult.disliked,
      count: publicStats.likes // Note: dislikes count not currently tracked separately in stats
    };

    // Record activity and send notification (only when disliking, not removing dislike)
    if (result.disliked && fileOwnerDid && fileOwnerDid !== userPnIdentifier) {
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
            
            // Get full token object (not just access token string) for automatic refresh
            const token = {
              access_token: account?.access_token || account?.accessToken || '',
              refresh_token: account?.refresh_token || account?.refreshToken,
              expires_at: account?.expires_at,
              expires_in: account?.expires_in
            };
            const userAccessToken = token.access_token; // Keep for backward compatibility
            const _gUser = await getMetadataFolder(token, pnIdentifier, accountId);
            if (!_gUser) {
              console.warn('[Engagement] Skipping activity: metadata folder not found');
            } else {
            const userMetadataFolderId = _gUser.metadataFolderId;

            // Record activity for disliker (optional - may not want to track dislikes in activity)
            // Uncomment if you want to track dislikes in activity ledger
            // await ActivityLedgerService.recordActivity(
            //   userAccessToken,
            //   userMetadataFolderId,
            //   userCredentials.identityId,
            //   'dislike',
            //   {
            //     targetType: 'file',
            //     targetId: fileId,
            //     metadata: { fileOwnerDid }
            //   }
            // );

            }
          }
        }
      } catch (activityError) {
        console.error('Failed to record activity or send notification:', activityError);
        // Don't fail the request if activity/notification fails
      }
    }

    return res.json(result);
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
    const { fileId, commentId } = req.params;
    const { userPnIdentifier } = req.body;

    if (!userPnIdentifier) {
      return res.status(400).json({ error: 'userPnIdentifier is required' });
    }

    const result = await EngagementService.likeComment(fileId, commentId, userPnIdentifier);

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
    const { googleDriveProxyService } = await import('./googleDriveProxy');
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
            
            // Get full token object (not just access token string) for automatic refresh
            const token = {
              access_token: account?.access_token || account?.accessToken || '',
              refresh_token: account?.refresh_token || account?.refreshToken,
              expires_at: account?.expires_at,
              expires_in: account?.expires_in
            };
            const userAccessToken = token.access_token; // Keep for backward compatibility
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

        // Get file owner's credentials and metadata folder
        const ownerPnIdentifier = fileOwnerDid.startsWith('pn-') ? fileOwnerDid : `pn-${fileOwnerDid}`;
        const ownerCredentials = await storageCredentialsService.getCredentials(ownerPnIdentifier);
        if (ownerCredentials?.credentials) {
          const ownerGoogleDriveAccounts = ownerCredentials.credentials.googleDriveAccounts || 
            (ownerCredentials.credentials.googleDrive ? [ownerCredentials.credentials.googleDrive] : []);
          
          if (ownerGoogleDriveAccounts.length > 0) {
            const ownerAccount = ownerGoogleDriveAccounts[0];
            const ownerAccountId = extractAccountId(ownerAccount);
            
            // Get full token object for owner (not just access token string) for automatic refresh
            const ownerToken = {
              access_token: ownerAccount.access_token || ownerAccount.accessToken,
              refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
              expires_at: ownerAccount.expires_at,
              expires_in: ownerAccount.expires_in
            };
            const ownerAccessToken = ownerToken.access_token; // Keep for backward compatibility
            const _gOwner = await getMetadataFolder(ownerToken, ownerPnIdentifier, ownerAccountId);
            if (!_gOwner) {
              console.warn('[Engagement] Skipping owner activity/notification: metadata folder not found');
            } else {
            const ownerMetadataFolderId = _gOwner.metadataFolderId;

            // Record activity for file owner
            await ActivityLedgerService.recordActivity(
              ownerAccessToken,
              ownerMetadataFolderId,
              ownerPnIdentifier,
              'share',
              {
                targetType: 'file',
                targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                actorPnIdentifier: userPnIdentifier,
                metadata: { fileId }
              }
            );

            // Send notification (shares are reposts in this context)
            await NotificationService.notifyRepost(
              ownerAccessToken,
              ownerMetadataFolderId,
              fileId,
              userPnIdentifier,
              ownerCredentials.identityId
            );
            }
          }
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

    // Also check which files the user has liked if userPnIdentifier is provided
    const likedFiles: string[] = [];
    if (userPnIdentifier && fileIds.length > 0) {
      const likedSet = await EngagementService.getBulkLikedFiles(fileIds, userPnIdentifier);
      likedFiles.push(...Array.from(likedSet));
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
