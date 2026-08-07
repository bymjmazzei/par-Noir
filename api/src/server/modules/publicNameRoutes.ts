/**
 * Public name claim routes: DNS / YouTube proof, list, vanity, resolve.
 */

import type { Application, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { gateOwnerSelfRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import { PublicNameService, normalizePublicName, normalizePnIdentifier } from './publicNameService';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

function mapServiceError(e: unknown, res: Response): Response | null {
  const code = (e as { code?: string }).code || (e instanceof Error ? e.message : '');
  switch (code) {
    case 'RATE_LIMIT':
      return res.status(429).json({
        error: 'rate_limit',
        error_description: 'Too many public name requests. Try again later.',
      });
    case 'INVALID_DOMAIN':
      return res.status(400).json({
        error: 'invalid_domain',
        error_description: 'Enter a valid public domain (e.g. example.com).',
      });
    case 'PROOF_SUBJECT_TAKEN':
      return res.status(409).json({
        error: 'proof_subject_taken',
        error_description: 'This domain or YouTube channel is already linked to another identity.',
      });
    case 'NOT_FOUND':
      return res.status(404).json({ error: 'not_found', error_description: 'Public name record not found.' });
    case 'TOKEN_EXPIRED':
      return res.status(400).json({
        error: 'token_expired',
        error_description: 'Verification token expired. Start DNS verification again.',
      });
    case 'DNS_VERIFY_FAILED':
      return res.status(400).json({
        error: 'dns_verify_failed',
        error_description: 'Could not find the verification token in DNS TXT or /.well-known/parnoir-verify.txt.',
      });
    case 'YOUTUBE_API_ERROR':
      return res.status(400).json({
        error: 'youtube_api_error',
        error_description: 'YouTube API request failed. Reconnect Google and try again.',
      });
    case 'NO_YOUTUBE_CHANNEL':
      return res.status(400).json({
        error: 'no_youtube_channel',
        error_description: 'No YouTube channel found for this Google account.',
      });
    case 'NO_YOUTUBE_HANDLE':
      return res.status(400).json({
        error: 'no_youtube_handle',
        error_description: 'Your YouTube channel needs a public @handle (custom URL) before claiming.',
      });
    case 'YOUTUBE_NOT_VERIFIED':
      return res.status(400).json({
        error: 'youtube_not_verified',
        error_description: 'YouTube channel is not linked/eligible for public name verification.',
      });
    case 'NAME_TAKEN':
      return res.status(409).json({
        error: 'name_taken',
        error_description: 'That public name is already listed by another account.',
      });
    case 'NOT_PROVEN':
      return res.status(400).json({
        error: 'not_proven',
        error_description: 'Prove this name via DNS or YouTube before adding it to the directory.',
      });
    case 'NOT_LISTED':
      return res.status(400).json({
        error: 'not_listed',
        error_description: 'Add the name to the search directory before setting a profile URL.',
      });
    default:
      return null;
  }
}

export function registerPublicNameRoutes(app: Application): void {
  const auth = [requireAuth];

  app.get('/api/public-names/mine', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, pn))) return;
      const names = await PublicNameService.listMine(pn);
      return res.json({ names });
    } catch (e: unknown) {
      console.error('[public-names] mine:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.get('/api/public-names/by-pn/:pnIdentifier', async (req, res: Response) => {
    try {
      const pn = normalizePnIdentifier(String(req.params.pnIdentifier || ''));
      if (!pn) return res.json({ names: [] });
      const names = await PublicNameService.getByPnListed(pn);
      return res.json({
        names: names.map((n) => ({
          publicName: n.publicName,
          proofType: n.proofType,
          isVanity: n.isVanity,
        })),
      });
    } catch (e: unknown) {
      console.error('[public-names] by-pn:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/public-names/resolve', async (req, res: Response) => {
    try {
      const q = normalizePublicName(String(req.query.q || ''));
      const vanityOnly = String(req.query.vanity || '') === '1' || String(req.query.vanity || '') === 'true';
      if (!q) return res.json({ profile: null });
      const row = vanityOnly
        ? await PublicNameService.resolveVanity(q)
        : await PublicNameService.searchListedExact(q);
      if (!row) return res.json({ profile: null });
      return res.json({
        profile: {
          pnIdentifier: row.pnIdentifier,
          publicName: row.publicName,
          proofType: row.proofType,
          isVanity: row.isVanity,
        },
      });
    } catch (e: unknown) {
      console.error('[public-names] resolve:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/public-names/dns/start', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const domain = String(req.body?.domain || '');
      const started = await PublicNameService.startDns(pn, domain);
      return res.json(started);
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error('[public-names] dns/start:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.post('/api/public-names/dns/verify', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const domain = String(req.body?.domain || '');
      const row = await PublicNameService.completeDnsVerify(pn, domain);
      return res.json({ name: row });
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error('[public-names] dns/verify:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.post('/api/public-names/youtube/complete', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const googleAccessToken = String(req.body?.googleAccessToken || '').trim();
      if (!googleAccessToken) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'googleAccessToken is required',
        });
      }
      const row = await PublicNameService.completeYoutube(pn, googleAccessToken);
      return res.json({ name: row });
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error('[public-names] youtube/complete:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.post('/api/public-names/:name/list', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const row = await PublicNameService.listName(pn, String(req.params.name || ''));
      return res.json({ name: row });
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error('[public-names] list:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.delete('/api/public-names/:name/list', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const row = await PublicNameService.unlistName(pn, String(req.params.name || ''));
      return res.json({ name: row });
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error('[public-names] unlist:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.post('/api/public-names/:name/vanity', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const row = await PublicNameService.setVanity(pn, String(req.params.name || ''));
      return res.json({ name: row });
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error('[public-names] vanity:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });

  app.delete('/api/public-names/vanity', ...auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      await PublicNameService.clearVanity(pn);
      return res.json({ success: true });
    } catch (e: unknown) {
      console.error('[public-names] clear vanity:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production'),
      });
    }
  });
}
