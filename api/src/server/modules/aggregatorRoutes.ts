/**
 * Aggregator Routes
 * Metadata index, subjects, engagement, curated feeds, and sync endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
import { isPnDid, pnIdentifierFromDid } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { safeClientErrorMessage } from '../utils/safeError';
import { determineFileType, getFileTypeFromMime, determineContentClass } from '../utils/fileTypeUtils';
import { hashIdentifier, isDevVerbose, safeLogger } from '../../utils/logger';
import { gateOwnerRoute, gateOwnerSelfRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import { requireAdminApiKey } from './adminDeveloperRoutes';

const NODE_ENV = process.env.NODE_ENV || 'development';

function redactPnIdentifier(pnIdentifier?: string): string {
  if (!pnIdentifier) return 'pn-unknown';
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  if (normalized.length <= 8) return 'pn-***';
  return `${normalized.slice(0, 5)}***${normalized.slice(-3)}`;
}

export interface AggregatorRouteDeps {
  aggregatorLimiter: express.RequestHandler;
  metadataIndexReadLimiter: express.RequestHandler;
}

/**
 * Setup aggregator routes
 */
export function setupAggregatorRoutes(app: any, deps: AggregatorRouteDeps) {
  const { aggregatorLimiter, metadataIndexReadLimiter } = deps;

  // Aggregator metadata index endpoints
  // Use very lenient metadataIndexReadLimiter for public discovery (GET metadata-index, nsfw-index)
  // so shared IPs and pre-unlock loads don't hit 429. Other /api/aggregator use aggregatorLimiter.

  app.use('/api/aggregator', (req: Request, res: Response, next: NextFunction) => {
    const p = (req.path || req.url?.split('?')[0] || '');
    if (req.method === 'GET' && (p === '/api/aggregator/metadata-index' || p === '/api/aggregator/nsfw-index')) {
      return metadataIndexReadLimiter(req, res, next);
    }
    return aggregatorLimiter(req, res, next);
  });


  // GET /api/aggregator/metadata-index - Query public metadata
  app.get('/api/aggregator/metadata-index', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      // Parse query parameters
      const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
      const fileType = req.query.fileType as string | undefined;
      const contentClass = req.query.contentClass as 'media' | 'note' | 'collection' | undefined;
      const authorDid = req.query.authorDid as string | undefined;
      const indexerId = req.query.indexerId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const debug = req.query.debug === 'true';

      const response = await service.getIndexResponse({
        tags,
        fileType,
        contentClass,
        authorDid,
        indexerId,
        limit,    // SCALABILITY: Pagination support
        offset    // SCALABILITY: Pagination support
      });

      if (debug) {
        // Debug mode: return additional info
        const db = (await import('../utils/database')).getDatabasePool();
        // Query all three tables for debug info
        const allTables = ['aggregator_media', 'aggregator_notes', 'aggregator_collections'];
        const debugQueries = allTables.map(table =>
          db.query(`
            SELECT file_id, metadata->>'isPublic' as is_public, metadata->>'name' as name, updated_at, '${table}' as table_name
            FROM ${table}
            ORDER BY updated_at DESC
            LIMIT 100
          `)
        );
        const debugResults = await Promise.all(debugQueries);
        const allFiles = { rows: debugResults.flatMap(r => r.rows) };
        
        return res.json({
          ...response,
          debug: {
            totalInDatabase: allFiles.rows.length,
            publicInDatabase: allFiles.rows.filter((r: any) => r.is_public === 'true').length,
            sampleFiles: allFiles.rows.slice(0, 10).map((r: any) => ({
              fileId: r.file_id,
              isPublic: r.is_public,
              name: r.name,
              updatedAt: r.updated_at
            }))
          }
        });
      }

      if (isDevVerbose()) {
        console.log(`📤 [GET /api/aggregator/metadata-index] Returning ${response.files.length} files`);
      }
      const { redactCentralIndexEntryForClient } = await import('./feedPreviewClientRedact');
      return res.json({
        ...response,
        files: (response.files || []).map((f: any) => redactCentralIndexEntryForClient(f)),
      });
    } catch (error: any) {
      console.error('❌ [GET /api/aggregator/metadata-index] Error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch metadata index',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/nsfw-index - Query NSFW metadata
  app.get('/api/aggregator/nsfw-index', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      // Parse query parameters
      const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
      const fileType = req.query.fileType as string | undefined;
      const authorDid = req.query.authorDid as string | undefined;
      const indexerId = req.query.indexerId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const debug = req.query.debug === 'true';

      const response = await service.getNSFWIndexResponse({
        tags,
        fileType,
        authorDid,
        indexerId,
        limit,    // SCALABILITY: Pagination support
        offset    // SCALABILITY: Pagination support
      });

      if (debug) {
        // Debug mode: return additional info
        const db = (await import('../utils/database')).getDatabasePool();
        const allFiles = await db.query(`
          SELECT file_id, metadata->>'isPublic' as is_public, metadata->>'isNSFW' as is_nsfw, metadata->>'name' as name, updated_at
          FROM aggregator_metadata
          WHERE metadata->>'isPublic' = 'true' AND metadata->>'isNSFW' = 'true'
          ORDER BY updated_at DESC
          LIMIT 100
        `);
        
        return res.json({
          ...response,
          debug: {
            totalInDatabase: allFiles.rows.length,
            nsfwInDatabase: allFiles.rows.filter((r: any) => r.is_nsfw === 'true').length,
            sampleFiles: allFiles.rows.slice(0, 10).map((r: any) => ({
              fileId: r.file_id,
              isPublic: r.is_public,
              isNSFW: r.is_nsfw,
              name: r.name,
              updatedAt: r.updated_at
            }))
          }
        });
      }

      console.log(`📤 [GET /api/aggregator/nsfw-index] Returning ${response.files.length} NSFW files`);
      const { redactCentralIndexEntryForClient } = await import('./feedPreviewClientRedact');
      return res.json({
        ...response,
        files: (response.files || []).map((f: any) => redactCentralIndexEntryForClient(f)),
      });
    } catch (error: any) {
      console.error('❌ [GET /api/aggregator/nsfw-index] Error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch NSFW metadata index',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/my-files - Get ALL files (public + private) for authenticated user
  app.get('/api/aggregator/my-files', async (req: Request, res: Response) => {
    try {
      // Require authentication
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid or expired access token'
        });
      }

      const pnIdentifier = tokenPayload.pnIdentifier;
      if (!pnIdentifier) {
        return res.status(400).json({
          error: 'Missing pnIdentifier in token'
        });
      }

      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      // Parse query parameters
      const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
      const fileType = req.query.fileType as string | undefined;

      const files = await service.getAllFilesForUser(pnIdentifier, {
        tags,
        fileType
      });

      if (NODE_ENV === 'development') {
        console.log(
          `📤 [GET /api/aggregator/my-files] Returning ${files.length} files for user ${redactPnIdentifier(pnIdentifier)}`
        );
      }
      return res.json({
        files,
        updatedAt: new Date().toISOString(),
        totalFiles: files.length
      });
    } catch (error: any) {
      console.error('❌ [GET /api/aggregator/my-files] Error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch user files',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // POST /api/aggregator/metadata-index - Submit public metadata
  app.post('/api/aggregator/metadata-index', async (req: Request, res: Response) => {
    let requestId = Math.random().toString(36).substring(7);
    try {
      safeLogger.info('[POST /api/aggregator/metadata-index] Received request', { requestId });
      
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const { file, submittedAt, pnIdentifier } = req.body;

      // Handle both formats: { file: { metadata: {...} } } and { metadata: {...} }
      const metadata = file?.metadata || req.body.metadata;
      
      // Log incoming request for debugging
      safeLogger.info('[metadata-index] request summary', {
        requestId,
        bodyKeys: Object.keys(req.body || {}),
        metadataKeyCount: metadata ? Object.keys(metadata).length : 0,
        fileType: metadata?.fileType || metadata?.mimeType || 'unknown',
      });
      
      // Validate metadata structure
      if (!metadata) {
        safeLogger.warn('[metadata-index] No metadata object', { requestId });
        return res.status(400).json({ 
          error: 'Missing metadata object',
          requestId
        });
      }

      if (!metadata.fileId) {
        safeLogger.warn('[metadata-index] Missing fileId', {
          requestId,
          metadataKeys: Object.keys(metadata || {}),
          pnHash: hashIdentifier(pnIdentifier),
        });
        return res.status(400).json({ 
          error: 'Missing required field: fileId',
          requestId,
          receivedKeys: Object.keys(metadata)
        });
      }

      const { publicTokenContainsEmbeddedCiphertext } = await import(
        '@par-noir/aggregator-domain'
      );
      const { validatePublicRowShareFields } = await import('./publicRowGuard');
      if (publicTokenContainsEmbeddedCiphertext(metadata.publicToken)) {
        safeLogger.warn('[metadata-index] Rejected embedded publicToken ciphertext', {
          requestId,
          fileHash: hashIdentifier(metadata.fileId),
        });
        return res.status(400).json({
          error: 'embedded_public_token_forbidden',
          error_description:
            'publicToken must not embed shareEncrypted ciphertext; upload envelope to cloud and send publicContentRef + shareKey only',
          requestId,
        });
      }
      const publicGuardFailure = validatePublicRowShareFields({
        isPublic: metadata.isPublic === true,
        publicToken: metadata.publicToken,
        publicContentRef: metadata.publicContentRef,
      });
      if (publicGuardFailure) {
        return res.status(400).json({
          ...publicGuardFailure,
          requestId,
        });
      }

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload?.pnIdentifier) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Bearer required to submit metadata',
          requestId,
        });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, tokenPayload.pnIdentifier))) {
        return;
      }
      // Owner identity from token only — never trust body pnIdentifier.
      const ownerPnIdentifier = tokenPayload.pnIdentifier;

      if (metadata.publicContentRef && typeof metadata.publicContentRef === 'object') {
        const ref = metadata.publicContentRef as { publicUrl?: string; backend?: string };
        if (typeof ref.publicUrl === 'string' && typeof ref.backend === 'string') {
          try {
            const { assertSafePublicFetchUrlResolved } = await import('./safePublicFetchUrl');
            await assertSafePublicFetchUrlResolved(ref.publicUrl, ref.backend);
          } catch (err) {
            return res.status(400).json({
              error: 'unsafe_public_url',
              error_description: err instanceof Error ? err.message : 'publicUrl rejected',
              requestId,
            });
          }
        }
      }

      {
        const { rejectUnsafePublicLinks } = await import('./publicLinkGuard');
        if (await rejectUnsafePublicLinks(res, metadata, requestId)) return;
      }

      // Validate metadata (support both legacy and semantic web format)
      const title = metadata.name || metadata.title;
      const authorDid = metadata.creator?.identifier?.value || metadata.creator?.["@id"] || metadata.author?.did;
      
      // More lenient validation - allow missing fields with defaults
      const validatedMetadata: any = {
        ...metadata,
        backend: metadata.backend || 'google_drive',
        backendFileId: metadata.backendFileId || metadata.fileId,
        name: title || metadata.fileId || 'Untitled',
        uploadDate: metadata.uploadDate || new Date().toISOString(),
        isPublic: metadata.isPublic === true, // Default to false (private) if not explicitly set to true
        fileType: metadata.fileType || getFileTypeFromMime(metadata.mimeType) || 'other'
      };

      const expiryTouched =
        metadata.expiresAt !== undefined ||
        metadata.ttlSeconds !== undefined ||
        metadata.persistOnDiscover !== undefined;
      if (expiryTouched) {
        try {
          const { normalizeContentExpiry, ContentExpiryError } = await import('@par-noir/aggregator-domain');
          const clockTouched =
            metadata.expiresAt !== undefined || metadata.ttlSeconds !== undefined;
          if (clockTouched) {
            const expiry = normalizeContentExpiry({
              expiresAt: metadata.expiresAt,
              ttlSeconds: metadata.ttlSeconds,
              persistOnDiscover: metadata.persistOnDiscover
            });
            validatedMetadata.expiresAt = expiry.expiresAt;
            if (metadata.persistOnDiscover !== undefined) {
              validatedMetadata.persistOnDiscover = expiry.persistOnDiscover;
            }
          } else if (metadata.persistOnDiscover !== undefined) {
            validatedMetadata.persistOnDiscover = metadata.persistOnDiscover === true;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid content expiry';
          const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'invalid_expiry';
          return res.status(400).json({
            error: code,
            error_description: message,
            requestId
          });
        }
      }
      delete validatedMetadata.ttlSeconds;

      // Only require fileId - other fields can be optional
      if (!validatedMetadata.fileId) {
        safeLogger.warn('[metadata-index] Missing fileId after validation', { requestId });
        return res.status(400).json({ 
          error: 'Missing required field: fileId after validation',
          requestId
        });
      }

      {
        const { validatePublicFeedPreviewRefs } = await import('./feedPreviewClientRedact');
        const previewCheck = validatePublicFeedPreviewRefs(validatedMetadata as any);
        if (!previewCheck.ok) {
          return res.status(400).json({
            error: previewCheck.error,
            error_description: 'Public visual media requires CDN feed preview refs',
            requestId,
          });
        }
      }

      console.log(`📝 [${requestId}] Submitting metadata for file: ${validatedMetadata.fileId}`);
      // #region agent log
      // #endregion

      // When making content public: repeat-infringer, publish safety (prohibited/nsfw), Prism bypass, DMCA
      if (validatedMetadata.isPublic === true) {
        const { isRepeatInfringer } = await import('./repeatInfringerService');
        if (await isRepeatInfringer(ownerPnIdentifier)) {
          return res.status(403).json({
            error: 'Account restricted',
            message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
            requestId
          });
        }
        const existingEntry = await service.getFileMetadata(validatedMetadata.fileId);
        const { runPublishModeration, respondPublishModeration } = await import('./publishModeration');
        const moderation = await runPublishModeration({
          ownerPnIdentifier,
          fileId: validatedMetadata.fileId,
          metadata: { ...(existingEntry?.metadata || {}), ...validatedMetadata } as any,
        });
        if (respondPublishModeration(res, moderation, requestId)) return;
        if (moderation.status === 'ok' && moderation.forceNsfw) {
          (validatedMetadata as any).isNSFW = true;
        }
      }

      // Submit metadata to central index (owner from bearer only)
      await service.submitMetadata(validatedMetadata, ownerPnIdentifier);

      // #region agent log
      // #endregion
      console.log(`✅ [${requestId}] Successfully submitted metadata for: ${validatedMetadata.fileId}`);
      return res.json({
        success: true,
        fileId: validatedMetadata.fileId,
        submittedAt: submittedAt || new Date().toISOString(),
        requestId
      });
    } catch (error: any) {
      console.error(`❌ [${requestId}] [POST /api/aggregator/metadata-index] Error:`, error);
      console.error(`❌ [${requestId}] Error message:`, error?.message);
      console.error(`❌ [${requestId}] Error stack:`, error?.stack);
      console.error(`❌ [${requestId}] Request body:`, JSON.stringify(req.body, null, 2));
      return res.status(500).json({ 
        error: 'Failed to submit metadata',
        message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        requestId,
        stack: NODE_ENV === 'development' ? error?.stack : undefined
      });
    }
  });

  // POST /api/aggregator/metadata-index/reconcile - Align aggregator cache with owner public indexes
  // Also run automatically every 5 minutes. MUST be before /:fileId route. Admin-only HTTP trigger.
  app.post('/api/aggregator/metadata-index/reconcile', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const { runReconcilePublicAggregator } = await import('../jobs/reconcilePublicAggregatorJob');
      const result = await runReconcilePublicAggregator();
      return res.json({
        success: true,
        ...result,
        message: `Reconciled ${result.usersChecked} user(s); removed ${result.filesRemoved} file(s); purged ${result.usersPurged} user(s)`,
      });
    } catch (error: any) {
      console.error('[Reconcile] Error:', error);
      return res.status(500).json({
        error: 'Failed to reconcile public aggregator cache',
        message: safeClientErrorMessage(error, NODE_ENV === 'production'),
      });
    }
  });

  // POST /api/aggregator/metadata-index/cleanup-tables - Clear all database entries (for fresh start)
  // MUST be before /:fileId route to avoid route conflict. Admin-only — destructive.
  app.post('/api/aggregator/metadata-index/cleanup-tables', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const db = (await import('../utils/database')).getDatabasePool();
      await db.query('DELETE FROM aggregator_media');
      await db.query('DELETE FROM aggregator_notes');
      await db.query('DELETE FROM aggregator_collections');
      try {
        await db.query('DELETE FROM feed_posts');
      } catch (e) {
        // Ignore if table doesn't exist
      }
      return res.json({ success: true, message: 'Cleared all aggregator tables' });
    } catch (error: any) {
      console.error('Error in cleanup-tables endpoint:', error);
      return res.status(500).json({ 
        error: 'Failed to cleanup database',
        message: safeClientErrorMessage(error, NODE_ENV === 'production')
      });
    }
  });

  // DELETE /api/aggregator/metadata-index/user/:pnIdentifier — owner or admin only
  app.delete('/api/aggregator/metadata-index/user/:pnIdentifier', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier } = req.params;
      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pnIdentifier is required' });
      }

      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Bearer required to purge user public metadata',
        });
      }
      const caller = tokenPayload.pnIdentifier || tokenPayload.did;
      const target = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
      const callerNorm =
        typeof caller === 'string' && caller.startsWith('pn-') ? caller : caller ? `pn-${caller}` : '';
      if (!callerNorm || callerNorm !== target) {
        return res.status(403).json({
          error: 'forbidden',
          error_description: 'Only the owning identity may purge its public aggregator rows',
        });
      }

      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();
      
      const removedCount = await service.removeAllMetadataForUser(pnIdentifier);
      
      return res.json({
        success: true,
        message: `Removed ${removedCount} file(s) from aggregator database`,
        removedCount
      });
    } catch (error: any) {
      console.error('Error removing all metadata for user:', error);
      return res.status(500).json({
        error: 'Failed to remove user metadata',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to remove user metadata'
      });
    }
  });

  app.delete('/api/aggregator/metadata-index/:fileId', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const { fileId } = req.params;
      const accountId = req.query.accountId as string | undefined;

      if (!fileId) {
        return res.status(400).json({ error: 'Missing fileId parameter' });
      }

      // STEP 0: Validate token and get user identifier
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid or expired access token'
        });
      }
      const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
      const pnIdentifier = tokenPayload.pnIdentifier || null;

      if (pnIdentifier) {
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload))) return;
      }

      // CRITICAL: Only thumbnails have metadata
      // If fileId is a main file, find the thumbnail that references it
      let current = await service.getFileMetadata(fileId);
      let actualFileId = fileId; // The fileId we'll actually operate on (might be thumbnail if fileId was main file)
      
      if (!current) {
        try {
          const db = (await import('../utils/database')).getDatabasePool();
          // Search for thumbnail with mainFileId = fileId across all content type tables
          const thumbnailQuery = await db.query(
            `SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_media 
             WHERE metadata->>'mainFileId' = $1 
             UNION ALL
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_notes 
             WHERE metadata->>'mainFileId' = $1 
             UNION ALL
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_collections 
             WHERE metadata->>'mainFileId' = $1 
             LIMIT 1`,
            [fileId]
          );
          
          if (thumbnailQuery.rows.length > 0) {
            const thumbnailRow = thumbnailQuery.rows[0];
            actualFileId = thumbnailRow.file_id;
            current = {
              fileId: thumbnailRow.file_id,
              metadata: typeof thumbnailRow.metadata === 'string' 
                ? JSON.parse(thumbnailRow.metadata) 
                : thumbnailRow.metadata,
              submittedAt: thumbnailRow.submitted_at ? (thumbnailRow.submitted_at instanceof Date ? thumbnailRow.submitted_at.toISOString() : thumbnailRow.submitted_at) : new Date().toISOString(),
              pnIdentifier: thumbnailRow.pn_identifier
            };
            console.log(`[MetadataIndex DELETE] Resolved main file ${fileId} to thumbnail ${actualFileId}`);
          }
        } catch (lookupError: any) {
          console.warn(`[MetadataIndex DELETE] Failed to lookup thumbnail for main file ${fileId}:`, lookupError?.message || lookupError);
        }
      }
      
      // CRITICAL: OWNERSHIP VERIFICATION - Only owner can delete metadata
      if (!current) {
        return res.status(404).json({ error: 'File not found in index' });
      }

      const fileOwnerDid = current.metadata.creator?.identifier?.value || 
                         current.metadata.creator?.["@id"] || 
                         current.metadata.author?.did ||
                         current.pnIdentifier;
      
      if (fileOwnerDid !== userIdentifier && current.pnIdentifier !== userIdentifier) {
        console.error(`[MetadataIndex DELETE] UNAUTHORIZED: Attempt to delete metadata for file ${fileId} by non-owner. Owner: ${fileOwnerDid}, Requesting: ${userIdentifier}`);
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'Only the file owner can delete metadata'
        });
      }

      // STEP 1: Collect all files to delete
      const filesToDelete: string[] = [];
      const metadata = current.metadata;

      // Add thumbnail file (actualFileId)
      filesToDelete.push(actualFileId);

      // Add main file if it exists
      if (metadata.mainFileId) {
        filesToDelete.push(metadata.mainFileId);
        console.log(`[MetadataIndex DELETE] Will delete main file: ${metadata.mainFileId}`);
      }

      // For collections, add all page thumbnails
      if (metadata.collection?.collectionFileIds && Array.isArray(metadata.collection.collectionFileIds)) {
        for (const pageThumbnailId of metadata.collection.collectionFileIds) {
          if (pageThumbnailId && !filesToDelete.includes(pageThumbnailId)) {
            filesToDelete.push(pageThumbnailId);
            console.log(`[MetadataIndex DELETE] Will delete collection page thumbnail: ${pageThumbnailId}`);
          }
        }
      }

      // The device deletes these from the owner's cloud (files, companion sheets, index rows).
      const removed = await service.removeMetadata(actualFileId);

      if (removed) {
        const { feedR2Delete } = await import('./feedPreviewR2');
        for (const field of ['feedPoster', 'feedPreviewSd', 'feedPreviewHd'] as const) {
          const key = (metadata as any)?.[field]?.r2Key;
          if (typeof key === 'string' && key) {
            await feedR2Delete(key).catch(() => undefined);
          }
        }
        return res.json({
          success: true,
          fileId: actualFileId,
          deviceCleanupFileIds: filesToDelete
        });
      } else {
        return res.status(404).json({ error: 'File not found in index' });
      }
    } catch (error: any) {
      console.error('Error removing aggregator metadata:', error);
      return res.status(500).json({ 
        error: 'Failed to remove metadata',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/metadata-index/debug - Admin-only debug (leaks private sample names)
  app.get('/api/aggregator/metadata-index/debug', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const db = (await import('../utils/database')).getDatabasePool();
      
      // Get all files with their isPublic status
      const allFiles = await db.query(`
        SELECT 
          file_id, 
          metadata->>'isPublic' as is_public, 
          metadata->>'isPublic'::boolean as is_public_bool,
          metadata->>'name' as name,
          metadata->>'fileType' as file_type,
          metadata->>'publicToken' as has_public_token,
          metadata->>'backendFileId' as backend_file_id,
          metadata->>'backend' as backend,
          CASE 
            WHEN metadata->>'textPost' IS NOT NULL OR metadata->>'thought' IS NOT NULL THEN 'note'
            ELSE metadata->>'fileType'
          END as detected_type,
          updated_at
        FROM aggregator_metadata
        ORDER BY updated_at DESC
      `);
      
      const publicFiles = allFiles.rows.filter((r: any) => 
        r.is_public === 'true' || r.is_public_bool === true
      );
      const privateFiles = allFiles.rows.filter((r: any) => 
        (r.is_public === 'false' || r.is_public === null) && r.is_public_bool !== true
      );
      const filesWithTokenButNotPublic = allFiles.rows.filter((r: any) => 
        r.is_public !== 'true' && r.is_public_bool !== true && r.has_public_token
      );
      const googleDriveFiles = allFiles.rows.filter((r: any) => r.backend === 'google_drive');
      
      // Count by file type
      const notes = allFiles.rows.filter((r: any) => 
        r.file_type === 'note' || r.file_type === 'text' || r.detected_type === 'note'
      );
      const publicNotes = notes.filter((r: any) => 
        r.is_public === 'true' || r.is_public_bool === true
      );
      
      // Check feed_posts status
      const feedPostsCheck = await db.query(`
        SELECT 
          COUNT(DISTINCT am.file_id) as public_files_total,
          COUNT(DISTINCT fp.file_id) as public_files_in_feeds,
          COUNT(DISTINCT am.file_id) - COUNT(DISTINCT fp.file_id) as public_files_not_in_feeds
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (am.metadata->>'isPublic' = 'true' OR (am.metadata->>'isPublic')::boolean = true)
      `);
      
      const feedStats = feedPostsCheck.rows[0];

      return res.json({
        totalFiles: allFiles.rows.length,
        publicFiles: publicFiles.length,
        privateFiles: privateFiles.length,
        filesWithTokenButNotPublic: filesWithTokenButNotPublic.length,
        googleDriveFiles: googleDriveFiles.length,
        feedStats: {
          publicFilesTotal: parseInt(feedStats.public_files_total || '0', 10),
          publicFilesInFeeds: parseInt(feedStats.public_files_in_feeds || '0', 10),
          publicFilesNotInFeeds: parseInt(feedStats.public_files_not_in_feeds || '0', 10)
        },
        samplePublicFiles: publicFiles.slice(0, 10).map((r: any) => ({
          fileId: r.file_id,
          name: r.name,
          backendFileId: r.backend_file_id,
          backend: r.backend,
          updatedAt: r.updated_at
        })),
        samplePrivateFiles: privateFiles.slice(0, 5).map((r: any) => ({
          fileId: r.file_id,
          name: r.name,
          isPublic: r.is_public,
          hasPublicToken: !!r.has_public_token,
          backend: r.backend,
          updatedAt: r.updated_at
        })),
        note: 'The public feed (no feedId) shows ALL public files. Specific feeds (with feedId) only show files in feed_posts table.'
      });
    } catch (error: any) {
      console.error('Error in debug endpoint:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch debug info',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // POST /api/aggregator/metadata-index/invalidate-cache - Invalidate index cache (admin)
  app.post('/api/aggregator/metadata-index/invalidate-cache', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const { invalidateIndexCache } = await import('../utils/cache');
      await invalidateIndexCache();
      return res.json({ 
        success: true, 
        message: 'Index cache invalidated successfully' 
      });
    } catch (error: any) {
      console.error('Error invalidating cache:', error);
      return res.status(500).json({ 
        error: 'Failed to invalidate cache',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/fix-feeds - Diagnostic and fix endpoint for feed issues (admin)
  app.get('/api/aggregator/fix-feeds', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const db = (await import('../utils/database')).getDatabasePool();
      const { invalidateIndexCache } = await import('../utils/cache');
      
      // 1. Check current state - handle JSONB boolean values safely
      const stateCheck = await db.query(`
        SELECT 
          COUNT(*) as total_files,
          COUNT(*) FILTER (WHERE 
            jsonb_typeof(metadata->'isPublic') = 'boolean' AND (metadata->'isPublic')::boolean = true
            OR jsonb_typeof(metadata->'isPublic') = 'string' AND (metadata->>'isPublic') = 'true'
          ) as public_files,
          COUNT(*) FILTER (WHERE 
            jsonb_typeof(metadata->'isPublic') = 'boolean' AND (metadata->'isPublic')::boolean = false
            OR jsonb_typeof(metadata->'isPublic') = 'string' AND (metadata->>'isPublic') = 'false'
            OR metadata->'isPublic' IS NULL
          ) as private_files
        FROM aggregator_metadata
      `);
      
      const feedPostsCheck = await db.query(`
        SELECT 
          COUNT(DISTINCT am.file_id) as public_files_total,
          COUNT(DISTINCT fp.file_id) as public_files_in_feeds
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          jsonb_typeof(am.metadata->'isPublic') = 'boolean' AND (am.metadata->'isPublic')::boolean = true
          OR jsonb_typeof(am.metadata->'isPublic') = 'string' AND (am.metadata->>'isPublic') = 'true'
        )
      `);
      
      // 2. Get sample public files
      const samplePublic = await db.query(`
        SELECT 
          am.file_id,
          am.metadata->>'name' as name,
          CASE 
            WHEN jsonb_typeof(am.metadata->'isPublic') = 'boolean' AND (am.metadata->'isPublic')::boolean = true THEN 'true'
            WHEN jsonb_typeof(am.metadata->'isPublic') = 'string' AND am.metadata->>'isPublic' = 'true' THEN 'true'
            ELSE 'false'
          END as is_public,
          COUNT(fp.feed_id) as feed_count
        FROM aggregator_metadata am
        LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
        WHERE (
          jsonb_typeof(am.metadata->'isPublic') = 'boolean' AND (am.metadata->'isPublic')::boolean = true
          OR jsonb_typeof(am.metadata->'isPublic') = 'string' AND (am.metadata->>'isPublic') = 'true'
        )
        GROUP BY am.file_id, am.metadata->>'name', am.metadata->'isPublic'
        ORDER BY am.updated_at DESC
        LIMIT 10
      `);
      
      // 3. Invalidate cache
      await invalidateIndexCache();
      
      const stats = stateCheck.rows[0];
      const feedStats = feedPostsCheck.rows[0];
      
      return res.json({
        success: true,
        message: 'Diagnostic complete and cache cleared',
        database: {
          totalFiles: parseInt(stats.total_files || '0', 10),
          publicFiles: parseInt(stats.public_files || '0', 10),
          privateFiles: parseInt(stats.private_files || '0', 10),
          publicFilesInFeeds: parseInt(feedStats.public_files_in_feeds || '0', 10),
          publicFilesNotInFeeds: parseInt(feedStats.public_files_total || '0', 10) - parseInt(feedStats.public_files_in_feeds || '0', 10)
        },
        samplePublicFiles: samplePublic.rows.map((r: any) => ({
          fileId: r.file_id,
          name: r.name,
          isPublic: r.is_public,
          inFeeds: parseInt(r.feed_count || '0', 10)
        })),
        note: 'Public feed (no feedId) shows ALL public files. Specific feeds only show files in feed_posts table. Cache has been cleared.'
      });
    } catch (error: any) {
      console.error('Error in fix-feeds endpoint:', error);
      return res.status(500).json({ 
        error: 'Failed to run diagnostic',
        message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // GET /api/aggregator/metadata-index/:fileId/inspect - Deep inspection of a specific file's metadata
  app.get('/api/aggregator/metadata-index/:fileId/inspect', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();
      const { fileId } = req.params;
      
      const entry = await service.getFileMetadata(fileId);
      if (!entry) {
        return res.json({ 
          exists: false,
          fileId,
          message: 'File not found in database'
        });
      }
      
      const metadata = entry.metadata as any;
      const hasTextPost = !!metadata.textPost;
      const hasThought = !!metadata.thought;
      const textPostContent = metadata.textPost?.content;
      const thoughtContent = metadata.thought?.content;
      const isJustFilename = /^thought-\d+\.(thought|png)/i.test(textPostContent || thoughtContent || '');
      
      return res.json({
        exists: true,
        fileId,
        isPublic: metadata.isPublic === true || metadata.isPublic === 'true',
        fileType: metadata.fileType,
        name: metadata.name,
        hasTextPost,
        hasThought,
        textPostContent: textPostContent ? (textPostContent.length > 100 ? textPostContent.substring(0, 100) + '...' : textPostContent) : null,
        thoughtContent: thoughtContent ? (thoughtContent.length > 100 ? thoughtContent.substring(0, 100) + '...' : thoughtContent) : null,
        isJustFilename,
        hasPublicToken: !!metadata.publicToken,
        metadataKeys: Object.keys(metadata),
        fullMetadata: metadata // Include full metadata for inspection
      });
    } catch (error: any) {
      console.error('Error inspecting file metadata:', error);
      return res.status(500).json({ 
        error: 'Failed to inspect file metadata',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/metadata-index/stats - Get index statistics
  app.get('/api/aggregator/metadata-index/stats', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const stats = await service.getStats();
      res.json(stats);
    } catch (error: any) {
      console.error('Error fetching aggregator stats:', error);
      res.status(500).json({ 
        error: 'Failed to fetch stats',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/owner-catalog — authenticated owner's indexed posts (incl. Pen publish)
  app.get('/api/aggregator/owner-catalog', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid or expired access token'
        });
      }
      const pnIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
      if (!pnIdentifier) {
        return res.status(401).json({ error: 'unauthorized', error_description: 'Missing identity' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) {
        return;
      }

      const contentClass = req.query.contentClass as 'media' | 'note' | 'collection' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();
      const result = await service.listOwnerCatalog(pnIdentifier, {
        contentClass,
        limit,
        offset
      });

      const { redactCentralIndexEntryForClient } = await import('./feedPreviewClientRedact');
      return res.json({
        files: result.files.map((f: any) => redactCentralIndexEntryForClient(f)),
        total: result.total,
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('❌ [GET /api/aggregator/owner-catalog] Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch owner catalog',
        message: safeClientErrorMessage(error, NODE_ENV === 'production')
      });
    }
  });

  // GET /api/aggregator/metadata-index/:fileId - Get metadata for a specific file
  app.get('/api/aggregator/metadata-index/:fileId', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const { fileId } = req.params;
      if (isDevVerbose()) {
        console.log(`[MetadataIndex GET] Request received for fileId: ${fileId}`);
      }

      if (!fileId) {
        return res.status(400).json({ error: 'Missing fileId parameter' });
      }

      // Check if metadata entry exists
      let metadata = await service.getFileMetadata(fileId);
      if (isDevVerbose()) {
        console.log(`[MetadataIndex GET] Existing entry check for ${fileId}: ${metadata ? 'found' : 'not found'}`);
      }

      // If not found, fileId might be a main file - try to find thumbnail that references it
      if (!metadata) {
        try {
          const db = (await import('../utils/database')).getDatabasePool();
          // Search for thumbnail with mainFileId = fileId across all content type tables
          const thumbnailQuery = await db.query(
            `SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_media 
             WHERE metadata->>'mainFileId' = $1 
             UNION ALL
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_notes 
             WHERE metadata->>'mainFileId' = $1 
             UNION ALL
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_collections 
             WHERE metadata->>'mainFileId' = $1 
             LIMIT 1`,
            [fileId]
          );
          
          if (thumbnailQuery.rows.length > 0) {
            const thumbnailRow = thumbnailQuery.rows[0];
            metadata = {
              fileId: thumbnailRow.file_id,
              metadata: typeof thumbnailRow.metadata === 'string' 
                ? JSON.parse(thumbnailRow.metadata) 
                : thumbnailRow.metadata,
              submittedAt: thumbnailRow.submitted_at ? (thumbnailRow.submitted_at instanceof Date ? thumbnailRow.submitted_at.toISOString() : thumbnailRow.submitted_at) : new Date().toISOString(),
              pnIdentifier: thumbnailRow.pn_identifier
            };
            console.log(`[MetadataIndex GET] Found thumbnail ${thumbnailRow.file_id} for main file ${fileId}`);
          }
        } catch (lookupError: any) {
          console.warn(`[MetadataIndex GET] Failed to lookup thumbnail for main file ${fileId}:`, lookupError?.message || lookupError);
        }
      }

      if (!metadata) {
        return res.status(404).json({ error: 'File not found in index' });
      }

      const meta = metadata.metadata || metadata;
      const { redactFeedPreviewFieldsInMetadata } = await import('./feedPreviewClientRedact');
      const out: { metadata: any; pnIdentifier?: string } = {
        metadata: redactFeedPreviewFieldsInMetadata(
          typeof meta === 'object' && meta ? (meta as unknown as Record<string, unknown>) : {}
        ),
      };
      if ((metadata as any).pnIdentifier) {
        out.pnIdentifier = (metadata as any).pnIdentifier;
      }
      return res.json(out);
    } catch (error: any) {
      console.error('Error getting metadata:', error);
      return res.status(500).json({
        error: 'Failed to get metadata',
        message: safeClientErrorMessage(error, NODE_ENV === 'production')
      });
    }
  });

  // PUT /api/aggregator/metadata-index/:fileId - Update metadata (creates entry if doesn't exist)
  app.put('/api/aggregator/metadata-index/:fileId', async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const putStartedAt = Date.now();
      console.log(`[MetadataIndex PUT] Request received for fileId: ${fileId}, isPublic: ${req.body.isPublic}`);
      
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const { 
        name, 
        title,
        description, 
        keywords, 
        tags,
        genre,
        category,
        locationCreated,
        license,
        inLanguage,
        isPublic,
        publicToken,
        publicContentRef,
        feedPoster,
        feedPreviewSd,
        feedPreviewHd,
        isTopPost,
        textPost,
        thought,
        collection, // Collection data with collectionFileIds
        fileType,
        isNSFW,
        subjects,
        feedCategories,
        thumbnailFileId,
        isNoteThumbnail, // Flag indicating this is a thumbnail of a note
        isPartOfCollection, // Flag indicating this file is part of a collection
        mainFileId, // Reference to the source file (for thumbnails)
        isEncrypted, // True if main file is encrypted; false for raw uploads over tier limit
        expiresAt,
        ttlSeconds,
        persistOnDiscover
      } = req.body;

      if (!fileId) {
        return res.status(400).json({ error: 'Missing fileId parameter' });
      }

      // Check if metadata entry exists BEFORE creating/updating (to detect new files)
      let current = await service.getFileMetadata(fileId);
      let actualFileId = fileId; // The fileId we'll actually operate on (might be thumbnail if fileId was main file)
      
      // If fileId has no metadata, it might be a main file - try to find thumbnail that references it
      if (!current) {
        try {
          const db = (await import('../utils/database')).getDatabasePool();
          // Search for thumbnail with mainFileId = fileId across all content type tables
          const thumbnailQuery = await db.query(
            `SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_media 
             WHERE metadata->>'mainFileId' = $1 
             UNION ALL
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_notes 
             WHERE metadata->>'mainFileId' = $1 
             UNION ALL
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_collections 
             WHERE metadata->>'mainFileId' = $1 
             LIMIT 1`,
            [fileId]
          );
          
          if (thumbnailQuery.rows.length > 0) {
            const thumbnailRow = thumbnailQuery.rows[0];
            actualFileId = thumbnailRow.file_id;
            current = {
              fileId: thumbnailRow.file_id,
              metadata: typeof thumbnailRow.metadata === 'string' 
                ? JSON.parse(thumbnailRow.metadata) 
                : thumbnailRow.metadata,
              submittedAt: thumbnailRow.submitted_at ? (thumbnailRow.submitted_at instanceof Date ? thumbnailRow.submitted_at.toISOString() : thumbnailRow.submitted_at) : new Date().toISOString(),
              pnIdentifier: thumbnailRow.pn_identifier
            };
            console.log(`[MetadataIndex PUT] Resolved main file ${fileId} to thumbnail ${actualFileId}`);
          }
        } catch (lookupError: any) {
          console.warn(`[MetadataIndex PUT] Failed to lookup thumbnail for main file ${fileId}:`, lookupError?.message || lookupError);
        }
      }
      
      const fileExistedBefore = !!current;
      console.log(`[MetadataIndex PUT] Existing entry check for ${fileId} (actualFileId: ${actualFileId}): ${current ? 'found' : 'not found'}, existedBefore: ${fileExistedBefore}`);
      
      // Get auth token for operations (needed for both new and existing files)
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid or expired access token'
        });
      }

      // Define userIdentifier for use in both new file creation and companion metadata reading
      const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
      let aggregatorSubmittedThisRequest = false;
      let dmcaCheckedThisRequest = false;
      const accountIdParam = (req.query.accountId as string) || undefined;
      if (tokenPayload.pnIdentifier) {
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, tokenPayload.pnIdentifier))) return;
      }

      {
        const { rejectUnsafePublicLinks } = await import('./publicLinkGuard');
        const { penIndexFields } = await import('./penIndexFields');
        if (await rejectUnsafePublicLinks(res, penIndexFields(req.body))) return;
      }

      const penPostUpdate = req.body?.penPostUpdate === true;
      let penPostUpdateClearKeys: string[] | undefined;
      const supersededPreviewR2Keys: string[] = [];
      if (penPostUpdate) {
        if (!current) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'penPostUpdate requires an existing metadata row'
          });
        }
        const fileOwnerDid =
          current.metadata.creator?.identifier?.value ||
          current.metadata.creator?.['@id'] ||
          current.metadata.author?.did ||
          current.pnIdentifier;
        if (fileOwnerDid !== userIdentifier && current.pnIdentifier !== userIdentifier) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Only the file owner can update a published Pen post'
          });
        }
        if (typeof (current.metadata as any).penDocId !== 'string' || !(current.metadata as any).penDocId) {
          return res.status(400).json({
            error: 'not_pen_post',
            error_description: 'penPostUpdate requires an existing Pen post (penDocId)'
          });
        }
        const { penPostUpdateClearKeys: computeClearKeys } = await import('./penIndexFields');
        penPostUpdateClearKeys = computeClearKeys(req.body);
        for (const field of ['feedPoster', 'feedPreviewSd', 'feedPreviewHd'] as const) {
          const ref = (current.metadata as any)[field];
          if (ref && typeof ref === 'object' && typeof ref.r2Key === 'string' && ref.r2Key) {
            const incoming = req.body?.[field];
            const incomingKey =
              incoming && typeof incoming === 'object' && typeof (incoming as any).r2Key === 'string'
                ? (incoming as any).r2Key
                : undefined;
            if (!incomingKey || incomingKey !== ref.r2Key) {
              supersededPreviewR2Keys.push(ref.r2Key);
            }
          }
        }
      }
      
      if (!current) {
        // Create new metadata entry - fetch file info from Google Drive
        const identifierCandidates: string[] = [];
        if (tokenPayload.pnIdentifier) {
          identifierCandidates.push(tokenPayload.pnIdentifier);
        }
        if (tokenPayload.did) {
          identifierCandidates.push(tokenPayload.did);
          if (isPnDid(tokenPayload.did)) {
            const keyPart = pnIdentifierFromDid(tokenPayload.did);
            if (keyPart) {
              identifierCandidates.push(keyPart);
            }
          }
        }

        // Fetch file info from Google Drive
        
        try {
          const driveFile = {
            name: (typeof name === 'string' && name) || (typeof title === 'string' && title) || fileId,
            mimeType: typeof (req.body as { mimeType?: string }).mimeType === 'string'
              ? (req.body as { mimeType?: string }).mimeType
              : undefined,
            createdTime: new Date().toISOString(),
            size: undefined as string | undefined
          };
          
          // Create initial metadata entry
          // IMPORTANT: Default isPublic to true for text posts, false for other files
          const defaultIsPublic = (textPost || thought) ? true : false;
          // Determine fileType using centralized utility (handles collection, textPost, thought, MIME type)
          const determinedFileType = determineFileType({
            fileType,
            collection,
            textPost,
            thought,
            mimeType: driveFile.mimeType,
            isNoteThumbnail,
            isPartOfCollection
          });
          const createIsPublic = isPublic !== undefined ? isPublic : defaultIsPublic;
          {
            const { validatePublicRowShareFields, rejectUnsafePublicContentRefWrite } = await import('./publicRowGuard');
            const publicGuardFailure = validatePublicRowShareFields({
              isPublic: createIsPublic === true,
              publicToken,
              publicContentRef,
            });
            if (publicGuardFailure) {
              return res.status(400).json(publicGuardFailure);
            }
            if (await rejectUnsafePublicContentRefWrite(res, publicContentRef)) return;
          }
          const initialMetadata: any = {
            fileId: fileId,
            backendFileId: fileId,
            backend: 'google_drive',
            name: name || driveFile.name?.replace(/\.encrypted$/i, '') || fileId,
            ...(title && { title }),
            fileType: determinedFileType,
            uploadDate: driveFile.createdTime || new Date().toISOString(),
            isPublic: createIsPublic,
            ...(publicToken && { publicToken }),
            ...(publicContentRef && { publicContentRef }),
            ...(feedPoster !== undefined && { feedPoster }),
            ...(feedPreviewSd !== undefined && { feedPreviewSd }),
            ...(feedPreviewHd !== undefined && { feedPreviewHd }),
            ...(textPost && { textPost }),
            ...(thought && { thought }),
            ...(collection && { collection }), // Include collection data if provided
            ...(isNSFW !== undefined && { isNSFW: isNSFW === true }),
            ...(isNoteThumbnail !== undefined && { isNoteThumbnail }), // Thumbnails inherit classification from source
            ...(isPartOfCollection !== undefined && { isPartOfCollection }), // Collection files inherit collection classification
            ...(mainFileId && { mainFileId }), // Reference to source file for thumbnails
            ...(thumbnailFileId && { thumbnailFileId }), // Reference to thumbnail file
            ...(isEncrypted !== undefined && { isEncrypted }),
            "@context": ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
            "@id": `https://parnoir.com/resource/${fileId}`,
            engagement: {
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              lastUpdated: new Date().toISOString()
            },
            ...((await import('./penIndexFields')).penIndexFields(req.body))
          };

          if (expiresAt !== undefined || ttlSeconds !== undefined || persistOnDiscover !== undefined) {
            try {
              const { normalizeContentExpiry } = await import('@par-noir/aggregator-domain');
              const expiry = normalizeContentExpiry({
                expiresAt,
                ttlSeconds,
                persistOnDiscover: persistOnDiscover === true
              });
              initialMetadata.expiresAt = expiry.expiresAt;
              initialMetadata.persistOnDiscover = expiry.persistOnDiscover;
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Invalid content expiry';
              const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'invalid_expiry';
              return res.status(400).json({
                error: code,
                error_description: message
              });
            }
          }

          // Submit initial metadata - ONLY for public files
          // Private files should NOT be in the database (they only exist in Google Drive + companion metadata)
          if (initialMetadata.isPublic === true) {
            try {
              const { validatePublicFeedPreviewRefs } = await import('./feedPreviewClientRedact');
              const previewCheck = validatePublicFeedPreviewRefs(initialMetadata);
              if (!previewCheck.ok) {
                return res.status(400).json({
                  error: previewCheck.error,
                  error_description: 'Public visual media requires CDN feed preview refs',
                });
              }
              // Repeat infringer: block making new content public
              const { isRepeatInfringer } = await import('./repeatInfringerService');
              if (await isRepeatInfringer(userIdentifier)) {
                return res.status(403).json({
                  error: 'Account restricted',
                  message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
                });
              }
              const { runPublishModeration, respondPublishModeration } = await import('./publishModeration');
              const moderation = await runPublishModeration({
                ownerPnIdentifier: userIdentifier,
                fileId,
                metadata: { ...initialMetadata, mimeType: driveFile.mimeType },
              });
              if (respondPublishModeration(res, moderation)) return;
              if (moderation.status === 'ok' && moderation.forceNsfw) {
                (initialMetadata as any).isNSFW = true;
              }
              dmcaCheckedThisRequest = true;
              // CRITICAL: Pass ownerDid for ownership verification if isPublic is being set
              await service.submitMetadata(initialMetadata, tokenPayload.pnIdentifier, tokenPayload.did || tokenPayload.pnIdentifier);
              aggregatorSubmittedThisRequest = true;
              console.log(`[MetadataIndex] Created metadata entry for ${fileId} (Sheets index deferred to companion metadata block)`);
            } catch (submitError: any) {
              console.error(`[MetadataIndex] Failed to submit initial metadata for ${fileId}:`, submitError);
              console.error(`[MetadataIndex] Submit error details:`, {
                message: submitError?.message,
                stack: submitError?.stack,
                metadata: initialMetadata,
                pnIdentifier: tokenPayload.pnIdentifier,
                ownerDid: tokenPayload.did || tokenPayload.pnIdentifier
              });
              throw submitError; // Re-throw to be caught by outer catch
            }
          } else {
            console.log(`[MetadataIndex] File ${fileId} is private - skipping database submission (private files only exist in Google Drive + companion metadata)`);
          }
        } catch (driveError: any) {
          console.error(`[MetadataIndex] Failed to fetch file info for ${fileId}:`, driveError);
          // Continue anyway - create entry with minimal info
          // IMPORTANT: Default isPublic to true for text posts, false for other files
          const defaultIsPublic = (textPost || thought) ? true : false;
          // Determine fileType using centralized utility (handles collection, textPost, thought)
          const determinedFileType = determineFileType({
            fileType,
            collection,
            textPost,
            thought,
            isNoteThumbnail,
            isPartOfCollection
          });
          const createIsPublic = isPublic !== undefined ? isPublic : defaultIsPublic;
          {
            const { validatePublicRowShareFields, rejectUnsafePublicContentRefWrite } = await import('./publicRowGuard');
            const publicGuardFailure = validatePublicRowShareFields({
              isPublic: createIsPublic === true,
              publicToken,
              publicContentRef,
            });
            if (publicGuardFailure) {
              return res.status(400).json(publicGuardFailure);
            }
            if (await rejectUnsafePublicContentRefWrite(res, publicContentRef)) return;
          }
          const minimalMetadata: any = {
            fileId: fileId,
            backendFileId: fileId,
            backend: 'google_drive',
            name: name || fileId,
            ...(title && { title }),
            fileType: determinedFileType,
            uploadDate: new Date().toISOString(),
            isPublic: createIsPublic,
            ...(publicToken && { publicToken }),
            ...(publicContentRef && { publicContentRef }),
            ...(feedPoster !== undefined && { feedPoster }),
            ...(feedPreviewSd !== undefined && { feedPreviewSd }),
            ...(feedPreviewHd !== undefined && { feedPreviewHd }),
            ...(textPost && { textPost }),
            ...(thought && { thought }),
            ...(collection && { collection }), // Include collection data if provided
            ...(isNSFW !== undefined && { isNSFW: isNSFW === true }),
            ...(isNoteThumbnail !== undefined && { isNoteThumbnail }), // Thumbnails inherit classification from source
            ...(isPartOfCollection !== undefined && { isPartOfCollection }), // Collection files inherit collection classification
            ...(mainFileId && { mainFileId }), // Reference to source file for thumbnails
            ...(thumbnailFileId && { thumbnailFileId }), // Reference to thumbnail file
            ...(isEncrypted !== undefined && { isEncrypted }),
            "@context": ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
            "@id": `https://parnoir.com/resource/${fileId}`,
            engagement: {
              views: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              lastUpdated: new Date().toISOString()
            },
            ...((await import('./penIndexFields')).penIndexFields(req.body))
          };
          // Submit minimal metadata - ONLY for public files
          // Private files should NOT be in the database (they only exist in Google Drive + companion metadata)
          if (minimalMetadata.isPublic === true) {
            try {
              const { validatePublicFeedPreviewRefs } = await import('./feedPreviewClientRedact');
              const previewCheck = validatePublicFeedPreviewRefs(minimalMetadata);
              if (!previewCheck.ok) {
                return res.status(400).json({
                  error: previewCheck.error,
                  error_description: 'Public visual media requires CDN feed preview refs',
                });
              }
              const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
              // Repeat infringer (timeout), publish safety, DMCA gate - same as initial-metadata path
              const { isRepeatInfringer } = await import('./repeatInfringerService');
              if (await isRepeatInfringer(userIdentifier)) {
                return res.status(403).json({
                  error: 'Account restricted',
                  message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
                });
              }
              const { runPublishModeration, respondPublishModeration } = await import('./publishModeration');
              const moderation = await runPublishModeration({
                ownerPnIdentifier: userIdentifier,
                fileId,
                metadata: minimalMetadata,
              });
              if (respondPublishModeration(res, moderation)) return;
              if (moderation.status === 'ok' && moderation.forceNsfw) {
                (minimalMetadata as any).isNSFW = true;
              }
              dmcaCheckedThisRequest = true;
              // CRITICAL: Pass ownerDid for ownership verification if isPublic is being set
              await service.submitMetadata(minimalMetadata, tokenPayload.pnIdentifier, tokenPayload.did || tokenPayload.pnIdentifier);
              aggregatorSubmittedThisRequest = true;
              console.log(`[MetadataIndex] Created minimal metadata entry for ${fileId} (Sheets index deferred to companion metadata block)`);
            } catch (minimalSubmitError: any) {
              console.error(`[MetadataIndex] Failed to submit minimal metadata for ${fileId}:`, minimalSubmitError);
              console.error(`[MetadataIndex] Minimal submit error details:`, {
                message: minimalSubmitError?.message,
                stack: minimalSubmitError?.stack,
                metadata: minimalMetadata
              });
              // Don't throw - we'll check if entry exists after and handle accordingly
              // But log extensively so we can debug
            }
          } else {
            console.log(`[MetadataIndex] File ${fileId} is private (minimal) - skipping database submission (private files only exist in Google Drive + companion metadata)`);
          }
        }
      }

      // Refetch to ensure entry exists (in case it was just created)
      // BUT: Private files should NOT be in the database, so skip refetch for private files
      // Determine if file is private by checking isPublic with defaults
      const defaultIsPublicForRefetch = (textPost || thought) ? true : false;
      const actualIsPublicForRefetch = isPublic !== undefined ? isPublic : defaultIsPublicForRefetch;
      
      if (actualIsPublicForRefetch === true) {
        // Only refetch for public files (or files being made public)
        // Add a small delay for database consistency if this was a new file
        if (!fileExistedBefore) {
          // Small delay to allow database transaction to commit
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        current = await service.getFileMetadata(fileId);
        console.log(`[MetadataIndex PUT] After upsert, refetch for ${fileId}: ${current ? 'found' : 'not found'}, existedBefore: ${fileExistedBefore}`);
        
        // If still not found after delay, try one more time
        if (!current && !fileExistedBefore) {
          await new Promise(resolve => setTimeout(resolve, 200));
          current = await service.getFileMetadata(fileId);
          console.log(`[MetadataIndex PUT] Second refetch attempt for ${fileId}: ${current ? 'found' : 'not found'}`);
        }
        
        if (!current) {
          console.error(`[MetadataIndex PUT] Failed to create/find metadata entry for ${fileId}`);
          console.error(`[MetadataIndex PUT] Debug info:`, {
            fileId,
            fileExistedBefore,
            requestBody: {
              name,
              fileType,
              isPublic,
              mainFileId,
              isNoteThumbnail,
              hasTextPost: !!textPost,
              hasThought: !!thought
            }
          });
          
          // If this was a new file creation that failed, try to provide more helpful error
          if (!fileExistedBefore) {
            return res.status(500).json({ 
              error: 'Failed to create metadata entry',
              message: 'Metadata creation appeared to succeed but entry was not found in database. This may be a database consistency issue.',
              fileId
            });
          }
          
          return res.status(404).json({ error: 'File not found in index' });
        }
      } else {
        // Private file - should not be in database, so don't refetch
        console.log(`[MetadataIndex PUT] File ${fileId} is private - skipping database refetch (private files only exist in Google Drive + companion metadata)`);
        current = null; // Ensure current is null for private files
      }

      // Visibility not sent: keep the stored value. Companion metadata lives on the device.
      let finalIsPublic = isPublic;
      if (isPublic === undefined && current && fileExistedBefore) {
        finalIsPublic = current.metadata.isPublic;
      }

      // #region agent log
      // #endregion

      // CRITICAL: OWNERSHIP VERIFICATION - Only owner can update metadata
      if (current) {
        const fileOwnerDid = current.metadata.creator?.identifier?.value || 
                           current.metadata.creator?.["@id"] || 
                           current.metadata.author?.did ||
                           current.pnIdentifier;
        const requestingUserDid = tokenPayload.pnIdentifier || tokenPayload.did;
        
        if (fileOwnerDid !== requestingUserDid && current.pnIdentifier !== requestingUserDid) {
          console.error(`[MetadataIndex PUT] UNAUTHORIZED: Attempt to update metadata for file ${fileId} by non-owner. Owner: ${fileOwnerDid}, Requesting: ${requestingUserDid}`);
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Only the file owner can update metadata'
          });
        }
      }

      // Determine fileType using centralized utility (auto-sets collection fileType when collection data is provided)
      const determinedFileTypeForUpdate = determineFileType({
        fileType,
        collection,
        textPost,
        thought,
        isNoteThumbnail,
        isPartOfCollection
      });

      // Use actualFileId (resolved to thumbnail if fileId was main file)
      {
        const effectiveIsPublic =
          finalIsPublic !== undefined ? finalIsPublic : isPublic;
        if (effectiveIsPublic === true) {
          const existingMeta = current?.metadata as
            | { publicToken?: unknown; publicContentRef?: unknown }
            | undefined;
          const { validatePublicRowShareFields, rejectUnsafePublicContentRefWrite } = await import('./publicRowGuard');
          const publicGuardFailure = validatePublicRowShareFields({
            isPublic: true,
            publicToken:
              publicToken !== undefined ? publicToken : existingMeta?.publicToken,
            publicContentRef:
              publicContentRef !== undefined
                ? publicContentRef
                : existingMeta?.publicContentRef,
          });
          if (publicGuardFailure) {
            return res.status(400).json(publicGuardFailure);
          }
          const refToCheck =
            publicContentRef !== undefined
              ? publicContentRef
              : existingMeta?.publicContentRef;
          if (await rejectUnsafePublicContentRefWrite(res, refToCheck)) return;
        }
      }
      if (
        publicContentRef != null &&
        typeof publicContentRef === 'object'
      ) {
        const { rejectUnsafePublicContentRefWrite } = await import('./publicRowGuard');
        if (await rejectUnsafePublicContentRefWrite(res, publicContentRef)) return;
      }

      {
        const existingMeta = current?.metadata as Record<string, unknown> | undefined;
        const willBePublic =
          (finalIsPublic !== undefined ? finalIsPublic : isPublic) === true ||
          ((finalIsPublic === undefined && isPublic === undefined) &&
            (existingMeta?.isPublic === true || existingMeta?.isPublic === 'true'));
        if (willBePublic) {
          const { validatePublicFeedPreviewRefs } = await import('./feedPreviewClientRedact');
          const previewCheck = validatePublicFeedPreviewRefs({
            isPublic: true,
            fileType: determinedFileTypeForUpdate || (existingMeta?.fileType as string),
            name: name || (existingMeta?.name as string),
            title: title || (existingMeta?.title as string),
            feedPoster: feedPoster !== undefined ? feedPoster : existingMeta?.feedPoster,
            feedPreviewSd: feedPreviewSd !== undefined ? feedPreviewSd : existingMeta?.feedPreviewSd,
            feedPreviewHd: feedPreviewHd !== undefined ? feedPreviewHd : existingMeta?.feedPreviewHd,
          });
          if (!previewCheck.ok) {
            return res.status(400).json({
              error: previewCheck.error,
              error_description: 'Public visual media requires CDN feed preview refs',
            });
          }
        }
      }

      let normalizedExpiry: { expiresAt?: string | null; persistOnDiscover?: boolean } | undefined;
      const expiryClockTouched = expiresAt !== undefined || ttlSeconds !== undefined;
      const persistTouched = persistOnDiscover !== undefined;
      if (expiryClockTouched || persistTouched) {
        try {
          normalizedExpiry = {};
          if (expiryClockTouched) {
            const { normalizeContentExpiry } = await import('@par-noir/aggregator-domain');
            const expiry = normalizeContentExpiry({
              expiresAt,
              ttlSeconds,
              persistOnDiscover: persistOnDiscover === true ? true : persistOnDiscover === false ? false : undefined
            });
            normalizedExpiry.expiresAt = expiry.expiresAt;
            if (persistTouched) {
              normalizedExpiry.persistOnDiscover = expiry.persistOnDiscover;
            }
          } else if (persistTouched) {
            normalizedExpiry.persistOnDiscover = persistOnDiscover === true;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid content expiry';
          const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'invalid_expiry';
          return res.status(400).json({
            error: code,
            error_description: message
          });
        }
      }

      const updated = await service.updateMetadata(actualFileId, {
        name,
        title,
        description,
        keywords: keywords || tags,
        tags: tags || keywords,
        genre,
        category,
        locationCreated,
        license,
        inLanguage,
        fileType: determinedFileTypeForUpdate,
        textPost,
        thought,
        collection, // Include collection data if provided
        isNSFW,
        // Only update isPublic if we have a value (either from request or companion metadata)
        // If undefined, updateMetadata will preserve existing value
        isPublic: finalIsPublic !== undefined ? finalIsPublic : isPublic,
        publicToken, // Include publicToken from request body (null = delete, undefined = preserve)
        publicContentRef, // null = delete, undefined = preserve
        feedPoster,
        feedPreviewSd,
        feedPreviewHd,
        subjects,
        feedCategories,
        thumbnailFileId,
        isNoteThumbnail, // Thumbnails inherit classification from source
        isPartOfCollection, // Collection files inherit collection classification
        mainFileId, // Reference to source file for thumbnails
        ...(normalizedExpiry?.expiresAt !== undefined
          ? { expiresAt: normalizedExpiry.expiresAt }
          : {}),
        ...(normalizedExpiry?.persistOnDiscover !== undefined
          ? { persistOnDiscover: normalizedExpiry.persistOnDiscover }
          : {}),
        provenance: (await import('./penIndexFields')).penIndexFields(req.body),
        ...(penPostUpdateClearKeys ? { clearKeys: penPostUpdateClearKeys } : {})
      });

      if (penPostUpdate && supersededPreviewR2Keys.length) {
        try {
          const { feedR2Delete } = await import('./feedPreviewR2');
          for (const key of supersededPreviewR2Keys) {
            await feedR2Delete(key).catch(() => undefined);
          }
        } catch {
          /* non-critical — stale R2 keys are evicted later */
        }
      }

      // Track if we successfully deleted the file (so we can return success even if file no longer exists)
      let fileWasDeleted = false;

      // If isPublic === false AND file existed before (was public), DELETE from public tables AFTER updating metadata
      // This ensures the file is completely removed from feeds when changing from public to private
      // BUT: Don't delete new files that are created as private - they should stay in the database
      // (only not appear in public feeds/indexes)
      if (isPublic === false && fileExistedBefore) {
        try {
          const removed = await service.removeMetadata(actualFileId);
          if (removed) {
            fileWasDeleted = true;
            console.log(`✅ [MetadataIndex PUT] Deleted file ${actualFileId} from public tables (isPublic: false)`);
            
            // Verify deletion
            const verifyDeleted = await service.getFileMetadata(actualFileId);
            if (verifyDeleted) {
              console.error(`❌ [MetadataIndex PUT] CRITICAL: File ${actualFileId} still exists after deletion!`);
            } else {
              console.log(`✅ [MetadataIndex PUT] Verified: File ${actualFileId} removed from database`);
            }
            
            // Invalidate cache immediately
            try {
              const { invalidateIndexCache } = await import('../utils/cache');
              await invalidateIndexCache();
              console.log(`✅ [MetadataIndex PUT] Cache invalidated after deletion`);
            } catch (cacheError: any) {
              console.warn(`⚠️ [MetadataIndex PUT] Cache invalidation failed:`, cacheError?.message);
            }
          } else {
            console.warn(`⚠️ [MetadataIndex PUT] File ${actualFileId} not found in database to delete`);
          }
        } catch (deleteError: any) {
          console.error(`❌ [MetadataIndex PUT] Failed to delete file ${actualFileId}:`, deleteError?.message || deleteError);
          // Continue - companion metadata will still be updated
        }
      }

      // Refetch current after updateMetadata() to get latest state (or null if deleted)
      current = await service.getFileMetadata(actualFileId);

      // CRITICAL: Submit metadata to aggregator service so it appears in feeds
      // Only for private→public transitions on existing files (creation path already submitted)
      if (isPublic === true && current && fileExistedBefore && !aggregatorSubmittedThisRequest) {
        try {
          // Get token payload for submitMetadata
          {
            const submitTokenPayload = getBearerTokenPayload(req);
            if (submitTokenPayload) {
              // Determine fileType and contentClass from current metadata
              const metadataForType = (current.metadata || {}) as any;
              const determinedFileType = determineFileType({
                fileType: metadataForType.fileType,
                collection: metadataForType.collection,
                textPost: metadataForType.textPost,
                thought: metadataForType.thought,
                mimeType: metadataForType.mimeType,
                isNoteThumbnail: metadataForType.isNoteThumbnail,
                isPartOfCollection: metadataForType.isPartOfCollection
              });
              const determinedContentClass = determineContentClass({
                fileType: determinedFileType,
                collection: metadataForType.collection,
                textPost: metadataForType.textPost,
                thought: metadataForType.thought,
                isNoteThumbnail: metadataForType.isNoteThumbnail,
                isPartOfCollection: metadataForType.isPartOfCollection
              });
              
              const publicMetadata = {
                ...current.metadata,
                isPublic: true,
                fileId: current.metadata.fileId || actualFileId,
                // Ensure required fields are present
                backend: current.metadata.backend || 'google_drive',
                backendFileId: current.metadata.backendFileId || actualFileId,
                name: current.metadata.name || current.metadata.title || actualFileId,
                uploadDate: current.metadata.uploadDate || new Date().toISOString(),
                fileType: determinedFileType,
                contentClass: determinedContentClass,
                thumbnailFileId: metadataForType.thumbnailFileId
              };

              // Repeat infringer: block making new content public
              const ownerPn = String(submitTokenPayload.pnIdentifier ?? '');
              const { isRepeatInfringer } = await import('./repeatInfringerService');
              if (await isRepeatInfringer(ownerPn)) {
                return res.status(403).json({
                  error: 'Account restricted',
                  message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
                });
              }
              const { runPublishModeration, respondPublishModeration } = await import('./publishModeration');
              const moderation = await runPublishModeration({
                ownerPnIdentifier: ownerPn,
                fileId,
                metadata: publicMetadata as any,
              });
              if (respondPublishModeration(res, moderation)) return;
              if (moderation.status === 'ok' && moderation.forceNsfw) {
                (publicMetadata as any).isNSFW = true;
              }
              await service.submitMetadata(
                publicMetadata as any,
                submitTokenPayload.pnIdentifier,
                submitTokenPayload.did || submitTokenPayload.pnIdentifier
              );
              aggregatorSubmittedThisRequest = true;
              console.log(`[MetadataIndex PUT] Submitted metadata to aggregator for public file ${actualFileId}`);
            }
          }
        } catch (submitError: any) {
          console.error(`[MetadataIndex PUT] Failed to submit metadata to aggregator:`, submitError?.message || submitError);
          // Don't fail the request - metadata is updated, just not in aggregator yet
        }
      }
      

      // Handle isTopPost update
      if (isTopPost !== undefined) {
        current = await service.getFileMetadata(fileId);
        if (current) {
          // Get the file owner's pnIdentifier
          const ownerPnIdentifier = current.pnIdentifier || 
                                   current.metadata?.creator?.identifier?.value ||
                                   current.metadata?.author?.did;
          
          if (ownerPnIdentifier && isTopPost === true) {
            // If setting this file as top post, unset any other top posts by the same user
            const db = (await import('../utils/database')).getDatabasePool();
            
            // Find all files by this owner that have isTopPost: true
            const otherTopPostsResult = await db.query(`
              SELECT file_id, metadata
              FROM aggregator_metadata
              WHERE file_id != $1
                AND pn_identifier = $2
                AND metadata->>'isTopPost' = 'true'
            `, [fileId, ownerPnIdentifier]);
            
            // Unset isTopPost for all other files by this owner
            for (const row of otherTopPostsResult.rows) {
              const otherMetadata = typeof row.metadata === 'string' 
                ? JSON.parse(row.metadata) 
                : row.metadata;
              const updatedOtherMetadata = {
                ...otherMetadata,
                isTopPost: false
              };
              await db.query(
                `UPDATE aggregator_metadata 
                 SET metadata = $1, updated_at = NOW()
                 WHERE file_id = $2`,
                [JSON.stringify(updatedOtherMetadata), row.file_id]
              );
              console.log(`[MetadataIndex PUT] Unset isTopPost for file ${row.file_id} (owner: ${ownerPnIdentifier})`);
            }
          }
          
          // Update current file's isTopPost
          const updatedMetadata = {
            ...current.metadata,
            isTopPost: isTopPost
          };
          const db = (await import('../utils/database')).getDatabasePool();
          await db.query(
            `UPDATE aggregator_metadata 
             SET metadata = $1, updated_at = NOW()
             WHERE file_id = $2`,
            [JSON.stringify(updatedMetadata), fileId]
          );
          console.log(`[MetadataIndex PUT] Set isTopPost=${isTopPost} for file ${fileId}`);
          
          // Refetch after isTopPost update
          current = await service.getFileMetadata(fileId);
        }
      }

      // Return the updated metadata (or current if updateMetadata returned null)
      // If file was deleted (made private), return success even if file no longer exists in database
      const result = updated || current;
      
      // For new private files, return success even though they're not in database
      // Private files are only stored in Google Drive + companion metadata, not in the aggregator database
      const isNewPrivateFile = !fileExistedBefore && actualIsPublicForRefetch === false;
      if (isNewPrivateFile && !result && !fileWasDeleted) {
        // Return success - private files are only in Google Drive + companion metadata
        return res.json({ 
          success: true, 
          metadata: null, 
          private: true,
          message: 'Private file metadata created successfully (stored in Google Drive only)'
        });
      }
      
      if (!result && !fileWasDeleted) {
        return res.status(404).json({ error: 'File not found in index' });
      }

      // If file was deleted, return success with the metadata we had before deletion
      if (fileWasDeleted && !result) {
        return res.json({ success: true, metadata: updated || null, deleted: true });
      }

      if (result && !fileWasDeleted) {
        const { indexContentCredentials } = await import('./c2paIndex');
        const row = result as any;
        await indexContentCredentials(
          service,
          {
            fileId: actualFileId,
            metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : row,
            pnIdentifier: row.pnIdentifier ?? current?.pnIdentifier
          },
          tokenPayload.pnIdentifier
        );
      }

      console.log(
        `[MetadataIndex PUT] Completed for ${fileId} in ${Date.now() - putStartedAt}ms`
      );
      const { redactFeedPreviewFieldsInMetadata } = await import('./feedPreviewClientRedact');
      const resultMeta =
        result && typeof result === 'object' && 'metadata' in (result as any)
          ? {
              ...(result as any),
              metadata: redactFeedPreviewFieldsInMetadata(
                ((result as any).metadata || {}) as Record<string, unknown>
              ),
            }
          : result && typeof result === 'object'
            ? redactFeedPreviewFieldsInMetadata(result as unknown as Record<string, unknown>)
            : result;
      return res.json({ success: true, metadata: resultMeta });
    } catch (error: any) {
      console.error('Error updating metadata:', error);
      return res.status(500).json({ 
        error: 'Failed to update metadata',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // GET /api/aggregator/subjects/popular - Get popular subjects
  app.get('/api/aggregator/subjects/popular', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const db = (await import('../utils/database')).getDatabasePool();
      
      // Query all metadata and extract subjects, count frequency
      const result = await db.query(`
        SELECT metadata->>'subjects' as subjects
        FROM aggregator_metadata
        WHERE metadata->>'subjects' IS NOT NULL
          AND metadata->>'isPublic' = 'true'
      `);
      
      const subjectCounts = new Map<string, number>();
      
      result.rows.forEach(row => {
        if (row.subjects) {
          try {
            const subjects = JSON.parse(row.subjects);
            if (Array.isArray(subjects)) {
              subjects.forEach((subject: string) => {
                const normalized = subject.toLowerCase().trim();
                if (normalized) {
                  subjectCounts.set(normalized, (subjectCounts.get(normalized) || 0) + 1);
                }
              });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });
      
      // Sort by count and return top N
      const popular = Array.from(subjectCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([subject]) => subject);
      
      return res.json({ subjects: popular });
    } catch (error: any) {
      console.error('Error fetching popular subjects:', error);
      return res.status(500).json({ error: 'Failed to fetch popular subjects' });
    }
  });

  // GET /api/aggregator/subjects/search - Search subjects
  app.get('/api/aggregator/subjects/search', async (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string)?.toLowerCase().trim() || '';
      if (!query) {
        return res.json({ subjects: [] });
      }
      
      const db = (await import('../utils/database')).getDatabasePool();
      
      // Query all metadata and extract subjects
      const result = await db.query(`
        SELECT metadata->>'subjects' as subjects
        FROM aggregator_metadata
        WHERE metadata->>'subjects' IS NOT NULL
          AND metadata->>'isPublic' = 'true'
      `);
      
      const matchingSubjects = new Set<string>();
      
      result.rows.forEach(row => {
        if (row.subjects) {
          try {
            const subjects = JSON.parse(row.subjects);
            if (Array.isArray(subjects)) {
              subjects.forEach((subject: string) => {
                const normalized = subject.toLowerCase().trim();
                if (normalized.includes(query)) {
                  matchingSubjects.add(normalized);
                }
              });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });
      
      return res.json({ subjects: Array.from(matchingSubjects).slice(0, 20) });
    } catch (error: any) {
      console.error('Error searching subjects:', error);
      return res.status(500).json({ error: 'Failed to search subjects' });
    }
  });

  // GET /api/aggregator/subjects/by-category - Get subjects by category
  app.get('/api/aggregator/subjects/by-category', async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string;
      if (!category) {
        return res.json({ subjects: [] });
      }
      
      const db = (await import('../utils/database')).getDatabasePool();
      
      // Query metadata with specific category
      const result = await db.query(`
        SELECT metadata->>'subjects' as subjects
        FROM aggregator_metadata
        WHERE metadata->'feedCategories' @> $1::jsonb
          AND metadata->>'isPublic' = 'true'
          AND metadata->>'subjects' IS NOT NULL
      `, [JSON.stringify([category])]);
      
      const subjectCounts = new Map<string, number>();
      
      result.rows.forEach(row => {
        if (row.subjects) {
          try {
            const subjects = JSON.parse(row.subjects);
            if (Array.isArray(subjects)) {
              subjects.forEach((subject: string) => {
                const normalized = subject.toLowerCase().trim();
                if (normalized) {
                  subjectCounts.set(normalized, (subjectCounts.get(normalized) || 0) + 1);
                }
              });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });
      
      // Sort by count and return
      const subjects = Array.from(subjectCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([subject]) => subject)
        .slice(0, 30);
      
      return res.json({ subjects });
    } catch (error: any) {
      console.error('Error fetching subjects by category:', error);
      return res.status(500).json({ error: 'Failed to fetch subjects by category' });
    }
  });

  // POST /api/aggregator/subjects/normalize - Normalize and check for similar subjects
  app.post('/api/aggregator/subjects/normalize', async (req: Request, res: Response) => {
    try {
      const { subject } = req.body;
      if (!subject || typeof subject !== 'string') {
        return res.status(400).json({ error: 'Subject is required' });
      }
      
      const db = (await import('../utils/database')).getDatabasePool();
      
      // Get all existing subjects
      const result = await db.query(`
        SELECT DISTINCT jsonb_array_elements_text(metadata->'subjects') as subject
        FROM aggregator_metadata
        WHERE metadata->>'subjects' IS NOT NULL
          AND metadata->>'isPublic' = 'true'
      `);
      
      const existingSubjects = result.rows.map(r => r.subject.toLowerCase().trim()).filter(Boolean);
      const normalized = subject.toLowerCase().trim();
      
      // Simple similarity check (exact match or contains)
      const similar = existingSubjects.find(existing => {
        return existing === normalized || 
               existing.includes(normalized) || 
               normalized.includes(existing);
      });
      
      return res.json({
        normalized,
        similar: similar || null,
        isNew: !similar
      });
    } catch (error: any) {
      console.error('Error normalizing subject:', error);
      return res.status(500).json({ error: 'Failed to normalize subject' });
    }
  });

  // POST /api/aggregator/engagement/:fileId/:type - Update engagement metrics
  app.post('/api/aggregator/engagement/:fileId/:type', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const { fileId, type } = req.params;
      const { userPnIdentifier } = req.body;

      if (!fileId) {
        return res.status(400).json({ error: 'Missing fileId parameter' });
      }

      if (!['like', 'view', 'share', 'comment'].includes(type)) {
        return res.status(400).json({ error: 'Invalid engagement type. Must be: like, view, share, or comment' });
      }

      const updated = await service.updateEngagement(
        fileId,
        type as 'like' | 'view' | 'share' | 'comment',
        userPnIdentifier
      );

      if (!updated) {
        return res.status(404).json({ error: 'File not found in index' });
      }

      return res.json({ 
        success: true, 
        engagement: updated.engagement,
        metadata: updated
      });
    } catch (error: any) {
      console.error('Error updating engagement:', error);
      return res.status(500).json({ 
        error: 'Failed to update engagement',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  app.get('/api/aggregator/curated/:did', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      const { did } = req.params;

      if (!did) {
        return res.status(400).json({ error: 'Missing DID parameter' });
      }

      const entries = await service.getCuratedFeed(did);

      return res.json({
        did,
        files: entries,
        totalFiles: entries.length,
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error getting curated feed:', error);
      return res.status(500).json({ 
        error: 'Failed to get curated feed',
        message: safeClientErrorMessage(error, NODE_ENV === 'production') 
      });
    }
  });

  // POST /api/aggregator/metadata-index/sync - Public cache reconcile (admin)
  app.post('/api/aggregator/metadata-index/sync', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const { runReconcilePublicAggregator } = await import('../jobs/reconcilePublicAggregatorJob');
      const reconcile = await runReconcilePublicAggregator();
      return res.json({ success: true, reconcile });
    } catch (error: any) {
      return res.status(500).json({
        error: 'Sync failed',
        message: safeClientErrorMessage(error, NODE_ENV === 'production')
      });
    }
  });

}
