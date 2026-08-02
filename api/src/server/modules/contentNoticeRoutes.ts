/**
 * Content notice and DMCA routes
 */

import express, { Request, Response, NextFunction } from 'express';
import { getBearerTokenPayload } from '../middleware/authMiddleware';

/**
 * Setup content notice / DMCA routes
 */
export function setupContentNoticeRoutes(app: any) {
  // Content notices (DMCA / index removal - in-app only)
  app.get('/api/content-notices', async (req: Request, res: Response) => {
    try {
      const payload = getBearerTokenPayload(req);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
      const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
      const { getContentNoticesForOwner } = await import('./contentNoticesService');
      const notices = await getContentNoticesForOwner(payload.pnIdentifier, limit, offset);
      return res.json({
        notices: notices.map((n) => ({
          id: n.id,
          fileId: n.file_id,
          type: n.type,
          reason: n.reason ?? undefined,
          source: n.source,
          createdAt: n.created_at,
        })),
      });
    } catch (err: any) {
      console.error('[Content notices] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to get content notices' });
    }
  });

  // POST /api/dmca/counter-notice - Submit counter-notice (auth required; content owner only)
  app.post('/api/dmca/counter-notice', express.json(), async (req: Request, res: Response) => {
    try {
      const payload = getBearerTokenPayload(req);
      if (!payload?.pnIdentifier) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      const body = req.body || {};
      const contentNoticeId = body.contentNoticeId ? String(body.contentNoticeId).trim() : null;
      const dmcaTakedownRequestId = body.dmcaTakedownRequestId ? String(body.dmcaTakedownRequestId).trim() : null;
      const statement = String(body.statement ?? '').trim();
      const signature = String(body.signature ?? '').trim();
      if (!contentNoticeId && !dmcaTakedownRequestId) {
        return res.status(400).json({ error: 'Provide contentNoticeId or dmcaTakedownRequestId' });
      }
      if (!statement || !signature) {
        return res.status(400).json({ error: 'statement and signature required' });
      }
      const { createCounterNotice } = await import('./dmcaCounterNoticesService');
      const result = await createCounterNotice(payload.pnIdentifier, {
        contentNoticeId: contentNoticeId || undefined,
        dmcaTakedownRequestId: dmcaTakedownRequestId || undefined,
        statement,
        signature,
      });
      if ('error' in result) {
        return res.status(400).json({ error: result.error });
      }
      return res.status(200).json({ success: true, id: result.id, restoreAfter: result.restoreAfter });
    } catch (err: any) {
      console.error('[DMCA Counter-Notice] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to submit counter-notice' });
    }
  });

  // POST /api/dmca/counter-notices/process-restores - Admin: restore content after counter-notice window
  app.post('/api/dmca/counter-notices/process-restores', express.json(), async (req: Request, res: Response) => {
    try {
      const { isPrismAdmin } = await import('./prismAdminService');
      const payload = getBearerTokenPayload(req);
      if (!payload?.pnIdentifier || !isPrismAdmin(payload.pnIdentifier)) {
        return res.status(403).json({ error: 'Admin only' });
      }
      const {
        getCounterNoticesEligibleForRestore,
        markCounterNoticeRestored,
      } = await import('./dmcaCounterNoticesService');
      const { restoreContent } = await import('./dmcaTakedownService');
      const eligible = await getCounterNoticesEligibleForRestore();
      const restored: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const cn of eligible) {
        const result = await restoreContent(cn.file_id);
        if (result.ok) {
          await markCounterNoticeRestored(cn.id);
          restored.push(cn.id);
        } else {
          failed.push({ id: cn.id, error: result.error ?? 'Unknown' });
        }
      }
      return res.json({ success: true, restored: restored.length, restoredIds: restored, failed });
    } catch (err: any) {
      console.error('[DMCA Process Restores] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to process restores' });
    }
  });

  // PUT /api/dmca/counter-notices/:id/forward - Admin: mark counter-notice as forwarded to claimant
  app.put('/api/dmca/counter-notices/:id/forward', express.json(), async (req: Request, res: Response) => {
    try {
      const { isPrismAdmin } = await import('./prismAdminService');
      const payload = getBearerTokenPayload(req);
      if (!payload?.pnIdentifier || !isPrismAdmin(payload.pnIdentifier)) {
        return res.status(403).json({ error: 'Admin only' });
      }
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { markCounterNoticeForwarded } = await import('./dmcaCounterNoticesService');
      await markCounterNoticeForwarded(id);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[DMCA Forward] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to mark forwarded' });
    }
  });

  // POST /api/dmca/takedown/:id/process - Admin: accept claimant takedown and execute (remove from index)
  app.post('/api/dmca/takedown/:id/process', express.json(), async (req: Request, res: Response) => {
    try {
      const { isPrismAdmin } = await import('./prismAdminService');
      const payload = getBearerTokenPayload(req);
      if (!payload?.pnIdentifier || !isPrismAdmin(payload.pnIdentifier)) {
        return res.status(403).json({ error: 'Admin only' });
      }
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { getById, markProcessed, resolveInfringingRefToFileId } = await import('./dmcaTakedownRequestsService');
      const request = await getById(id);
      if (!request) return res.status(404).json({ error: 'Takedown request not found' });
      if (request.status !== 'pending') {
        return res.status(400).json({ error: 'Request already processed', status: request.status });
      }
      const fileId = resolveInfringingRefToFileId(request.infringing_content_ref);
      if (!fileId) return res.status(400).json({ error: 'Invalid infringing_content_ref' });
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const metadataService = AggregatorMetadataServiceDB.getInstance();
      const entry = await metadataService.getFileMetadata(fileId);
      if (!entry) return res.status(400).json({ error: 'File not found in index', fileId });
      const { executeTakedown } = await import('./dmcaTakedownService');
      const result = await executeTakedown(fileId, 'DMCA takedown notice (claimant request).', 'dmca_notice');
      if (!result.ok) {
        return res.status(500).json({ error: result.error || 'Takedown execution failed' });
      }
      const updated = await markProcessed(id, payload.pnIdentifier);
      if (!updated) return res.status(500).json({ error: 'Failed to mark request as processed' });
      return res.json({ success: true, fileId });
    } catch (err: any) {
      console.error('[DMCA Takedown Process] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to process takedown' });
    }
  });

  // POST /api/dmca/takedown - Submit DMCA takedown notice (no auth; public form)
  app.post('/api/dmca/takedown', express.json(), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const claimant_name = String(body.claimant_name ?? '').trim();
      const claimant_email = String(body.claimant_email ?? '').trim();
      const copyrighted_work_description = String(body.copyrighted_work_description ?? '').trim();
      const infringing_content_ref = String(body.infringing_content_ref ?? '').trim();
      const good_faith_statement = String(body.good_faith_statement ?? '').trim();
      const signature = String(body.signature ?? '').trim();
      if (!claimant_name || !claimant_email || !copyrighted_work_description || !infringing_content_ref || !good_faith_statement || !signature) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['claimant_name', 'claimant_email', 'copyrighted_work_description', 'infringing_content_ref', 'good_faith_statement', 'signature'],
        });
      }
      const { createTakedownRequest } = await import('./dmcaTakedownRequestsService');
      const id = await createTakedownRequest({
        claimant_name,
        claimant_email,
        copyrighted_work_description,
        infringing_content_ref,
        good_faith_statement,
        signature,
      });
      return res.status(200).json({ success: true, id });
    } catch (err: any) {
      console.error('[DMCA Takedown] Submit error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to submit takedown notice' });
    }
  });

}
