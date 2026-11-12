/**
 * POST /api/timestamp — RFC 3161 proxy for first-party apps. Takes a SHA-256 imprint (hex) and
 * returns the TSA's TimeStampToken (base64 DER). No content ever reaches the API.
 */

import type { Application, Request, Response } from 'express';
import { requireFirstPartyOAuthClient } from './deviceCapabilityService';
import { stampImprint, TimestampError } from './timestampService';
import { safeLogger } from '../../utils/logger';

export function setupTimestampRoutes(app: Application): void {
  app.post('/api/timestamp', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const imprint = String(req.body?.imprint || '').trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(imprint)) {
        return res.status(400).json({ error: 'imprint_required' });
      }
      const { token, genTime } = await stampImprint(new Uint8Array(Buffer.from(imprint, 'hex')));
      return res.json({ token: Buffer.from(token).toString('base64'), genTime });
    } catch (e) {
      const code = e instanceof TimestampError ? e.code : 'timestamp_failed';
      safeLogger.warn('[timestamp] failed', { err: code });
      return res.status(502).json({ error: code });
    }
  });
}
