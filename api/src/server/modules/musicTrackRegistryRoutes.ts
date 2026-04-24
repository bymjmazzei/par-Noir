/**
 * REST: licensed track registry (licensing-portal OAuth client + Bearer).
 */

import type { Application, NextFunction, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { MusicTrackRegistryService, type MusicTrackStatus } from './musicTrackRegistryService';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

const LICENSING_CLIENT_ID = 'licensing-portal';

function requireLicensingPortalClient(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const cid = req.user?.clientId?.trim();
  if (cid !== LICENSING_CLIENT_ID) {
    res.status(403).json({
      error: 'invalid_client',
      error_description: 'Track registry requires tokens issued to the licensing-portal OAuth client.'
    });
    return;
  }
  next();
}

function parseStatus(q: unknown): MusicTrackStatus | undefined {
  if (typeof q !== 'string' || !q.trim()) return undefined;
  const s = q.trim() as MusicTrackStatus;
  if (s === 'draft' || s === 'active' || s === 'retired') return s;
  return undefined;
}

export function registerMusicTrackRegistryRoutes(app: Application): void {
  const chain = [requireAuth, requireLicensingPortalClient];

  app.get('/api/v1/music/registry/tracks', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      const status = parseStatus(req.query.status);
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
      const tracks = await MusicTrackRegistryService.listByOwner(pn, { status, limit, offset });
      return res.json({ tracks });
    } catch (e: unknown) {
      console.error('[music-registry] list:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/v1/music/registry/tracks', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      const body = req.body || {};
      const track = await MusicTrackRegistryService.create(pn, {
        title: String(body.title ?? ''),
        displayArtist: body.displayArtist != null ? String(body.displayArtist) : undefined,
        isrc: body.isrc != null ? String(body.isrc) : undefined,
        status: parseStatus(body.status),
        splitsMetadata: body.splitsMetadata
      });
      return res.status(201).json({ track });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'title_required') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'title is required'
        });
      }
      if (msg === 'invalid_status') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'status must be draft, active, or retired'
        });
      }
      console.error('[music-registry] create:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.patch('/api/v1/music/registry/tracks/:trackId', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing pn identifier on token'
        });
      }
      const { trackId } = req.params;
      if (!trackId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'trackId required' });
      }
      const body = req.body || {};
      const patch: {
        title?: string;
        displayArtist?: string | null;
        isrc?: string | null;
        status?: MusicTrackStatus;
        splitsMetadata?: unknown;
      } = {};
      if (body.title !== undefined) patch.title = String(body.title);
      if (body.displayArtist !== undefined) {
        patch.displayArtist = body.displayArtist === null ? null : String(body.displayArtist);
      }
      if (body.isrc !== undefined) {
        patch.isrc = body.isrc === null ? null : String(body.isrc);
      }
      if (body.status !== undefined) {
        const st = parseStatus(body.status);
        if (!st) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'status must be draft, active, or retired'
          });
        }
        patch.status = st;
      }
      if (body.splitsMetadata !== undefined) patch.splitsMetadata = body.splitsMetadata;

      const track = await MusicTrackRegistryService.update(trackId, pn, patch);
      if (!track) {
        return res.status(404).json({
          error: 'not_found',
          error_description: 'Track not found or not owned by this identity'
        });
      }
      return res.json({ track });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'title_required') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'title is required'
        });
      }
      if (msg === 'invalid_status') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'status must be draft, active, or retired'
        });
      }
      console.error('[music-registry] patch:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });
}
