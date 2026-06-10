/**
 * Identity verification API (Veriff session proxy + webhook scaffold).
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';
const VERIFF_API_KEY = process.env.VERIFF_API_KEY || '';
const VERIFF_ENABLED = process.env.VERIFF_ENABLED === 'true' || !!VERIFF_API_KEY;

export function registerVerificationRoutes(app: Application): void {
  app.post('/api/verification/veriff/session', async (req: Request, res: Response) => {
    try {
      if (!VERIFF_ENABLED || !VERIFF_API_KEY) {
        return res.status(503).json({
          error: 'service_unavailable',
          error_description: 'Veriff identity verification is not configured on this deployment'
        });
      }
      const identityId = String((req.body || {}).identityId || '').trim() || 'unknown';
      const callbackBase = process.env.VERIFF_CALLBACK_URL || process.env.API_PUBLIC_URL || '';
      const callback = callbackBase
        ? `${callbackBase.replace(/\/$/, '')}/api/verification/veriff/webhook`
        : undefined;

      const response = await fetch('https://stationapi.veriff.com/v1/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERIFF_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          verification: {
            callback,
            vendorData: identityId
          }
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[Veriff] session create failed:', response.status, text);
        return res.status(502).json({
          error: 'upstream_error',
          error_description: 'Failed to create Veriff session'
        });
      }

      const session = await response.json();
      const url = session?.verification?.url;
      return res.json({ url, verification: session?.verification });
    } catch (e: unknown) {
      console.error('[Veriff] session:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/verification/veriff/webhook', async (req: Request, res: Response) => {
    try {
      // Webhook signature validation would go here when Veriff is production-ready.
      console.log('[Veriff] webhook received');
      return res.json({ ok: true });
    } catch (e: unknown) {
      console.error('[Veriff] webhook:', e);
      return res.status(500).json({ ok: false });
    }
  });
}
