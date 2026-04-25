/**
 * Creator fund period allocator — cron or admin; no Stripe.
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { requireAdminApiKey } from './adminDeveloperRoutes';
import { CreatorFundPeriodService } from './creatorFundPeriodService';
import { safeClientErrorMessage } from '../utils/safeError';
const NODE_ENV = process.env.NODE_ENV || 'development';

/** Cron job (X-Cron-Secret) or operator (admin API key). */
function requireCronOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CREATOR_FUND_CRON_SECRET?.trim();
  const provided = (req.headers['x-cron-secret'] as string | undefined)?.trim();
  if (secret && provided === secret) {
    next();
    return;
  }
  requireAdminApiKey(req, res, next);
}

export function registerCreatorFundPeriodRoutes(app: Application): void {
  app.post('/api/creator-fund/periods/close', requireCronOrAdmin, async (req: Request, res: Response) => {
    try {
      const out = await CreatorFundPeriodService.closeIfDue();
      return res.json(out);
    } catch (e: unknown) {
      console.error('[creator-fund] close period:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/creator-fund/opex', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const amountCents = Number(body.amount_cents ?? body.amountCents);
      const category = String(body.category ?? '');
      const note = body.note != null ? String(body.note) : undefined;
      let effectiveAt: Date | undefined;
      if (body.effective_at || body.effectiveAt) {
        const t = new Date(String(body.effective_at || body.effectiveAt));
        if (!Number.isNaN(t.getTime())) effectiveAt = t;
      }
      const row = await CreatorFundPeriodService.recordOpex({ amountCents, category, note, effectiveAt });
      return res.status(201).json(row);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'invalid_amount' || msg === 'category_required') {
        return res.status(400).json({ error: 'invalid_request', error_description: msg });
      }
      console.error('[creator-fund] opex:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.get('/api/creator-fund/periods/recent', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseInt(String(_req.query.limit || '6'), 10);
      const rows = await CreatorFundPeriodService.listRecentClosed(Number.isFinite(limit) ? limit : 6);
      return res.json({ periods: rows });
    } catch (e: unknown) {
      console.error('[creator-fund] recent periods:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  /** Admin-only recent periods for internal ops dashboards (no user bearer token needed). */
  app.get('/api/admin/creator-fund/periods/recent', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(String(req.query.limit || '6'), 10);
      const rows = await CreatorFundPeriodService.listRecentClosed(Number.isFinite(limit) ? limit : 6);
      return res.json({ periods: rows });
    } catch (e: unknown) {
      console.error('[creator-fund] admin recent periods:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  /** JSON export for a closed period (ledger / reporting). Cron secret or admin API key. */
  app.get('/api/creator-fund/periods/:periodId/allocations', requireCronOrAdmin, async (req: Request, res: Response) => {
    try {
      const periodId = String(req.params.periodId || '').trim();
      if (!periodId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'periodId required' });
      }
      const out = await CreatorFundPeriodService.getClosedPeriodAllocationsExport(periodId);
      if (!out) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'Closed period not found'
        });
      }
      return res.json(out);
    } catch (e: unknown) {
      console.error('[creator-fund] period allocations export:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });
}
