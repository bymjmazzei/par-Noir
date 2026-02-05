/**
 * Prism API Routes
 * Queue, preview, vote, and copyright report endpoints
 */

import { Request, Response } from 'express';
import { getPendingQueueItems, submitVote, addToPrismQueue, getQueueStats, seedDemoQueueItems } from './prismQueueService';
import { isPrismAdmin, isBootstrapMode } from './prismAdminService';
import { getReputationScore, submitRayApplication } from './prismReputationService';

export function setupPrismRoutes(app: any): void {
  /**
   * POST /api/reports
   * Submit a content report. Copyright reports are added to the Prism queue.
   * Requires Bearer token.
   * Body: { fileId, reportType: 'copyright' | 'nsfw' | 'spam' | 'other', reason? }
   */
  app.post('/api/reports', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { fileId, reportType, reason } = req.body;
      if (!fileId || !reportType) {
        return res.status(400).json({ error: 'fileId and reportType required' });
      }
      if (!['copyright', 'nsfw', 'spam', 'other'].includes(reportType)) {
        return res.status(400).json({ error: 'Invalid reportType' });
      }

      if (reportType === 'copyright') {
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const metadataService = AggregatorMetadataServiceDB.getInstance();
        const entry = await metadataService.getFileMetadata(fileId);
        const ownerPn = entry?.pnIdentifier;
        if (!ownerPn) {
          return res.status(404).json({ error: 'File not found' });
        }
        await addToPrismQueue({
          fileId,
          ownerPnIdentifier: ownerPn,
          flagSource: 'user_report',
          reporterPnIdentifier: payload.pnIdentifier,
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Prism] Report error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to submit report' });
    }
  });

  /**
   * GET /api/prism/queue
   * Fetch pending items for Ray review
   * Requires Bearer token (Ray auth)
   */
  app.get('/api/prism/queue', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
      const items = await getPendingQueueItems(limit);

      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const metadataService = AggregatorMetadataServiceDB.getInstance();

      const enriched = await Promise.all(
        items.map(async (item) => {
          const meta = await metadataService.getFileMetadata(item.file_id);
          return {
            ...item,
            name: (meta?.metadata as any)?.name || item.file_id,
            mimeType: (meta?.metadata as any)?.mimeType || 'application/octet-stream',
            thumbnailFileId: (meta?.metadata as any)?.thumbnailFileId,
          };
        })
      );

      return res.json({ items: enriched });
    } catch (err: any) {
      console.error('[Prism] Queue fetch error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to fetch queue' });
    }
  });

  /**
   * POST /api/prism/vote
   * Submit Ray vote (approve/deny)
   */
  app.post('/api/prism/vote', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { queueItemId, vote } = req.body;
      if (!queueItemId || !vote || !['approve', 'deny'].includes(vote)) {
        return res.status(400).json({ error: 'Invalid queueItemId or vote' });
      }

      const result = await submitVote(queueItemId, payload.pnIdentifier, vote);
      return res.json({ success: true, resolved: result.resolved, status: result.status });
    } catch (err: any) {
      console.error('[Prism] Vote error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to submit vote' });
    }
  });

  /**
   * GET /api/prism/preview
   * Proxy content/thumbnail for review (ownerPn, fileId, thumbnail=true)
   * Requires Ray auth
   */
  app.get('/api/prism/preview', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const ownerPn = req.query.ownerPn as string;
      const fileId = req.query.fileId as string;
      const thumbnail = req.query.thumbnail === 'true';

      if (!ownerPn || !fileId) {
        return res.status(400).json({ error: 'ownerPn and fileId required' });
      }

      const { googleDriveProxyService } = await import('./googleDriveProxy');

      if (thumbnail) {
        const accessToken = await googleDriveProxyService.getAccessToken(ownerPn);
        const thumbRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!thumbRes.ok) {
          const blob = await googleDriveProxyService.downloadFile(ownerPn, fileId);
          res.setHeader('Content-Type', blob.type || 'application/octet-stream');
          return res.send(Buffer.from(await blob.arrayBuffer()));
        }
        const data = await thumbRes.json() as { thumbnailLink?: string };
        if (data.thumbnailLink) {
          const imgRes = await fetch(data.thumbnailLink);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
            return res.send(buf);
          }
        }
      }

      const blob = await googleDriveProxyService.downloadFile(ownerPn, fileId);
      res.setHeader('Content-Type', blob.type || 'application/octet-stream');
      return res.send(Buffer.from(await blob.arrayBuffer()));
    } catch (err: any) {
      console.error('[Prism] Preview error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to fetch preview' });
    }
  });

  /**
   * POST /api/prism/apply
   * Submit Ray application. Requires eligible reputation. Idempotent (returns already_applied if exists).
   */
  app.post('/api/prism/apply', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      const result = await submitRayApplication(payload.pnIdentifier);
      if (result.applied) {
        return res.json({ success: true, applicationId: result.applicationId });
      }
      return res.status(400).json({
        success: false,
        reason: result.reason,
        message:
          result.reason === 'ineligible'
            ? 'Reputation score too low. Build activity, content, and tenure to qualify.'
            : 'You have already applied.',
      });
    } catch (err: any) {
      console.error('[Prism] Apply error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to apply' });
    }
  });

  /**
   * GET /api/prism/reputation
   * Returns reputation score for authenticated user (for Ray application eligibility)
   */
  app.get('/api/prism/reputation', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      const result = await getReputationScore(payload.pnIdentifier);
      return res.json(result);
    } catch (err: any) {
      console.error('[Prism] Reputation error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to get reputation' });
    }
  });

  /**
   * GET /api/prism/admin/reputation/:pnIdentifier
   * Returns reputation for any user. Admin only.
   */
  app.get('/api/prism/admin/reputation/:pnIdentifier', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier || !isPrismAdmin(payload.pnIdentifier)) {
        return res.status(403).json({ error: 'Admin required' });
      }
      const pnIdentifier = req.params.pnIdentifier;
      if (!pnIdentifier) {
        return res.status(400).json({ error: 'pnIdentifier required' });
      }
      const result = await getReputationScore(pnIdentifier);
      return res.json(result);
    } catch (err: any) {
      console.error('[Prism] Admin reputation error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to get reputation' });
    }
  });

  /**
   * GET /api/prism/admin/check
   * Returns whether current user is admin and if bootstrap mode is on
   */
  app.get('/api/prism/admin/check', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      return res.json({
        isAdmin: isPrismAdmin(payload.pnIdentifier),
        isBootstrapMode: isBootstrapMode(),
      });
    } catch (err: any) {
      console.error('[Prism] Admin check error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to check admin' });
    }
  });

  /**
   * POST /api/prism/admin/seed-demo
   * Seed demo flagged content from existing public aggregator files. Admin only.
   * Query: ?limit=5 (optional, default 5)
   */
  app.post('/api/prism/admin/seed-demo', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier || !isPrismAdmin(payload.pnIdentifier)) {
        return res.status(403).json({ error: 'Admin required' });
      }
      const limit = Math.min(parseInt(String(req.query.limit || '5'), 10) || 5, 20);
      const { added, fileIds } = await seedDemoQueueItems(limit);
      return res.json({
        success: true,
        added,
        fileIds,
        message:
          added > 0
            ? `Added ${added} item(s) to the review queue`
            : 'No public aggregator files found to add. Upload public content via the dashboard or browser first.',
      });
    } catch (err: any) {
      console.error('[Prism] Seed demo error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to seed demo' });
    }
  });

  /**
   * GET /api/prism/admin/stats
   * Queue statistics. Requires admin.
   */
  app.get('/api/prism/admin/stats', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const token = authHeader.substring(7);
      const { PNOAuthService } = await import('./pnOAuthService');
      const payload = PNOAuthService.validateAccessToken(token);
      if (!payload?.pnIdentifier || !isPrismAdmin(payload.pnIdentifier)) {
        return res.status(403).json({ error: 'Admin required' });
      }
      const stats = await getQueueStats();
      return res.json(stats);
    } catch (err: any) {
      console.error('[Prism] Admin stats error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to fetch stats' });
    }
  });
}
