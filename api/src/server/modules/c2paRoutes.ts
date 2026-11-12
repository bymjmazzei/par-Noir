/**
 * POST /api/c2pa/sign   — Pen's claim signer: claim bytes (+ the pN author assertion) in, a
 *                         timestamped COSE_Sign1 by the Pen certificate out. Media never arrives.
 * POST /api/c2pa/verify — raw file bytes (Content-Type = media type) in, ManifestSummary out.
 * Both are first-party only.
 */

import express, { type Application, type Request, type Response } from 'express';
import { requireFirstPartyOAuthClient } from './deviceCapabilityService';
import { C2paError, MAX_VERIFY_BYTES, checkPenClaim, signClaimCose, verifyAsset } from './c2paService';
import { TimestampError } from './timestampService';
import { safeLogger } from '../../utils/logger';

const SIGN_ERROR_STATUS: Record<C2paError['code'], number> = {
  signer_unconfigured: 503,
  claim_invalid: 400,
  not_pen_claim: 400,
  author_invalid: 400,
  author_not_caller: 403,
  author_refs_mismatch: 400,
  identity_unchecked: 400,
  reserve_invalid: 400,
  reserve_too_small: 400
};

export function setupC2paRoutes(app: Application): void {
  app.post('/api/c2pa/sign', async (req: Request, res: Response) => {
    const auth = requireFirstPartyOAuthClient(req, res);
    if (!auth) return;
    try {
      const claimB64 = req.body?.claim;
      if (typeof claimB64 !== 'string' || !claimB64) return res.status(400).json({ error: 'claim_required' });
      const claim = new Uint8Array(Buffer.from(claimB64, 'base64'));
      const author = req.body?.author ?? null;
      await checkPenClaim(claim, author, auth.pnIdentifier);
      const cose = await signClaimCose(claim, Number(req.body?.reserveSize));
      return res.json({ cose: Buffer.from(cose).toString('base64') });
    } catch (e) {
      if (e instanceof C2paError) return res.status(SIGN_ERROR_STATUS[e.code]).json({ error: e.code });
      if (e instanceof TimestampError) return res.status(502).json({ error: e.code });
      safeLogger.warn('[c2pa] sign failed', { err: e instanceof Error ? e.message : String(e) });
      return res.status(500).json({ error: 'sign_failed' });
    }
  });

  app.post(
    '/api/c2pa/verify',
    express.raw({ type: () => true, limit: MAX_VERIFY_BYTES }),
    async (req: Request, res: Response) => {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!Buffer.isBuffer(req.body) || !req.body.length || !/^(image|video|audio|application)\//.test(mimeType)) {
        return res.status(400).json({ error: 'media_required' });
      }
      try {
        return res.json({ summary: await verifyAsset(new Uint8Array(req.body), mimeType) });
      } catch (e) {
        safeLogger.warn('[c2pa] verify failed', { err: e instanceof Error ? e.message : String(e) });
        return res.status(500).json({ error: 'verify_failed' });
      }
    }
  );
}
