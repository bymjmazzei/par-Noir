/**
 * Search endpoints: public aggregator metadata search and the user's own
 * indexed-file history.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

/** GET /api/search - Search public metadata */
export function registerSearchRoutes(app: Application): void {
    app.get('/api/search', async (req: Request, res: Response) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Parse query parameters
        const query = req.query.q as string | undefined;
        const sortBy = (req.query.sort as 'relevance' | 'date' | 'popularity') || 'relevance';
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const fileType = req.query.fileType as string | undefined;
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const authorDid = req.query.authorDid as string | undefined;
        const feedId = req.query.feedId as string | undefined;
        const feedCategory = req.query.feedCategory as string | undefined;
        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const maxRating = req.query.maxRating as string | undefined;

        if (!query || !query.trim()) {
          return res.status(400).json({
            error: 'Query parameter "q" is required',
            files: [],
            total: 0,
            hasMore: false
          });
        }

        const result = await service.searchMetadata(query.trim(), {
          sortBy,
          limit,
          offset,
          fileType,
          tags,
          authorDid,
          feedId,
          feedCategory,
          dateFrom,
          dateTo,
          maxRating
        });

        // Convert to IndexedFile format expected by frontend
        const files = result.files.map(entry => ({
          metadata: entry.metadata,
          thumbnail: undefined // Thumbnails are generated client-side
        }));

        console.log(`🔍 [GET /api/search] Query: "${query}", Found ${files.length} files (total: ${result.total})`);
        return res.json({
          files,
          total: result.total,
          hasMore: result.hasMore
        });
      } catch (error: any) {
        console.error('❌ [GET /api/search] Error:', error);
        return res.status(500).json({
          error: 'Search failed',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
          files: [],
          total: 0,
          hasMore: false
        });
      }
    });
}

/** GET /api/search/personal - Search user's own indexed files (minimal personal history) */
export function registerPersonalSearchRoute(app: Application): void {
    app.get('/api/search/personal', async (req: Request, res: Response) => {
      try {
        const userPnIdentifier = String(req.query.userPnIdentifier || '').trim();
        const q = String(req.query.q || '').trim();
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
        const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();
        const result = await service.searchMetadata(q, {
          authorDid: normalized,
          limit: limit + offset,
          offset: 0
        });
        const slice = result.files.slice(offset, offset + limit);
        return res.json({
          files: slice.map((entry: { metadata: unknown }) => entry.metadata),
          total: result.total,
          hasMore: offset + limit < result.total
        });
      } catch (error: unknown) {
        console.error('Error in personal search:', error);
        return res.status(500).json({ error: 'Failed to search personal history' });
      }
    });
}
