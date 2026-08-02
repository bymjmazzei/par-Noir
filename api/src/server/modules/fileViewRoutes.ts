/**
 * File view tracking (one row per viewer per day) feeding bot detection and
 * engagement counts. Views are best-effort: failures never surface as 5xx.
 */

import type { Application, Request, Response } from 'express';

/** POST /api/file-views - Track viewing behavior for bot detection */
export function registerFileViewRoutes(app: Application): void {
    app.post('/api/file-views', async (req: Request, res: Response) => {
      try {
        const { fileId, userPnIdentifier, viewDuration } = req.body;
        
        if (!fileId || !userPnIdentifier) {
          return res.status(400).json({ error: 'fileId and userPnIdentifier are required' });
        }
        
        const db = (await import('../utils/database')).getDatabasePool();
        
        let isNewView = false;
        // Try to insert first (optimistic path - most common case)
        try {
          await db.query(`
            INSERT INTO file_views (file_id, user_did, view_duration, viewed_at)
            VALUES ($1, $2, $3::DECIMAL, NOW())
          `, [fileId, userPnIdentifier, viewDuration || 0]);
          isNewView = true;
        } catch (insertError: any) {
          // If unique constraint violation (23505), update instead
          // This handles race conditions where two requests try to insert simultaneously
          if (insertError.code === '23505') {
            await db.query(`
              UPDATE file_views 
              SET view_duration = GREATEST(view_duration, $3::DECIMAL),
                  viewed_at = NOW()
              WHERE file_id = $1 
              AND user_did = $2 
              AND DATE(viewed_at) = DATE(NOW())
            `, [fileId, userPnIdentifier, viewDuration || 0]);
          } else {
            throw insertError; // Re-throw if it's a different error
          }
        }

        if (isNewView) {
          // Update aggregator metadata engagement.views (best-effort; do not fail response)
          try {
            const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
            await AggregatorMetadataServiceDB.getInstance().updateEngagement(fileId, 'view', userPnIdentifier);
          } catch (engagementError: any) {
            console.warn('[file-views] Failed to update aggregator metadata engagement:', engagementError?.message || engagementError);
          }

          // Update creator's companion metadata Sheets (best-effort)
          try {
            const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
            const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
            const { appendOwnerCompanionEngagement } = await import('./engagementCompanionSync');
            const fileMetadata = await AggregatorMetadataServiceDB.getInstance().getFileMetadata(fileId);
            if (fileMetadata) {
              const ownerDid =
                fileMetadata.pnIdentifier ||
                (fileMetadata.metadata as any).creator?.['@id'] ||
                (fileMetadata.metadata as any).author?.did;
              if (ownerDid) {
                await appendOwnerCompanionEngagement(fileId, ownerDid, 'view', {
                    fileId,
                    viewerPnIdentifier: userPnIdentifier,
                    timestamp: new Date().toISOString()
                  });
              }
            }
          } catch (sheetError: any) {
            console.warn('[file-views] Failed to update creator companion metadata sheet for view:', sheetError?.message || sheetError);
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error recording file view (non-fatal):', error);
        // Return 200 so clients do not see 500 - viewing is best-effort; table may be missing or DB error
        return res.status(200).json({ success: false });
      }
    });
}
