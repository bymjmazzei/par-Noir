/**
 * Identity verification API: Stripe Identity sessions, owner decision fetch (issues the user-held
 * credential), and credential present / reissue. Stripe Identity webhooks arrive on the Stripe
 * monetization webhook and only book cost.
 */

import type { Application, Request, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { safeClientErrorMessage } from '../utils/safeError';
import { requireAdminApiKey } from './adminDeveloperRoutes';
import { StripeIdentityService, stripeIdentityConfigured } from './stripeIdentityService';
import { VerificationCredentialService } from './verificationCredentialService';

const CREDENTIAL_ERRORS: Record<string, number> = {
  INVALID_CREDENTIAL: 400,
  CREDENTIAL_SUBJECT_MISMATCH: 403,
  NOT_SUCCESSOR: 403,
  CREDENTIAL_REVOKED: 403,
  CREDENTIAL_EXPIRED: 400
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_RETURN_URL = 'https://pn.parnoir.com/?verification=identity_return';

function pnFromReq(req: AuthenticatedRequest): string | null {
  const raw = req.user?.pnIdentifier?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Where Stripe sends the user after the hosted flow. */
function returnUrlFromBody(req: Request): string {
  const u = req.body?.return_url;
  if (typeof u === 'string' && u.trim()) {
    try {
      const parsed = new URL(u.trim());
      if (parsed.protocol === 'https:' || (NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
        return parsed.toString();
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_RETURN_URL;
}

function notConfigured(res: Response): Response {
  return res.status(503).json({
    error: 'service_unavailable',
    error_description: 'Identity verification is not configured on this deployment'
  });
}

export function registerVerificationRoutes(app: Application): void {
  app.post('/api/verification/session', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const pn = pnFromReq(req);
    if (!pn) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
    }
    if (!stripeIdentityConfigured()) return notConfigured(res);
    try {
      const out = await StripeIdentityService.createSession(pn, returnUrlFromBody(req));
      return res.json({ url: out.url, sessionId: out.sessionId, state: out.state });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'membership_required') {
        return res.status(402).json({
          error: 'membership_required',
          error_description: 'An active membership is required before identity verification.'
        });
      }
      if (msg === 'already_verified') {
        return res.status(409).json({ error: 'already_verified', error_description: 'This pN is already verified.' });
      }
      if (msg === 'identity_upstream_error') {
        return res.status(502).json({ error: 'upstream_error', error_description: 'Failed to create verification session' });
      }
      console.error('[StripeIdentity] session:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/verification/decision', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const pn = pnFromReq(req);
    if (!pn) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
    }
    if (!stripeIdentityConfigured()) return notConfigured(res);
    try {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await StripeIdentityService.decisionFromState(pn, req.body?.state));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'invalid_state') {
        return res.status(400).json({ error: 'invalid_state', error_description: 'Unknown or expired verification session' });
      }
      if (msg === 'identity_upstream_error') {
        return res.status(502).json({ error: 'upstream_error', error_description: 'Failed to fetch verification decision' });
      }
      console.error('[StripeIdentity] decision:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  const credentialRoute =
    (handler: (pn: string, credential: unknown) => Promise<unknown>) =>
    async (req: AuthenticatedRequest, res: Response) => {
      const pn = pnFromReq(req);
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      try {
        res.setHeader('Cache-Control', 'no-store');
        return res.json(await handler(pn, req.body?.credential));
      } catch (e: unknown) {
        const code = (e as { code?: string }).code || '';
        const status = CREDENTIAL_ERRORS[code];
        if (status) return res.status(status).json({ error: code.toLowerCase() });
        console.error('[verification] credential:', e instanceof Error ? e.message : 'unknown');
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
        });
      }
    };

  /** Restore this pN's verified flag from the credential it holds. */
  app.post(
    '/api/verification/credential/present',
    requireAuth,
    credentialRoute((pn, credential) => VerificationCredentialService.present(pn, credential))
  );

  /** Successor pN exchanges its predecessor's credential for one issued to itself. */
  app.post(
    '/api/verification/credential/reissue',
    requireAuth,
    credentialRoute((pn, credential) => VerificationCredentialService.reissue(pn, credential))
  );
}

/** POST /api/verification/sync - Sync verification status to engagement system (admin only). */
export function registerVerificationSyncRoute(app: Application): void {
  app.post('/api/verification/sync', requireAdminApiKey, async (req: Request, res: Response) => {
    try {
      const { VerificationIntegrationService } = await import('./verificationIntegrationService');
      const { identityId, verificationId, verifiedAt, expiresAt } = req.body;

      if (!identityId || !verificationId || !verifiedAt) {
        return res.status(400).json({ error: 'identityId, verificationId, and verifiedAt are required' });
      }

      await VerificationIntegrationService.syncVerificationStatus(
        identityId,
        verificationId,
        verifiedAt,
        typeof expiresAt === 'string' ? expiresAt : null
      );

      return res.json({ success: true, message: 'Verification status synced' });
    } catch (error: any) {
      console.error('Error syncing verification status:', error);
      return res.status(500).json({ error: 'Failed to sync verification status', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
    }
  });
}
