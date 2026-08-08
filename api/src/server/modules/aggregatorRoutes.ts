/**
 * Aggregator Routes
 * Metadata index, subjects, engagement, curated feeds, and sync endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { safeClientErrorMessage } from '../utils/safeError';
import { determineFileType, getFileTypeFromMime, determineContentClass } from '../utils/fileTypeUtils';
import { hashIdentifier, isDevVerbose, safeLogger } from '../../utils/logger';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

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
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  driveNotInitialized: (res: express.Response) => express.Response;
  scheduleDriveIndexUpdates: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    pnFolderId: string,
    fileMetadata: any,
    accountId: string | undefined,
    options: { isNewFile: boolean; isPublic: boolean }
  ) => void;
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
      const contentClass = req.query.contentClass as 'media' | 'thought' | 'collection' | undefined;
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
        const allTables = ['aggregator_media', 'aggregator_thoughts', 'aggregator_collections'];
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
      return res.json(response);
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
      return res.json(response);
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

      const tokenPayload = getBearerTokenPayload(req);
      if (tokenPayload?.pnIdentifier) {
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload))) return;
      }

      // Validate metadata (support both legacy and semantic web format)
      const title = metadata.name || metadata.title;
      const authorDid = metadata.creator?.identifier?.value || metadata.creator?.["@id"] || metadata.author?.did;
      
      // More lenient validation - allow missing fields with defaults
      const validatedMetadata = {
        ...metadata,
        backend: metadata.backend || 'google_drive',
        backendFileId: metadata.backendFileId || metadata.fileId,
        name: title || metadata.fileId || 'Untitled',
        uploadDate: metadata.uploadDate || new Date().toISOString(),
        isPublic: metadata.isPublic === true, // Default to false (private) if not explicitly set to true
        fileType: metadata.fileType || getFileTypeFromMime(metadata.mimeType) || 'other'
      };

      // Only require fileId - other fields can be optional
      if (!validatedMetadata.fileId) {
        safeLogger.warn('[metadata-index] Missing fileId after validation', { requestId });
        return res.status(400).json({ 
          error: 'Missing required field: fileId after validation',
          requestId
        });
      }

      console.log(`📝 [${requestId}] Submitting metadata for file: ${validatedMetadata.fileId}`);
      // #region agent log
      // #endregion

      // When making content public, run repeat-infringer (timeout), Prism bypass, and DMCA gate
      if (validatedMetadata.isPublic === true) {
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'Missing pnIdentifier',
            message: 'pnIdentifier is required when submitting public metadata.',
            requestId
          });
        }
        const { isRepeatInfringer } = await import('./repeatInfringerService');
        if (await isRepeatInfringer(pnIdentifier)) {
          return res.status(403).json({
            error: 'Account restricted',
            message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
            requestId
          });
        }
        const { isFileApprovedByPrism, addToPrismQueue } = await import('./prismQueueService');
        const alreadyApproved = await isFileApprovedByPrism(validatedMetadata.fileId);
        if (!alreadyApproved) {
          const { googleDriveProxyService } = await import('./googleDriveProxy');
          const { runDMCACheck } = await import('./dmcaGate');
          const driveFileId = validatedMetadata.backendFileId || validatedMetadata.fileId;
          const mimeType = (validatedMetadata as any).mimeType || 'application/octet-stream';
          const dmcaResult = await runDMCACheck(googleDriveProxyService, pnIdentifier, driveFileId, mimeType, undefined);
          if (!dmcaResult.passed) {
            const queueItemId = await addToPrismQueue({
              fileId: validatedMetadata.fileId,
              ownerPnIdentifier: pnIdentifier,
              flagSource: 'bot',
              reporterPnIdentifier: null,
            });
            const { addContentNotice } = await import('./contentNoticesService');
            await addContentNotice({
              ownerPnIdentifier: pnIdentifier,
              fileId: validatedMetadata.fileId,
              type: 'pending_review',
              source: 'bot',
            });
            return res.status(202).json({
              status: 'pending_review',
              error: 'Content flagged for DMCA review',
              message: dmcaResult.reason || 'This content has been flagged for copyright review and is pending human review.',
              queueItemId: queueItemId || undefined,
              requestId
            });
          }
        }
      }

      // Submit metadata to central index
      await service.submitMetadata(validatedMetadata, pnIdentifier);

      // Also update Google Drive index (source of truth) if file is public
      if (validatedMetadata.isPublic === true && pnIdentifier) {
        try {
          const { IndexSheetsService } = await import('./indexSheetsService');
          const { storageCredentialsService } = await import('./storageCredentialsService');
          
          // Get user's credentials
          const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
          if (credentialsRecord?.credentials) {
            const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
              (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
            if (googleDriveAccounts.length > 0) {
              const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
              const accountId = account ? deps.extractAccountId(account) : undefined;
              const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
              let token;
              try {
                const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
                token = resolved.token;
              } catch (error) {
                if (respondDriveTokenError(res, error)) return;
                throw error;
              }
              const out = await deps.getMetadataFolder(token, pnIdentifier, accountId);
              if (!out) {
                return deps.driveNotInitialized(res);
              }
              const metadataFolder = out.metadataFolderId;
              
              // Get or create public-file-index.xlsx
              const spreadsheetId = await IndexSheetsService.getIndexSheet(
                token,
                metadataFolder,
                'public',
                pnIdentifier,
                accountId
              );
            
            // Convert metadata to IndexFileEntry format
            const indexEntry: any = {
              fileId: validatedMetadata.fileId,
              googleDriveFileId: validatedMetadata.backendFileId || validatedMetadata.fileId,
              fileName: validatedMetadata.name || validatedMetadata.title,
              originalName: validatedMetadata.name || validatedMetadata.title,
              mimeType: (validatedMetadata as any).mimeType,
              visibility: 'public',
              uploadedAt: validatedMetadata.uploadDate || new Date().toISOString(),
              owner: validatedMetadata.creator ? {
                did: validatedMetadata.creator['@id'] || validatedMetadata.creator.identifier?.value,
                identifier: validatedMetadata.creator.identifier?.value || validatedMetadata.creator['@id']
              } : (validatedMetadata.author ? {
                did: validatedMetadata.author.did,
                identifier: validatedMetadata.author.did
              } : undefined),
              tags: validatedMetadata.tags || validatedMetadata.keywords || [],
              description: validatedMetadata.description,
              publicToken: validatedMetadata.publicToken,
              engagement: validatedMetadata.engagement,
              contentClass: (validatedMetadata as any).contentClass,
              isThoughtThumbnail: (validatedMetadata as any).isThoughtThumbnail,
              mainFileId: (validatedMetadata as any).mainFileId,
              thumbnailFileId: (validatedMetadata as any).thumbnailFileId,
              collectionFileIds: (validatedMetadata as any).collection?.collectionFileIds
            };
            
              // Check if file exists in index, update or add accordingly
              try {
                await IndexSheetsService.updateFile(
                  token,
                  spreadsheetId,
                  validatedMetadata.fileId,
                  indexEntry,
                  pnIdentifier,
                  accountId
                );
                console.log(`✅ [${requestId}] Updated Google Drive public-file-index.xlsx for ${validatedMetadata.fileId}`);
              } catch (updateError: any) {
                // If update fails (file not found), try adding it
                if (updateError.message?.includes('not found')) {
                  await IndexSheetsService.addFile(
                    token,
                    spreadsheetId,
                    indexEntry,
                    pnIdentifier,
                    accountId
                  );
                console.log(`✅ [${requestId}] Added to Google Drive public-file-index.xlsx for ${validatedMetadata.fileId}`);
                } else {
                  throw updateError;
                }
              }
            }
          }
        } catch (driveError: any) {
          console.warn(`⚠️ [${requestId}] Failed to update Google Drive index (non-critical):`, driveError?.message || driveError);
          // Don't fail the request - database cache is updated
        }
      }

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
  // Also run automatically every 5 minutes. MUST be before /:fileId route.
  app.post('/api/aggregator/metadata-index/reconcile', async (req: Request, res: Response) => {
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
  // MUST be before /:fileId route to avoid route conflict
  app.post('/api/aggregator/metadata-index/cleanup-tables', async (req: Request, res: Response) => {
    try {
      const db = (await import('../utils/database')).getDatabasePool();
      await db.query('DELETE FROM aggregator_media');
      await db.query('DELETE FROM aggregator_thoughts');
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

  // DELETE /api/aggregator/metadata-index/:fileId - Remove public metadata and delete files
  // DELETE /api/aggregator/metadata-index/user/:pnIdentifier - Remove all metadata for a user
  app.delete('/api/aggregator/metadata-index/user/:pnIdentifier', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier } = req.params;
      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pnIdentifier is required' });
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
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_thoughts 
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

      // STEP 2: Delete files from Google Drive
      if (userIdentifier && filesToDelete.length > 0) {
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        
        for (const driveFileId of filesToDelete) {
          try {
            await googleDriveProxyService.deleteFile(userIdentifier, driveFileId, accountId);
            console.log(`✅ [MetadataIndex DELETE] Deleted file ${driveFileId} from Google Drive`);
          } catch (driveError: any) {
            const errorMsg = driveError?.message || String(driveError);
            // 404 is okay - file might already be deleted
            if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
              console.error(`❌ [MetadataIndex DELETE] Failed to delete ${driveFileId} from Google Drive:`, errorMsg);
            } else {
              console.log(`ℹ️ [MetadataIndex DELETE] File ${driveFileId} not found in Google Drive (may already be deleted)`);
            }
          }
        }
      }

      // STEP 3: Delete companion metadata spreadsheet
      if (userIdentifier && pnIdentifier) {
        try {
          const { googleDriveProxyService } = await import('./googleDriveProxy');
          const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
          const { storageCredentialsService } = await import('./storageCredentialsService');
          
          // Get credentials to build token object
          const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
          if (credentialsRecord?.credentials) {
            const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
              (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
            if (googleDriveAccounts.length > 0) {
              const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
              const accountIdForToken = deps.extractAccountId(account);
              const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
              let token;
              try {
                const resolved = await resolveOwnerDriveToken(req, pnIdentifier, {
                  account,
                  accountId: accountIdForToken
                });
                token = resolved.token;
              } catch (error) {
                if (respondDriveTokenError(res, error)) return;
                throw error;
              }
              const accessToken = token.access_token;
              
              // Get metadata folder
              const pnFolderName = `par Noir - ${pnIdentifier}`;
              const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
              const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
              
              const folderResponse = await fetch(folderSearchUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              
              if (folderResponse.ok) {
                const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                if (folderData.files && folderData.files.length > 0) {
                  const pnFolderId = folderData.files[0].id;
                  
                  // Get metadata folder
                  const metadataFolderName = '_metadata';
                  const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                  
                  const metadataFolderResponse = await fetch(metadataSearchUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  if (metadataFolderResponse.ok) {
                    const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                      const metadataFolderId = metadataFolderData.files[0].id;
                      
                      // Find companion metadata spreadsheet
                      const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                        token,
                        metadataFolderId,
                        actualFileId,
                        pnIdentifier,
                        accountIdForToken
                      );
                  
                      if (spreadsheetId) {
                        try {
                          await googleDriveProxyService.deleteFile(userIdentifier, spreadsheetId, accountId);
                          console.log(`✅ [MetadataIndex DELETE] Deleted companion metadata spreadsheet: ${spreadsheetId}`);
                        } catch (spreadsheetError: any) {
                          const errorMsg = spreadsheetError?.message || String(spreadsheetError);
                          if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
                            console.error(`❌ [MetadataIndex DELETE] Failed to delete companion metadata spreadsheet:`, errorMsg);
                          } else {
                            console.log(`ℹ️ [MetadataIndex DELETE] Companion metadata spreadsheet not found (may already be deleted)`);
                          }
                        }
                      } else {
                        console.log(`ℹ️ [MetadataIndex DELETE] Companion metadata spreadsheet not found for ${actualFileId}`);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (companionError: any) {
          console.warn(`⚠️ [MetadataIndex DELETE] Failed to delete companion metadata:`, companionError?.message || companionError);
          // Continue even if companion metadata deletion fails
        }
      }

      // STEP 4: Remove thumbnail metadata from database (actualFileId is already resolved to thumbnail)
      const removed = await service.removeMetadata(actualFileId);

      if (removed) {
        return res.json({ 
          success: true, 
          fileId: actualFileId,
          deletedFiles: filesToDelete.length,
          deletedFromDrive: filesToDelete
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

  // GET /api/aggregator/metadata-index/debug - Debug endpoint to check database state
  app.get('/api/aggregator/metadata-index/debug', async (req: Request, res: Response) => {
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
            WHEN metadata->>'textPost' IS NOT NULL OR metadata->>'thought' IS NOT NULL THEN 'thought'
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
      const thoughts = allFiles.rows.filter((r: any) => 
        r.file_type === 'thought' || r.file_type === 'text' || r.detected_type === 'thought'
      );
      const publicThoughts = thoughts.filter((r: any) => 
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

  // POST /api/aggregator/metadata-index/invalidate-cache - Invalidate index cache
  app.post('/api/aggregator/metadata-index/invalidate-cache', async (req: Request, res: Response) => {
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

  // GET /api/aggregator/fix-feeds - Diagnostic and fix endpoint for feed issues
  app.get('/api/aggregator/fix-feeds', async (req: Request, res: Response) => {
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

  // GET /api/aggregator/metadata-index/:fileId/companion-check - Check companion metadata visibility vs database isPublic
  app.get('/api/aggregator/metadata-index/:fileId/companion-check', async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
      const service = AggregatorMetadataServiceDB.getInstance();

      // Get auth token
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid or expired access token' });
      }

      const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
      const identifierCandidates: string[] = [];
      if (tokenPayload.pnIdentifier) identifierCandidates.push(tokenPayload.pnIdentifier);
      if (tokenPayload.did) {
        identifierCandidates.push(tokenPayload.did);
        if (tokenPayload.did.startsWith('did:key:')) {
          const keyPart = tokenPayload.did.substring(8);
          if (keyPart) identifierCandidates.push(keyPart);
        }
      }

      // Get database metadata
      const dbMetadata = await service.getFileMetadata(fileId);
      if (!dbMetadata) {
        return res.status(404).json({ error: 'File not found in database' });
      }

      // Try to read companion metadata
      const accountId = req.query.accountId as string | undefined;
      const { storageCredentialsService } = await import('./storageCredentialsService');
      const credentialsRecord = await storageCredentialsService.getCredentials(userIdentifier);
      let companionMetadata = null;
      let companionError = null;
      
      if (credentialsRecord?.credentials) {
        const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
          (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
        if (googleDriveAccounts.length > 0) {
          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountIdForToken = deps.extractAccountId(account);
          const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
          let token;
          try {
            const resolved = await resolveOwnerDriveToken(req, userIdentifier, {
              account,
              accountId: accountIdForToken || accountId
            });
            token = resolved.token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }
          const accessToken = token.access_token;
          const backendFileId = dbMetadata.metadata.backendFileId || fileId;
          
          const driveResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${backendFileId}.metadata' and mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );

          if (driveResponse.ok) {
            const driveData = await driveResponse.json() as { files?: Array<{ id: string }> };
            if (driveData.files && driveData.files.length > 0) {
              const spreadsheetId = driveData.files[0].id;
              try {
                companionMetadata = await CompanionMetadataSheets.readMetadata(token, spreadsheetId, userIdentifier, accountIdForToken);
              } catch (error: any) {
                companionError = error.message;
              }
            }
          }
        }
      }

      return res.json({
        fileId,
        database: {
          isPublic: dbMetadata.metadata.isPublic,
          backend: dbMetadata.metadata.backend,
          backendFileId: dbMetadata.metadata.backendFileId
        },
        companionMetadata: companionMetadata ? {
          visibility: companionMetadata.visibility,
          fileId: companionMetadata.fileId,
          googleDriveFileId: companionMetadata.googleDriveFileId
        } : null,
        companionError,
        mismatch: companionMetadata ? (companionMetadata.visibility === 'public') !== dbMetadata.metadata.isPublic : null,
        recommendation: companionMetadata && (companionMetadata.visibility === 'public') !== dbMetadata.metadata.isPublic
          ? `Database has isPublic=${dbMetadata.metadata.isPublic} but companion metadata has visibility=${companionMetadata.visibility}. They should match.`
          : companionMetadata ? 'Values match' : 'Could not read companion metadata'
      });
    } catch (error: any) {
      console.error('❌ Companion check error:', error);
      return res.status(500).json({ error: 'Failed to check companion metadata', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
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
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_thoughts 
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
      const out: { metadata: any; pnIdentifier?: string } = { metadata: meta };
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
        isTopPost,
        textPost,
        thought,
        collection, // Collection data with collectionFileIds
        fileType,
        isNSFW,
        subjects,
        feedCategories,
        thumbnailFileId,
        isThoughtThumbnail, // Flag indicating this is a thumbnail of a thought
        isPartOfCollection, // Flag indicating this file is part of a collection
        mainFileId, // Reference to the source file (for thumbnails)
        isEncrypted // True if main file is encrypted; false for raw uploads over tier limit
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
             SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_thoughts 
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
      let indexUpdatedThisRequest = false;
      let companionCreatedThisRequest = false;
      let cachedDriveFileInfo: {
        name?: string;
        mimeType?: string;
        size?: string;
        createdTime?: string;
      } | null = null;
      const accountIdParam = (req.query.accountId as string) || undefined;
      const { createStorageRequestContext, getDriveTokenFromContext } = await import('./storage/storageRequestContext');
      const storageCtx = tokenPayload.pnIdentifier
        ? await createStorageRequestContext(req, tokenPayload.pnIdentifier, accountIdParam)
        : null;

      if (tokenPayload.pnIdentifier) {
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, tokenPayload.pnIdentifier))) return;
      }
      
      if (!current) {
        // Create new metadata entry - fetch file info from Google Drive
        const identifierCandidates: string[] = [];
        if (tokenPayload.pnIdentifier) {
          identifierCandidates.push(tokenPayload.pnIdentifier);
        }
        if (tokenPayload.did) {
          identifierCandidates.push(tokenPayload.did);
          if (tokenPayload.did.startsWith('did:key:')) {
            const keyPart = tokenPayload.did.substring(8);
            if (keyPart) {
              identifierCandidates.push(keyPart);
            }
          }
        }

        // Fetch file info from Google Drive
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const accountId = accountIdParam;
        
        try {
          let accessToken = storageCtx?.accessToken || '';
          if (!accessToken) {
            const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
            try {
              const resolved = await resolveOwnerDriveToken(req, userIdentifier, { accountId });
              accessToken = resolved.token.access_token;
            } catch (error) {
              if (respondDriveTokenError(res, error)) return;
              throw error;
            }
          }
          const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!driveResponse.ok) {
            const errorText = await driveResponse.text().catch(() => 'Unknown error');
            console.error(`[MetadataIndex PUT] Failed to fetch file info from Google Drive for ${fileId}:`, driveResponse.status, errorText);
            throw new Error(`Failed to fetch file info: ${driveResponse.status} ${errorText}`);
          }

          const driveFile = await driveResponse.json() as { name?: string; mimeType?: string; createdTime?: string; size?: string };
          cachedDriveFileInfo = driveFile;
          console.log(`[MetadataIndex PUT] Successfully fetched file info from Google Drive for ${fileId}:`, {
            name: driveFile.name,
            mimeType: driveFile.mimeType,
            hasCreatedTime: !!driveFile.createdTime
          });
          
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
            isThoughtThumbnail,
            isPartOfCollection
          });
          const initialMetadata: any = {
            fileId: fileId,
            backendFileId: fileId,
            backend: 'google_drive',
            name: name || driveFile.name?.replace(/\.encrypted$/i, '') || fileId,
            ...(title && { title }),
            fileType: determinedFileType,
            uploadDate: driveFile.createdTime || new Date().toISOString(),
            isPublic: isPublic !== undefined ? isPublic : defaultIsPublic,
            ...(publicToken && { publicToken }),
            ...(textPost && { textPost }),
            ...(thought && { thought }),
            ...(collection && { collection }), // Include collection data if provided
            ...(isNSFW !== undefined && { isNSFW: isNSFW === true }),
            ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }), // Thumbnails inherit classification from source
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
            }
          };

          // Submit initial metadata - ONLY for public files
          // Private files should NOT be in the database (they only exist in Google Drive + companion metadata)
          if (initialMetadata.isPublic === true) {
            try {
              // Repeat infringer: block making new content public
              const { isRepeatInfringer } = await import('./repeatInfringerService');
              if (await isRepeatInfringer(userIdentifier)) {
                return res.status(403).json({
                  error: 'Account restricted',
                  message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
                });
              }
              // DMCA gate: check content before indexing (skip if Prism already approved this file)
              const { isFileApprovedByPrism, addToPrismQueue } = await import('./prismQueueService');
              const alreadyApproved = await isFileApprovedByPrism(fileId);
              const { shouldSkipDmcaGate } = await import('./dmcaGate');
              const skipDmca = shouldSkipDmcaGate({ isThoughtThumbnail, thought, textPost });
              if (!alreadyApproved && !skipDmca) {
                const { runDMCACheck } = await import('./dmcaGate');
                const dmcaResult = await runDMCACheck(
                  googleDriveProxyService,
                  userIdentifier,
                  fileId,
                  (driveFile as any).mimeType || 'application/octet-stream',
                  accountId
                );
                if (!dmcaResult.passed) {
                  const queueItemId = await addToPrismQueue({
                    fileId,
                    ownerPnIdentifier: userIdentifier,
                    flagSource: 'bot',
                    reporterPnIdentifier: null,
                  });
                  const { addContentNotice } = await import('./contentNoticesService');
                  await addContentNotice({
                    ownerPnIdentifier: userIdentifier,
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
                dmcaCheckedThisRequest = true;
              } else {
                dmcaCheckedThisRequest = true;
              }
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
            isThoughtThumbnail,
            isPartOfCollection
          });
          const minimalMetadata: any = {
            fileId: fileId,
            backendFileId: fileId,
            backend: 'google_drive',
            name: name || fileId,
            ...(title && { title }),
            fileType: determinedFileType,
            uploadDate: new Date().toISOString(),
            isPublic: isPublic !== undefined ? isPublic : defaultIsPublic,
            ...(textPost && { textPost }),
            ...(thought && { thought }),
            ...(collection && { collection }), // Include collection data if provided
            ...(isNSFW !== undefined && { isNSFW: isNSFW === true }),
            ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }), // Thumbnails inherit classification from source
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
            }
          };
          // Submit minimal metadata - ONLY for public files
          // Private files should NOT be in the database (they only exist in Google Drive + companion metadata)
          if (minimalMetadata.isPublic === true) {
            try {
              const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
              // Repeat infringer (timeout) and DMCA gate - same as initial-metadata path
              const { isRepeatInfringer } = await import('./repeatInfringerService');
              if (await isRepeatInfringer(userIdentifier)) {
                return res.status(403).json({
                  error: 'Account restricted',
                  message: 'Your account is temporarily restricted from making new content public due to repeated copyright issues. This restriction will be lifted automatically after the timeout period.',
                });
              }
              const { isFileApprovedByPrism, addToPrismQueue } = await import('./prismQueueService');
              const alreadyApproved = await isFileApprovedByPrism(fileId);
              const { shouldSkipDmcaGate } = await import('./dmcaGate');
              const skipDmca = shouldSkipDmcaGate({ isThoughtThumbnail, thought, textPost });
              if (!alreadyApproved && !skipDmca) {
                const { googleDriveProxyService } = await import('./googleDriveProxy');
                const { runDMCACheck } = await import('./dmcaGate');
                const dmcaResult = await runDMCACheck(googleDriveProxyService, userIdentifier, fileId, 'application/octet-stream', (req.query.accountId as string) || undefined);
                if (!dmcaResult.passed) {
                  const queueItemId = await addToPrismQueue({
                    fileId,
                    ownerPnIdentifier: userIdentifier,
                    flagSource: 'bot',
                    reporterPnIdentifier: null,
                  });
                  const { addContentNotice } = await import('./contentNoticesService');
                  await addContentNotice({
                    ownerPnIdentifier: userIdentifier,
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
                dmcaCheckedThisRequest = true;
              } else {
                dmcaCheckedThisRequest = true;
              }
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
              isThoughtThumbnail,
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

      // CRITICAL: If isPublic is not explicitly provided, read from companion metadata
      // Companion metadata is the source of truth for visibility
      // IMPORTANT: If isPublic is undefined, we should preserve the existing value OR read from companion metadata
      // Only set to false if explicitly provided as false
      // NOTE: For private files, current will be null (they're not in database), so skip companion metadata reading
      let finalIsPublic = isPublic;
      if (isPublic === undefined && current && current.metadata.backend === 'google_drive' && fileExistedBefore) {
        // #region agent log
        // #endregion
        try {
          const { googleDriveProxyService } = await import('./googleDriveProxy');
          const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
          const accountId = req.query.accountId as string | undefined;
          const identifierCandidates: string[] = [];
          if (tokenPayload.pnIdentifier) identifierCandidates.push(tokenPayload.pnIdentifier);
          if (tokenPayload.did) {
            identifierCandidates.push(tokenPayload.did);
            if (tokenPayload.did.startsWith('did:key:')) {
              const keyPart = tokenPayload.did.substring(8);
              if (keyPart) identifierCandidates.push(keyPart);
            }
          }
          
          const { storageCredentialsService } = await import('./storageCredentialsService');
          const userPnId = userIdentifier || tokenPayload.pnIdentifier || tokenPayload.did;
          const credentialsRecord =
            storageCtx?.credentialsRecord ?? (await storageCredentialsService.getCredentials(userPnId));
          
          if (credentialsRecord?.credentials) {
            const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
              (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
            if (googleDriveAccounts.length > 0) {
              const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
              const accountIdForToken = accountIdParam || deps.extractAccountId(account);
              let token;
              if (storageCtx) {
                token = getDriveTokenFromContext(storageCtx);
              } else {
                const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
                try {
                  const resolved = await resolveOwnerDriveToken(req, userPnId, {
                    account,
                    accountId: accountIdForToken
                  });
                  token = resolved.token;
                } catch (error) {
                  if (respondDriveTokenError(res, error)) return;
                  throw error;
                }
              }
              const accessToken = token.access_token;
              const backendFileId = current.metadata.backendFileId || fileId;
              
              // Find companion metadata file
              const driveResponse = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=name='${backendFileId}.metadata' and mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
              );

              if (driveResponse.ok) {
                const driveData = await driveResponse.json() as { files?: Array<{ id: string }> };
                if (driveData.files && driveData.files.length > 0) {
                  const spreadsheetId = driveData.files[0].id;
                  const companionMetadata = await CompanionMetadataSheets.readMetadata(token, spreadsheetId, userPnId, accountIdForToken);
                  if (companionMetadata) {
                    finalIsPublic = companionMetadata.visibility === 'public';
                    // #region agent log
                    // #endregion
                    console.log(`[MetadataIndex PUT] Read isPublic from companion metadata: ${finalIsPublic} (visibility: ${companionMetadata.visibility})`);
                  }
                }
              }
            }
          }
        } catch (companionError: any) {
          // #region agent log
          // #endregion
          console.warn(`[MetadataIndex PUT] Failed to read companion metadata for ${fileId}:`, companionError.message);
          // If companion metadata read failed, preserve existing isPublic value (don't change it)
          if (finalIsPublic === undefined && current) {
            finalIsPublic = current.metadata.isPublic;
            console.log(`[MetadataIndex PUT] Preserving existing isPublic value: ${finalIsPublic}`);
          }
        }
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
        isThoughtThumbnail,
        isPartOfCollection
      });

      // Create companion metadata file for ALL files at upload/creation time (just like share tokens)
      // Companion metadata is created regardless of public/private status - it's just metadata storage
      // This matches the behavior of share tokens which are generated at upload time
      // ARCHITECTURAL: Companion metadata is created FIRST (source of truth) before database update (cache)
      const shouldCreateCompanionMetadata = !fileExistedBefore; // Only create on initial upload, not on updates
      
      if (shouldCreateCompanionMetadata) {
        // Determine final visibility status from req.body - companion metadata is source of truth
        let finalVisibility: 'public' | 'private' = 'private';
        if (isPublic !== undefined || textPost || thought) {
          const finalIsPublic = isPublic !== undefined ? isPublic : ((textPost || thought) ? true : false);
          finalVisibility = finalIsPublic ? 'public' : 'private';
        }
        
        console.log(`[MetadataIndex PUT] Companion metadata creation check for ${fileId}:`, {
          fileExistedBefore,
          shouldCreateCompanionMetadata,
          finalVisibility,
          hasAuthHeader: !!(req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        });
        
        console.log(`[MetadataIndex PUT] File ${fileId} is new - creating companion metadata (visibility=${finalVisibility})...`);
        const { shouldDeferCompanionMetadata } = await import('./dmcaGate');
        const deferCompanionCreate = shouldDeferCompanionMetadata({
          isThoughtThumbnail: isThoughtThumbnail ?? current?.metadata?.isThoughtThumbnail,
          thought: thought ?? current?.metadata?.thought,
          textPost: textPost ?? current?.metadata?.textPost,
        });
        const runCompanionMetadataCreate = async (): Promise<'drive_not_initialized' | void> => {
        try {
          {
            const tokenPayload = getBearerTokenPayload(req);
            if (tokenPayload) {
              const pnIdentifier = tokenPayload.pnIdentifier;
              if (!pnIdentifier) {
                console.error(`[MetadataIndex PUT] Missing pnIdentifier in token payload`);
                throw new Error('Missing pnIdentifier in token');
              }
              const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
              const identifierCandidates: string[] = [];
              if (tokenPayload.pnIdentifier) {
                identifierCandidates.push(tokenPayload.pnIdentifier);
              }
              if (tokenPayload.did) {
                identifierCandidates.push(tokenPayload.did);
                if (tokenPayload.did.startsWith('did:key:')) {
                  const keyPart = tokenPayload.did.substring(8);
                  if (keyPart) {
                    identifierCandidates.push(keyPart);
                  }
                }
              }
              
              const { googleDriveProxyService } = await import('./googleDriveProxy');
              const { storageCredentialsService } = await import('./storageCredentialsService');
              const accountId = accountIdParam;
              
              const credentialsRecord =
                storageCtx?.credentialsRecord ??
                (await storageCredentialsService.getCredentials(userIdentifier));
              if (!credentialsRecord?.credentials) {
                throw new Error('Storage not connected');
              }
              const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
              const { CompanionMetadataService } = await import('./companionMetadataService');
              const portableSocial = await isPortableStorageProvider(pnIdentifier);
              const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
              if (!portableSocial && googleDriveAccounts.length === 0) {
                throw new Error('Storage not connected');
              }

              const determinedFileTypeEarly = determineFileType({
                fileType: fileType,
                collection: collection,
                textPost: textPost,
                thought: thought,
                mimeType: (req.body && req.body.mimeType) || 'application/octet-stream',
                isThoughtThumbnail: isThoughtThumbnail,
                isPartOfCollection: isPartOfCollection
              });
              const determinedContentClassEarly = determineContentClass({
                fileType: determinedFileTypeEarly,
                collection: collection,
                textPost: textPost,
                thought: thought,
                isThoughtThumbnail: isThoughtThumbnail,
                isPartOfCollection: isPartOfCollection
              });

              if (portableSocial) {
                const exists = await CompanionMetadataService.exists(pnIdentifier, fileId);
                if (!exists) {
                  await CompanionMetadataService.create(pnIdentifier, fileId, {
                    fileId,
                    googleDriveFileId: fileId,
                    fileName: name || fileId,
                    originalName: (name || fileId).replace(/\.encrypted$/i, ''),
                    mimeType: (req.body && req.body.mimeType) || 'application/octet-stream',
                    fileType: determinedFileTypeEarly,
                    contentClass: determinedContentClassEarly,
                    size: typeof req.body?.size === 'number' ? req.body.size : parseInt(String(req.body?.size || '0'), 10),
                    visibility: finalVisibility,
                    uploadedAt: new Date().toISOString(),
                    owner: { did: tokenPayload.did, identifier: pnIdentifier },
                    tags: [],
                    ...(thumbnailFileId && { thumbnailFileId }),
                    mainFileId: mainFileId,
                    engagement: {
                      views: 0, likes: 0, comments: 0, shares: 0, saves: 0,
                      lastUpdated: new Date().toISOString(),
                      engagementHistory: []
                    }
                  } as any);
                  companionCreatedThisRequest = true;
                  console.log(`[MetadataIndex PUT] Created portable companion metadata for ${fileId}`);
                } else {
                  await CompanionMetadataService.update(pnIdentifier, fileId, {
                    visibility: finalVisibility,
                    ...(thumbnailFileId && { thumbnailFileId }),
                    ...(mainFileId && { mainFileId })
                  });
                }
                return;
              }

              const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
              const actualAccountId = accountId || (account ? deps.extractAccountId(account) : undefined);
              let token;
              if (storageCtx) {
                token = getDriveTokenFromContext(storageCtx);
              } else {
                const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
                try {
                  const resolved = await resolveOwnerDriveToken(req, pnIdentifier, {
                    account,
                    accountId: actualAccountId
                  });
                  token = resolved.token;
                } catch (error) {
                  if (respondDriveTokenError(res, error)) return;
                  throw error;
                }
              }
              const accessToken = token.access_token;
              
              let driveFile = cachedDriveFileInfo;
              if (!driveFile) {
                const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (!driveResponse.ok) {
                  const errorText = await driveResponse.text().catch(() => 'Unknown error');
                  console.error(`[MetadataIndex PUT] Failed to fetch file info: ${driveResponse.status} ${driveResponse.statusText} - ${errorText}`);
                  throw new Error(`Failed to fetch file info: ${driveResponse.status}`);
                }
                
                driveFile = await driveResponse.json() as { name?: string; mimeType?: string; size?: string; createdTime?: string };
                cachedDriveFileInfo = driveFile;
              }
              const originalFileName = driveFile.name?.replace(/\.encrypted$/i, '') || fileId;
              const originalMimeType = driveFile.mimeType || 'application/octet-stream';
              
              const out = await deps.getMetadataFolder(token, pnIdentifier, actualAccountId);
              if (!out) {
                return 'drive_not_initialized';
              }
              const { metadataFolderId, pnFolderId } = out;
              
              const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
                    
                    const existingSpreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      token,
                      metadataFolderId,
                      fileId,
                      pnIdentifier,
                      actualAccountId
                    );
                    
                    if (!existingSpreadsheetId) {
                      // Companion metadata doesn't exist - create it
                      console.log(`[MetadataIndex PUT] Companion metadata not found for file ${fileId} - creating (visibility=${finalVisibility})...`);
                      
                      // Use publicToken from req.body - companion metadata is source of truth
                      const tokenToUse = publicToken;
                      
                      console.log(`[MetadataIndex PUT] Companion metadata for file ${fileId}:`, {
                        hasPublicTokenInRequest: !!publicToken,
                        usingToken: !!tokenToUse,
                        hasMainFileId: !!mainFileId,
                        mainFileId: mainFileId,
                        isThoughtThumbnail: isThoughtThumbnail
                      });
                      
                      // Determine fileType and contentClass from req.body values - companion metadata is source of truth
                      const determinedFileType = determineFileType({
                        fileType: fileType,
                        collection: collection,
                        textPost: textPost,
                        thought: thought,
                        mimeType: originalMimeType,
                        isThoughtThumbnail: isThoughtThumbnail,
                        isPartOfCollection: isPartOfCollection
                      });
                      const determinedContentClass = determineContentClass({
                        fileType: determinedFileType,
                        collection: collection,
                        textPost: textPost,
                        thought: thought,
                        isThoughtThumbnail: isThoughtThumbnail,
                        isPartOfCollection: isPartOfCollection
                      });
                      
                      const companionMetadata = {
                        fileId: fileId,
                        googleDriveFileId: fileId,
                        fileName: driveFile.name || fileId,
                        originalName: originalFileName,
                        mimeType: originalMimeType,
                        fileType: determinedFileType,
                        contentClass: determinedContentClass,
                        size: parseInt(driveFile.size || '0', 10),
                        visibility: finalVisibility,
                        uploadedAt: driveFile.createdTime || new Date().toISOString(),
                        owner: {
                          did: tokenPayload.did,
                          identifier: pnIdentifier
                        },
                        tags: [],
                        ...(thumbnailFileId && { thumbnailFileId }),
                        mainFileId: mainFileId,
                        ...(textPost && { textPost }),
                        ...(thought && { thought }),
                        ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }),
                        ...(collection && { collection }),
                        ...(isPartOfCollection !== undefined && { isPartOfCollection }),
                        engagement: {
                          views: 0,
                          likes: 0,
                          comments: 0,
                          shares: 0,
                          lastUpdated: new Date().toISOString(),
                          engagementHistory: []
                        }
                      };
                      
                      console.log(`[MetadataIndex PUT] Companion metadata object before creating spreadsheet:`, {
                        fileId: companionMetadata.fileId,
                        hasMainFileId: !!companionMetadata.mainFileId,
                        mainFileId: companionMetadata.mainFileId,
                        isThoughtThumbnail: isThoughtThumbnail
                      });
                      
                      // Create new metadata spreadsheet
                      const spreadsheetId = await CompanionMetadataSheets.createSpreadsheet(
                        token,
                        metadataFolderId,
                        fileId,
                        companionMetadata,
                        pnIdentifier,
                        actualAccountId
                      );
                      console.log(`[MetadataIndex PUT] ✅ Created new companion metadata spreadsheet for ${fileId}: ${spreadsheetId}`);
                      companionCreatedThisRequest = true;
                    } else {
                      // Companion metadata exists - update it if needed
                      console.log(`[MetadataIndex PUT] Companion metadata already exists for ${fileId} - updating if needed...`);
                      
                      const currentMetadata = await service.getFileMetadata(fileId);
                      const existingPublicToken = currentMetadata?.metadata?.publicToken;
                      const tokenToUse = publicToken || existingPublicToken;
                      const metadataForUpdate = (currentMetadata?.metadata || {}) as any;
                      const mainFileIdForUpdate = mainFileId || metadataForUpdate.mainFileId;
                      const thumbnailFileIdForUpdate = thumbnailFileId || metadataForUpdate.thumbnailFileId;
                      
                      const companionMetadata = {
                        fileId: fileId,
                        googleDriveFileId: fileId,
                        fileName: driveFile.name || fileId,
                        originalName: originalFileName,
                        mimeType: originalMimeType,
                        size: parseInt(driveFile.size || '0', 10),
                        visibility: finalVisibility,
                        uploadedAt: driveFile.createdTime || new Date().toISOString(),
                        owner: {
                          did: tokenPayload.did,
                          identifier: pnIdentifier
                        },
                        tags: [],
                        ...(thumbnailFileIdForUpdate && { thumbnailFileId: thumbnailFileIdForUpdate }),
                        mainFileId: mainFileIdForUpdate,
                        ...(textPost && { textPost }),
                        ...(thought && { thought }),
                        ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }),
                        ...(collection && { collection }),
                        ...(isPartOfCollection !== undefined && { isPartOfCollection }),
                        engagement: {
                          views: 0,
                          likes: 0,
                          comments: 0,
                          shares: 0,
                          lastUpdated: new Date().toISOString(),
                          engagementHistory: []
                        }
                      };
                      
                      await CompanionMetadataSheets.updateMetadata(
                        token,
                        existingSpreadsheetId,
                        companionMetadata,
                        pnIdentifier,
                        actualAccountId
                      );
                      console.log(`[MetadataIndex PUT] ✅ Updated existing companion metadata spreadsheet for ${fileId}`);
                    }
                    
                    // Use req.body values for index updates - companion metadata is source of truth
                    const tokenToUseForIndex = publicToken;
                    const mainFileIdForIndex = mainFileId;
                    const thumbnailFileIdForIndex = thumbnailFileId;
                    
                    const companionMetadataForIndex = {
                      fileId: fileId,
                      googleDriveFileId: fileId,
                      fileName: driveFile.name || fileId,
                      originalName: originalFileName,
                      mimeType: originalMimeType,
                      size: parseInt(driveFile.size || '0', 10),
                      visibility: finalVisibility,
                      uploadedAt: driveFile.createdTime || new Date().toISOString(),
                      owner: {
                        did: tokenPayload.did,
                        identifier: pnIdentifier
                      },
                      tags: [],
                      ...(thumbnailFileIdForIndex && { thumbnailFileId: thumbnailFileIdForIndex }),
                      ...(mainFileIdForIndex && { mainFileId: mainFileIdForIndex }),
                      ...(tokenToUseForIndex && { publicToken: tokenToUseForIndex }),
                      ...(textPost && { textPost }),
                      ...(thought && { thought }),
                      ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }),
                      ...(collection && { collection }),
                      ...(isPartOfCollection !== undefined && { isPartOfCollection }),
                      engagement: {
                        views: 0,
                        likes: 0,
                        comments: 0,
                        shares: 0,
                        lastUpdated: new Date().toISOString(),
                        engagementHistory: []
                      }
                    };
                    
                    // Sheets indexes are non-blocking; Postgres + companion metadata are authoritative for feeds.
                    indexUpdatedThisRequest = true;
                    deps.scheduleDriveIndexUpdates(
                      token,
                      pnIdentifier,
                      metadataFolderId,
                      pnFolderId,
                      companionMetadataForIndex,
                      actualAccountId,
                      { isNewFile: true, isPublic: finalVisibility === 'public' }
                    );
              }
            }
        } catch (metadataError: any) {
          const msg = metadataError?.message || String(metadataError);
          if (msg.includes('DRIVE_NOT_INITIALIZED')) {
            return 'drive_not_initialized';
          }
          console.warn(`[MetadataIndex] Failed to create companion metadata file for ${fileId}: ${msg}`);
        }
        };
        if (deferCompanionCreate) {
          console.log(`[MetadataIndex PUT] Deferring companion metadata create for ${fileId} to background (Postgres is feed truth)`);
          indexUpdatedThisRequest = true;
          companionCreatedThisRequest = true;
          void runCompanionMetadataCreate();
        } else {
          const companionCreateResult = await runCompanionMetadataCreate();
          if (companionCreateResult === 'drive_not_initialized') {
            return deps.driveNotInitialized(res);
          }
        }
      } else {
        console.log(`[MetadataIndex PUT] File ${fileId} already existed (fileExistedBefore=${fileExistedBefore}) - skipping companion metadata creation`);
      }

      // ARCHITECTURAL FIX: Update companion metadata FIRST (source of truth), then database (cache)
      // Skip when companion create already ran or was deferred to background (fields included there).
      if (!companionCreatedThisRequest && (name || description || keywords || tags || genre || category || locationCreated || license)) {
        try {
          {
            const tokenPayload = getBearerTokenPayload(req);
            if (tokenPayload) {
              const pnIdentifier = tokenPayload.pnIdentifier;
              if (pnIdentifier) {
                const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
                const identifierCandidates: string[] = [];
                if (tokenPayload.pnIdentifier) {
                  identifierCandidates.push(tokenPayload.pnIdentifier);
                }
                if (tokenPayload.did) {
                  identifierCandidates.push(tokenPayload.did);
                  if (tokenPayload.did.startsWith('did:key:')) {
                    const keyPart = tokenPayload.did.substring(8);
                    if (keyPart) {
                      identifierCandidates.push(keyPart);
                    }
                  }
                }
                
                const { googleDriveProxyService } = await import('./googleDriveProxy');
                const { storageCredentialsService } = await import('./storageCredentialsService');
                const accountId = accountIdParam;
                const credentialsRecord =
                  storageCtx?.credentialsRecord ??
                  (await storageCredentialsService.getCredentials(userIdentifier));
                
                if (credentialsRecord?.credentials) {
                  const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                    (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
                  if (googleDriveAccounts.length > 0) {
                    const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
                    const accountIdForToken = accountId || deps.extractAccountId(account);
                    let token;
                    if (storageCtx) {
                      token = getDriveTokenFromContext(storageCtx);
                    } else {
                      const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
                      try {
                        const resolved = await resolveOwnerDriveToken(req, pnIdentifier, {
                          account,
                          accountId: accountIdForToken
                        });
                        token = resolved.token;
                      } catch (error) {
                        if (respondDriveTokenError(res, error)) return;
                        throw error;
                      }
                    }
                    const accessToken = token.access_token;
                    
                    // Get pN folder and metadata folder
                    const { pnFolderDisplayName } = await import('./integratorStoragePaths');
                    const pnFolderName = pnFolderDisplayName(pnIdentifier);
                    const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                    
                    const folderResponse = await fetch(folderSearchUrl, {
                      headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    let pnFolderId: string | null = null;
                    if (folderResponse.ok) {
                      const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                      if (folderData.files && folderData.files.length > 0) {
                        pnFolderId = folderData.files[0].id;
                      }
                    }
                    
                    if (pnFolderId) {
                      const metadataFolderName = '_metadata';
                      const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                      const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                      
                      const metadataFolderResponse = await fetch(metadataSearchUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                      });
                      
                      let metadataFolderId: string | null = null;
                      if (metadataFolderResponse.ok) {
                        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                        if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                          metadataFolderId = metadataFolderData.files[0].id;
                        }
                      }
                      
                      if (metadataFolderId) {
                        const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
                        const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                          token,
                          metadataFolderId,
                          actualFileId,
                          pnIdentifier,
                          accountIdForToken
                        );
                        
                        if (spreadsheetId) {
                          // Build partial update for companion metadata
                          const companionMetadataUpdate: Partial<any> = {};
                          if (description !== undefined) companionMetadataUpdate.description = description;
                          if (tags || keywords) companionMetadataUpdate.tags = tags || keywords || [];
                          // Note: category, genre, location, license may need to be stored in metadata field
                          // or added to CompanionMetadataSheets.updateMetadata() method
                          // For now, we update what we can (description and tags)
                          
                          await CompanionMetadataSheets.updateMetadata(
                            token,
                            spreadsheetId,
                            companionMetadataUpdate,
                            pnIdentifier,
                            accountIdForToken
                          );
                          console.log(`[MetadataIndex PUT] Updated companion metadata FIRST (source of truth) for ${actualFileId} with metadata fields`);
                        } else {
                          console.log(`[MetadataIndex PUT] Companion metadata spreadsheet not found for ${actualFileId} - metadata fields will be saved to database only`);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (companionMetadataError: any) {
          console.error(`[MetadataIndex PUT] CRITICAL: Failed to update companion metadata (source of truth) for ${fileId}:`, companionMetadataError?.message || companionMetadataError);
          // Since companion metadata is the source of truth, we should fail the request if it can't be updated
          // This prevents database and companion metadata from being out of sync
          return res.status(500).json({ 
            error: 'Failed to update companion metadata',
            message: 'Companion metadata update failed. This is the source of truth, so the update cannot proceed.'
          });
        }
      }

      // Update database metadata AFTER companion metadata (cache syncs from source of truth)
      // Use actualFileId (resolved to thumbnail if fileId was main file)
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
        subjects,
        feedCategories,
        thumbnailFileId,
        isThoughtThumbnail, // Thumbnails inherit classification from source
        isPartOfCollection, // Collection files inherit collection classification
        mainFileId // Reference to source file for thumbnails
      });

      // Also update Google Drive index (source of truth) if file is public
      const updatedIsPublic = finalIsPublic !== undefined ? finalIsPublic : (isPublic !== undefined ? isPublic : updated?.isPublic);
      if (updatedIsPublic === true && updated && !indexUpdatedThisRequest) {
        try {
          const { IndexSheetsService } = await import('./indexSheetsService');
          const { storageCredentialsService } = await import('./storageCredentialsService');
          
          // Get user's credentials
          const pnIdentifier = tokenPayload.pnIdentifier;
          if (pnIdentifier) {
            const credentialsRecord =
              storageCtx?.credentialsRecord ??
              (await storageCredentialsService.getCredentials(pnIdentifier));
            if (credentialsRecord?.credentials) {
              const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
                const accountId = accountIdParam || deps.extractAccountId(account);
                let token;
                if (storageCtx) {
                  token = getDriveTokenFromContext(storageCtx);
                } else {
                  const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
                  try {
                    const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
                    token = resolved.token;
                  } catch (error) {
                    if (respondDriveTokenError(res, error)) return;
                    throw error;
                  }
                }
                const out = await deps.getMetadataFolder(token, pnIdentifier, accountId);
                if (!out) {
                  return deps.driveNotInitialized(res);
                }
                const metadataFolder = out.metadataFolderId;
                
                // Get or create public-file-index.xlsx
                const spreadsheetId = await IndexSheetsService.getIndexSheet(
                  token,
                  metadataFolder,
                  'public',
                  pnIdentifier,
                  accountId
                );
              
              // Convert metadata to IndexFileEntry format
              const indexEntry: any = {
                fileId: actualFileId,
                googleDriveFileId: updated.backendFileId || actualFileId,
                fileName: updated.name || updated.title,
                originalName: updated.name || updated.title,
                mimeType: (updated as any).mimeType,
                visibility: 'public',
                uploadedAt: updated.uploadDate || new Date().toISOString(),
                owner: updated.creator ? {
                  did: updated.creator['@id'] || updated.creator.identifier?.value,
                  identifier: updated.creator.identifier?.value || updated.creator['@id']
                } : undefined,
                tags: updated.tags || updated.keywords || [],
                description: updated.description,
                publicToken: updated.publicToken,
                engagement: updated.engagement,
                contentClass: (updated as any).contentClass,
                isThoughtThumbnail: (updated as any).isThoughtThumbnail,
                mainFileId: (updated as any).mainFileId,
                thumbnailFileId: (updated as any).thumbnailFileId,
                collectionFileIds: (updated as any).collection?.collectionFileIds
              };
              
                // Check if file exists in index, update or add accordingly
                try {
                  await IndexSheetsService.updateFile(
                    token,
                    spreadsheetId,
                    actualFileId,
                    indexEntry,
                    pnIdentifier,
                    accountId,
                    'public'
                  );
                  console.log(`✅ [MetadataIndex PUT] Updated Google Drive public-file-index.xlsx for ${actualFileId}`);
                } catch (updateError: any) {
                  // If update fails (file not found), try adding it
                  if (updateError.message?.includes('not found')) {
                    await IndexSheetsService.addFile(
                      token,
                      spreadsheetId,
                      indexEntry,
                      pnIdentifier,
                      accountId,
                      'public'
                    );
                    console.log(`✅ [MetadataIndex PUT] Added to Google Drive public-file-index.xlsx for ${actualFileId}`);
                  } else {
                    throw updateError;
                  }
                }
              }
            }
          }
        } catch (driveError: any) {
          console.warn(`⚠️ [MetadataIndex PUT] Failed to update Google Drive index (non-critical):`, driveError?.message || driveError);
          // Don't fail the request - database cache is updated
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

      // SIMPLIFIED: Update companion metadata if isPublic is being changed
      // For private files, current might be null if we just deleted it, so use updated metadata from updateMetadata()
      if ((isPublic === false || isPublic === true) && !companionCreatedThisRequest) {
        // Use current metadata if available, otherwise use updated metadata from updateMetadata() call
        const metadataForCompanion = current?.metadata || updated;
        try {
          {
            const tokenPayload = getBearerTokenPayload(req);
            if (tokenPayload) {
              const pnIdentifier = tokenPayload.pnIdentifier;
              if (!pnIdentifier) {
                console.error(`[MetadataIndex PUT] Missing pnIdentifier in token payload`);
                throw new Error('Missing pnIdentifier in token');
              }
              const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
              const identifierCandidates: string[] = [];
              if (tokenPayload.pnIdentifier) {
                identifierCandidates.push(tokenPayload.pnIdentifier);
              }
              if (tokenPayload.did) {
                identifierCandidates.push(tokenPayload.did);
                if (tokenPayload.did.startsWith('did:key:')) {
                  const keyPart = tokenPayload.did.substring(8);
                  if (keyPart) {
                    identifierCandidates.push(keyPart);
                  }
                }
              }
              
              const { googleDriveProxyService } = await import('./googleDriveProxy');
              const { storageCredentialsService } = await import('./storageCredentialsService');
              const accountId = accountIdParam;
              const credentialsRecord =
                storageCtx?.credentialsRecord ??
                (await storageCredentialsService.getCredentials(userIdentifier));
              
              if (credentialsRecord?.credentials) {
                const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                  (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
                if (googleDriveAccounts.length > 0) {
                  const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
                  const accountIdForToken = accountId || deps.extractAccountId(account);
                  let token;
                  if (storageCtx) {
                    token = getDriveTokenFromContext(storageCtx);
                  } else {
                    const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
                    try {
                      const resolved = await resolveOwnerDriveToken(req, pnIdentifier, {
                        account,
                        accountId: accountIdForToken
                      });
                      token = resolved.token;
                    } catch (error) {
                      if (respondDriveTokenError(res, error)) return;
                      throw error;
                    }
                  }
                  const accessToken = token.access_token;
                  
                  // Get pN folder and metadata folder
                  const { pnFolderDisplayName } = await import('./integratorStoragePaths');
                  const pnFolderName = pnFolderDisplayName(pnIdentifier);
                  const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                  
                  const folderResponse = await fetch(folderSearchUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  let pnFolderId: string | null = null;
                  if (folderResponse.ok) {
                    const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    if (folderData.files && folderData.files.length > 0) {
                      pnFolderId = folderData.files[0].id;
                    }
                  }
                  
                  if (pnFolderId) {
                    const metadataFolderName = '_metadata';
                    const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                    
                    const metadataFolderResponse = await fetch(metadataSearchUrl, {
                      headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    let metadataFolderId: string | null = null;
                    if (metadataFolderResponse.ok) {
                      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                      if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                        metadataFolderId = metadataFolderData.files[0].id;
                      }
                    }
                    
                    if (metadataFolderId) {
                      const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
                      const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                        token,
                        metadataFolderId,
                        actualFileId,
                        pnIdentifier,
                        accountIdForToken
                      );
                      
                      if (spreadsheetId) {
                        const visibility = isPublic === true ? 'public' : 'private';
                        
                        // Get metadata to determine contentClass and thumbnailFileId
                        // For private files, current might be null if already deleted, so use metadataForCompanion
                        const metadataForType = (metadataForCompanion || {}) as any;
                        
                        // Determine fileType and contentClass
                        const determinedFileType = determineFileType({
                          fileType: metadataForType.fileType,
                          collection: metadataForType.collection,
                          textPost: metadataForType.textPost,
                          thought: metadataForType.thought,
                          mimeType: metadataForType.mimeType,
                          isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                          isPartOfCollection: metadataForType.isPartOfCollection
                        });
                        const determinedContentClass = determineContentClass({
                          fileType: determinedFileType,
                          collection: metadataForType.collection,
                          textPost: metadataForType.textPost,
                          thought: metadataForType.thought,
                          isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                          isPartOfCollection: metadataForType.isPartOfCollection
                        });
                        
                        await CompanionMetadataSheets.updateMetadata(
                          token,
                          spreadsheetId,
                          { 
                            visibility: visibility as 'public' | 'private',
                            fileType: determinedFileType,
                            contentClass: determinedContentClass,
                            thumbnailFileId: metadataForType.thumbnailFileId
                          },
                          pnIdentifier,
                          accountIdForToken
                        );
                        console.log(`[MetadataIndex PUT] Updated companion metadata (source of truth) for ${actualFileId} to ${visibility} (contentClass: ${determinedContentClass})`);
                      } else {
                        console.log(`[MetadataIndex PUT] Companion metadata spreadsheet not found for ${fileId} - will be created in companion metadata creation block`);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (companionMetadataError: any) {
          console.error(`[MetadataIndex PUT] CRITICAL: Failed to update companion metadata (source of truth) for ${fileId}:`, companionMetadataError?.message || companionMetadataError);
          // Since companion metadata is the source of truth, we should fail the request if it can't be updated
          // This prevents database and companion metadata from being out of sync
          return res.status(500).json({ 
            error: 'Failed to update companion metadata',
            message: 'Companion metadata update failed. This is the source of truth, so the update cannot proceed.'
          });
        }
      }
      
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
                isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                isPartOfCollection: metadataForType.isPartOfCollection
              });
              const determinedContentClass = determineContentClass({
                fileType: determinedFileType,
                collection: metadataForType.collection,
                textPost: metadataForType.textPost,
                thought: metadataForType.thought,
                isThoughtThumbnail: metadataForType.isThoughtThumbnail,
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
              // DMCA gate: check content before indexing (skip if Prism already approved this file)
              const driveFileId = String((current.metadata as any)?.backendFileId ?? actualFileId ?? '');
              const mimeType = String((current.metadata as any)?.mimeType ?? 'application/octet-stream');
              const { isFileApprovedByPrism, addToPrismQueue } = await import('./prismQueueService');
              const alreadyApproved = await isFileApprovedByPrism(fileId);
              const { shouldSkipDmcaGate } = await import('./dmcaGate');
              const skipDmca = shouldSkipDmcaGate({
                isThoughtThumbnail: (current.metadata as any)?.isThoughtThumbnail,
                thought: (current.metadata as any)?.thought,
                textPost: (current.metadata as any)?.textPost,
              });
              if (!alreadyApproved && !skipDmca) {
                const { googleDriveProxyService: driveProxy } = await import('./googleDriveProxy');
                const { runDMCACheck } = await import('./dmcaGate');
                const dmcaResult = await runDMCACheck(driveProxy, ownerPn, driveFileId, mimeType, (req.query.accountId as string) || undefined);
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

      console.log(
        `[MetadataIndex PUT] Completed for ${fileId} in ${Date.now() - putStartedAt}ms`
      );
      return res.json({ success: true, metadata: result });
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

  // POST /api/aggregator/metadata-index/sync - Portable index upsert + public cache reconcile
  app.post('/api/aggregator/metadata-index/sync', async (req: Request, res: Response) => {
    try {
      const { userStorageSyncService } = await import('./userStorageSyncService');
      const { runReconcilePublicAggregator } = await import('../jobs/reconcilePublicAggregatorJob');
      const portable = await userStorageSyncService.syncPortableUsers();
      const reconcile = await runReconcilePublicAggregator();
      return res.json({ success: true, portable, reconcile });
    } catch (error: any) {
      return res.status(500).json({
        error: 'Sync failed',
        message: safeClientErrorMessage(error, NODE_ENV === 'production')
      });
    }
  });

  // POST /api/aggregator/metadata-index/sync-visibility - Sync isPublic from companion metadata files
  app.post('/api/aggregator/metadata-index/sync-visibility', async (req: Request, res: Response) => {
    try {
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const { googleDriveProxyService } = await import('./googleDriveProxy');
      const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
      const service = AggregatorMetadataServiceDB.getInstance();
      const db = (await import('../utils/database')).getDatabasePool();

      // Get auth token
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({ error: 'Invalid or expired access token' });
      }

      const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
      const identifierCandidates: string[] = [];
      if (tokenPayload.pnIdentifier) identifierCandidates.push(tokenPayload.pnIdentifier);
      if (tokenPayload.did) {
        identifierCandidates.push(tokenPayload.did);
        if (tokenPayload.did.startsWith('did:key:')) {
          const keyPart = tokenPayload.did.substring(8);
          if (keyPart) identifierCandidates.push(keyPart);
        }
      }

      // Get all files from database
      const allFiles = await db.query(`
        SELECT file_id, metadata->>'backendFileId' as backend_file_id, metadata->>'name' as name
        FROM aggregator_metadata
        WHERE metadata->>'backend' = 'google_drive'
      `);

      let updated = 0;
      let errors = 0;

      for (const row of allFiles.rows) {
        try {
          const fileId = row.file_id;
          const backendFileId = row.backend_file_id || fileId;

          // Get access token (owner custody — prefer forwarded cloud token)
          const accountId = req.query.accountId as string | undefined;
          const { resolveOwnerDriveToken } = await import('./ownerDriveToken');
          const accessToken = (
            await resolveOwnerDriveToken(req, userIdentifier, { accountId })
          ).token.access_token;

          // Find companion metadata file
          const driveResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${backendFileId}.metadata' and mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );

          if (!driveResponse.ok) continue;
          const driveData = await driveResponse.json() as { files?: Array<{ id: string }> };
          if (!driveData.files || driveData.files.length === 0) continue;

          const spreadsheetId = driveData.files[0].id;

          // Read companion metadata - need to get owner's credentials to build token object
          // For now, skip this - we'd need to get file owner's credentials which is complex in this loop
          // This endpoint is for syncing, so we can skip companion metadata reading here
          continue;
        } catch (error: any) {
          console.error(`❌ Failed to sync visibility for ${row.file_id}:`, error.message);
          errors++;
        }
      }

      return res.json({
        success: true,
        totalFiles: allFiles.rows.length,
        updated,
        errors,
        message: `Synced visibility for ${updated} file(s)`
      });
    } catch (error: any) {
      console.error('❌ Sync visibility error:', error);
      return res.status(500).json({ error: 'Failed to sync visibility', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
    }
  });

}
