/**
 * Handle registry routes: first-come claims, DNS / YouTube proofs, rename, move, transfer,
 * receipts, badges, and the registry's public key.
 */

import type { Application, Request, Response } from 'express';
import { normalizePublicName } from '@par-noir/public-names';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { gateOwnerSelfRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import { FeedService } from './feedService';
import { HandleReceiptService } from './handleReceiptService';
import { ProtectedNameService } from './protectedNameService';
import { PublicNameService, normalizePnIdentifier } from './publicNameService';
import { getDatabasePool } from '../utils/database';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

const ERRORS: Record<string, [number, string, string]> = {
  RATE_LIMIT: [429, 'rate_limit', 'Too many public name requests. Try again later.'],
  INVALID_DOMAIN: [400, 'invalid_domain', 'Enter a valid public domain (e.g. example.com).'],
  INVALID_NAME: [400, 'invalid_name', 'Handles are 2–32 characters: letters, numbers, dot, dash, underscore.'],
  INVALID_INPUT: [400, 'invalid_request', 'The signed statement is missing, stale, or does not match.'],
  PROOF_SUBJECT_TAKEN: [409, 'proof_subject_taken', 'This domain or YouTube channel is already linked to another identity.'],
  NOT_FOUND: [404, 'not_found', 'Public name record not found.'],
  TOKEN_EXPIRED: [400, 'token_expired', 'Verification token expired. Start DNS verification again.'],
  DNS_VERIFY_FAILED: [
    400,
    'dns_verify_failed',
    'Could not find the verification token in DNS TXT or /.well-known/parnoir-verify.txt.'
  ],
  YOUTUBE_API_ERROR: [400, 'youtube_api_error', 'YouTube API request failed. Reconnect Google and try again.'],
  NO_YOUTUBE_CHANNEL: [400, 'no_youtube_channel', 'No YouTube channel found for this Google account.'],
  NO_YOUTUBE_HANDLE: [400, 'no_youtube_handle', 'Your YouTube channel needs a public @handle (custom URL) before claiming.'],
  YOUTUBE_NOT_VERIFIED: [400, 'youtube_not_verified', 'YouTube channel is not linked/eligible for public name verification.'],
  NAME_TAKEN: [409, 'name_taken', 'That handle, or one that looks like it, is already held.'],
  NAME_PROTECTED: [
    409,
    'name_protected',
    'That handle is reserved for a known site or person. Prove the listed domain or channel to use it.'
  ],
  NAME_RELEASED: [409, 'name_released', 'That handle was just released. Only its previous holder can take it for 30 days.'],
  NAME_DISPUTED: [409, 'name_disputed', 'That handle is in an open dispute. The current holder keeps it meanwhile.'],
  CLAIM_LIMIT: [409, 'claim_limit', 'You already hold a claimed handle. Rename or release it first.'],
  FEED_NOT_OWNED: [403, 'feed_not_owned', 'Choose one of your own feeds.'],
  FEED_REQUIRED: [409, 'feed_required', 'Open the browser once so your personal feed exists, or choose a feed.'],
  NOT_PROVEN: [400, 'not_proven', 'Prove this name via DNS or YouTube before adding it to the directory.'],
  NOT_LISTED: [400, 'not_listed', 'Add the name to the search directory before setting a profile URL.'],
  TRANSFER_PENDING: [409, 'transfer_pending', 'This handle already has a pending transfer.'],
  TRANSFER_STALE: [409, 'transfer_stale', 'The sender no longer holds this handle.'],
  SIGNING_KEY_REQUIRED: [409, 'signing_key_required', 'Unlock again so this pN can register its signing key.']
};

function mapServiceError(e: unknown, res: Response): Response | null {
  const code = (e as { code?: string }).code || (e instanceof Error ? e.message : '');
  const hit = ERRORS[code];
  if (!hit) return null;
  const details = (e as { details?: Record<string, unknown> }).details;
  return res.status(hit[0]).json({
    error: hit[1],
    error_description: hit[2],
    ...(details ? { details } : {}),
    ...(code === 'INVALID_INPUT' && e instanceof Error ? { reason: e.message } : {})
  });
}

type Handler = (req: AuthenticatedRequest, res: Response, pn: string) => Promise<Response | void>;

/** Authenticated owner route with device capability gate and shared error mapping. */
function owner(capability: string, label: string, handler: Handler) {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier' });
      }
      if (!(await gateOwnerSelfRoute(req, res, capability, pn))) return;
      return await handler(req, res, pn);
    } catch (e: unknown) {
      const mapped = mapServiceError(e, res);
      if (mapped) return mapped;
      console.error(`[public-names] ${label}:`, e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function registerPublicNameRoutes(app: Application): void {
  const auth = [requireAuth];
  const READ = DEVICE_CAPABILITIES.profileRead;
  const WRITE = DEVICE_CAPABILITIES.profileWrite;

  app.get('/.well-known/parnoir-name-registry-key', (_req: Request, res: Response) => {
    const publicKey = HandleReceiptService.publicKeyB64();
    if (!publicKey) return res.status(503).json({ error: 'registry_key_unavailable' });
    return res.json({ alg: 'ML-DSA-65', publicKey });
  });

  app.get(
    '/api/public-names/mine',
    ...auth,
    owner(READ, 'mine', async (_req, res, pn) => res.json(await PublicNameService.listMine(pn)))
  );

  app.get(
    '/api/public-names/receipts/mine',
    ...auth,
    owner(READ, 'receipts', async (_req, res, pn) =>
      res.json({
        registryPublicKey: HandleReceiptService.publicKeyB64(),
        handles: await HandleReceiptService.chainsForOwner(getDatabasePool(), normalizePnIdentifier(pn))
      })
    )
  );

  app.get(
    '/api/public-names/available/:name',
    ...auth,
    owner(READ, 'available', async (req, res, pn) =>
      res.json(await PublicNameService.checkAvailability(pn, str(req.params.name)))
    )
  );

  app.get('/api/public-names/protected/:name', async (req, res: Response) => {
    try {
      const p = await ProtectedNameService.lookupName(normalizePublicName(str(req.params.name)));
      if (!p) return res.json({ protected: false });
      return res.json({
        protected: true,
        display: p.display,
        source: p.source,
        requiredDomains: p.requiredDomains,
        requiredYoutubeChannelIds: p.requiredYoutubeChannelIds
      });
    } catch (e: unknown) {
      console.error('[public-names] protected:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/public-names/by-pn/:pnIdentifier', async (req, res: Response) => {
    try {
      const pn = normalizePnIdentifier(str(req.params.pnIdentifier));
      if (!pn) return res.json({ names: [] });
      const badges = await PublicNameService.badges(await PublicNameService.getByPnListed(pn));
      return res.json({ names: badges.map((b) => ({ ...b, publicName: b.handle })) });
    } catch (e: unknown) {
      console.error('[public-names] by-pn:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** Head receipt of a held handle: binds the handle to the key that signs its content. */
  app.get('/api/public-names/receipt/:handle', async (req, res: Response) => {
    try {
      const head = await HandleReceiptService.latestForHandle(
        getDatabasePool(),
        normalizePublicName(str(req.params.handle))
      );
      if (!head) return res.status(404).json({ error: 'not_found' });
      return res.json({ registryPublicKey: HandleReceiptService.publicKeyB64(), ...head });
    } catch (e: unknown) {
      console.error('[public-names] receipt:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/public-names/by-feed/:feedId', async (req, res: Response) => {
    try {
      const badges = await PublicNameService.badges(await PublicNameService.getByFeedListed(str(req.params.feedId)));
      return res.json({ names: badges });
    } catch (e: unknown) {
      console.error('[public-names] by-feed:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /** A feed by one of its handles (replaces feed subdomains). */
  app.get('/api/feeds/by-handle/:handle', async (req, res: Response) => {
    try {
      const row = await PublicNameService.searchListedExact(str(req.params.handle));
      if (!row?.feedId) return res.status(404).json({ error: 'Feed not found for this handle' });
      const feed = await FeedService.getFeedById(row.feedId);
      if (!feed) return res.status(404).json({ error: 'Feed not found for this handle' });
      const [badge] = await PublicNameService.badges([row]);
      return res.json({ feed, handle: badge });
    } catch (e: unknown) {
      console.error('[public-names] by-handle:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Profile lookup by handle. `pnIdentifier` stays in the response for connect and creator view
   * until posts are authored by the feed sub-pN.
   */
  app.get('/api/public-names/resolve', async (req, res: Response) => {
    try {
      const q = normalizePublicName(str(req.query.q));
      const vanityOnly = str(req.query.vanity) === '1' || str(req.query.vanity) === 'true';
      if (!q) return res.json({ profile: null });
      const row = vanityOnly ? await PublicNameService.resolveVanity(q) : await PublicNameService.searchListedExact(q);
      if (!row) return res.json({ profile: null });
      const [badge] = await PublicNameService.badges([row]);
      return res.json({
        profile: {
          ...badge,
          pnIdentifier: row.pnIdentifier,
          publicName: row.publicName
        }
      });
    } catch (e: unknown) {
      console.error('[public-names] resolve:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post(
    '/api/public-names/claim',
    ...auth,
    owner(WRITE, 'claim', async (req, res, pn) => {
      const out = await PublicNameService.claim(pn, str(req.body?.name), str(req.body?.feedId) || null);
      return res.status(201).json(out);
    })
  );

  app.post(
    '/api/public-names/dns/start',
    ...auth,
    owner(WRITE, 'dns/start', async (req, res, pn) =>
      res.json(await PublicNameService.startDns(pn, str(req.body?.domain)))
    )
  );

  app.post(
    '/api/public-names/dns/verify',
    ...auth,
    owner(WRITE, 'dns/verify', async (req, res, pn) =>
      res.json({ name: await PublicNameService.completeDnsVerify(pn, str(req.body?.domain)) })
    )
  );

  app.post(
    '/api/public-names/youtube/complete',
    ...auth,
    owner(WRITE, 'youtube/complete', async (req, res, pn) => {
      const googleAccessToken = str(req.body?.googleAccessToken).trim();
      if (!googleAccessToken) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'googleAccessToken is required' });
      }
      return res.json({ name: await PublicNameService.completeYoutube(pn, googleAccessToken) });
    })
  );

  app.post(
    '/api/public-names/transfers',
    ...auth,
    owner(WRITE, 'transfer', async (req, res, pn) =>
      res.status(201).json(await PublicNameService.createTransfer(pn, req.body?.statement, str(req.body?.signature)))
    )
  );

  app.get(
    '/api/public-names/signing-key',
    ...auth,
    owner(READ, 'signing-key', async (_req, res, pn) =>
      res.json({ signingKey: await PublicNameService.signingKey(pn) })
    )
  );

  app.put(
    '/api/public-names/signing-key',
    ...auth,
    owner(WRITE, 'signing-key', async (req, res, pn) =>
      res.json(
        await PublicNameService.registerSigningKey(
          pn,
          req.body?.statement,
          str(req.body?.rootPublicKey),
          str(req.body?.rootSignature),
          str(req.body?.keySignature) || null
        )
      )
    )
  );

  app.post(
    '/api/public-names/transfers/:id/accept',
    ...auth,
    owner(WRITE, 'transfer/accept', async (req, res, pn) => {
      const out = await PublicNameService.acceptTransfer(pn, str(req.params.id), {
        feedId: str(req.body?.feedId) || null,
        googleAccessToken: str(req.body?.googleAccessToken) || null
      });
      return res.status(out.status === 'completed' ? 200 : 202).json(out);
    })
  );

  app.delete(
    '/api/public-names/transfers/:id',
    ...auth,
    owner(WRITE, 'transfer/cancel', async (req, res, pn) => {
      await PublicNameService.cancelTransfer(pn, str(req.params.id));
      return res.json({ success: true });
    })
  );

  app.post(
    '/api/public-names/:name/list',
    ...auth,
    owner(WRITE, 'list', async (req, res, pn) =>
      res.json(await PublicNameService.listName(pn, str(req.params.name), str(req.body?.feedId) || null))
    )
  );

  app.delete(
    '/api/public-names/:name/list',
    ...auth,
    owner(WRITE, 'unlist', async (req, res, pn) =>
      res.json({ name: await PublicNameService.unlistName(pn, str(req.params.name)) })
    )
  );

  app.post(
    '/api/public-names/:name/rename',
    ...auth,
    owner(WRITE, 'rename', async (req, res, pn) =>
      res.json(await PublicNameService.rename(pn, str(req.params.name), str(req.body?.newName)))
    )
  );

  app.put(
    '/api/public-names/:name/feed',
    ...auth,
    owner(WRITE, 'move', async (req, res, pn) => {
      const feedId = str(req.body?.feedId).trim();
      if (!feedId) return res.status(400).json({ error: 'invalid_request', error_description: 'feedId is required' });
      return res.json(await PublicNameService.moveToFeed(pn, str(req.params.name), feedId));
    })
  );

  app.post(
    '/api/public-names/:name/vanity',
    ...auth,
    owner(WRITE, 'vanity', async (req, res, pn) =>
      res.json({ name: await PublicNameService.setVanity(pn, str(req.params.name)) })
    )
  );

  app.delete(
    '/api/public-names/vanity',
    ...auth,
    owner(WRITE, 'clear vanity', async (_req, res, pn) => {
      await PublicNameService.clearVanity(pn);
      return res.json({ success: true });
    })
  );
}
