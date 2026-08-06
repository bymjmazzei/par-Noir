/**
 * REST routes for owned-asset registry (dashboard OAuth + cloud token → Drive SoT).
 */

import type { Application, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { OwnedAssetService, type OwnedAssetKind } from './ownedAssetService';
import { safeClientErrorMessage } from '../utils/safeError';
import { gateOwnerRoute, gateOwnerSelfRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';
import { extractCloudAccessToken } from './cloudAccessToken';

const NODE_ENV = process.env.NODE_ENV || 'development';

const KINDS: Set<string> = new Set([
  'human',
  'api_key',
  'feed',
  'device',
  'ai_agent',
  'smart_device'
]);

function cloudOpts(req: AuthenticatedRequest): { accessToken?: string } {
  const accessToken = extractCloudAccessToken(req);
  return accessToken ? { accessToken } : {};
}

function mapCloudError(e: unknown, res: Response): Response | null {
  const code = (e as { code?: string }).code;
  if (code === 'CLOUD_TOKEN_REQUIRED') {
    return res.status(409).json({
      error: 'cloud_token_required',
      error_description: 'Reconnect Google Drive on this device to manage owned assets'
    });
  }
  if (code === 'DRIVE_NOT_INITIALIZED') {
    return res.status(409).json({
      error: 'drive_not_initialized',
      error_description: 'Connect storage in the dashboard first'
    });
  }
  return null;
}

export function registerOwnedAssetRoutes(app: Application): void {
  const chain = [requireAuth];

  app.get('/api/owned-assets', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, pn))) return;
      const assets = await OwnedAssetService.listByRoot(pn, cloudOpts(req));
      return res.json({ assets });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      console.error('[owned-assets] list:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const body = req.body || {};
      const kind = String(body.kind || '').trim() as OwnedAssetKind;
      if (!KINDS.has(kind) || kind === 'api_key' || kind === 'human') {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Invalid kind for this endpoint (use feed, device, ai_agent, or smart_device)'
        });
      }
      const subjectPn = body.subjectPnIdentifier ? String(body.subjectPnIdentifier).trim() : null;
      const metadata =
        body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : {};
      const asset = await OwnedAssetService.createAsset(
        {
          rootPnIdentifier: pn,
          subjectPnIdentifier: subjectPn || null,
          kind,
          metadata
        },
        cloudOpts(req)
      );
      return res.status(201).json({ asset });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      console.error('[owned-assets] create:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/:id/rekey', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const body = req.body || {};
      const newSubjectPnIdentifier = String(body.newSubjectPnIdentifier || '').trim();
      if (!newSubjectPnIdentifier) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'newSubjectPnIdentifier is required'
        });
      }
      const asset = await OwnedAssetService.rekeyAsset(
        {
          assetId: req.params.id,
          rootPn: pn,
          newSubjectPnIdentifier,
          newSubjectPublicKey:
            typeof body.newSubjectPublicKey === 'string' ? body.newSubjectPublicKey : undefined,
          reason: typeof body.reason === 'string' ? body.reason : 'rotation',
          migrateDelegations: body.migrateDelegations !== false
        },
        cloudOpts(req)
      );
      return res.status(201).json({ asset });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      const code = (e as { code?: string }).code;
      if (code === 'FORBIDDEN') {
        return res.status(404).json({ error: 'not_found', error_description: 'Asset not found or not owned' });
      }
      if (code === 'INVALID_INPUT') {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Asset cannot be rekeyed' });
      }
      console.error('[owned-assets] rekey:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/:id/revoke', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const ok = await OwnedAssetService.revokeAsset(req.params.id, pn, cloudOpts(req));
      if (!ok) return res.status(404).json({ error: 'not_found', error_description: 'Asset not found or already revoked' });
      return res.json({ ok: true });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      console.error('[owned-assets] revoke:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/:id/export-audit', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      const asset = await OwnedAssetService.getById(req.params.id);
      if (!asset || asset.rootPnIdentifier !== pn) {
        return res.status(404).json({ error: 'not_found' });
      }
      await OwnedAssetService.recordExportAudit(pn, req.params.id);
      return res.json({ ok: true });
    } catch (e: unknown) {
      console.error('[owned-assets] export-audit:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.get('/api/owned-assets/:id/delegations', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      const list = await OwnedAssetService.listDelegations(req.params.id, pn, cloudOpts(req));
      return res.json({ delegations: list });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      const err = e as { code?: string };
      if (err.code === 'FORBIDDEN') {
        return res.status(403).json({ error: 'forbidden' });
      }
      console.error('[owned-assets] delegations list:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/:id/delegations', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const body = req.body || {};
      const id = await OwnedAssetService.addDelegation(
        {
          ownedAssetId: req.params.id,
          rootPn: pn,
          delegateePnIdentifier: body.delegateePnIdentifier,
          delegateeClientId: body.delegateeClientId,
          scope: typeof body.scope === 'string' ? body.scope : '*',
          expiresAt: body.expiresAt ? String(body.expiresAt) : null
        },
        cloudOpts(req)
      );
      return res.status(201).json({ id });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      const err = e as { code?: string; message?: string };
      if (err.code === 'FORBIDDEN') {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (err.code === 'INVALID_INPUT') {
        return res.status(400).json({ error: 'invalid_request', error_description: err.message });
      }
      console.error('[owned-assets] delegation create:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.delete('/api/owned-assets/delegations/:delegationId', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const ok = await OwnedAssetService.revokeDelegation(req.params.delegationId, pn, cloudOpts(req));
      if (!ok) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (e: unknown) {
      const mapped = mapCloudError(e, res);
      if (mapped) return mapped;
      console.error('[owned-assets] delegation revoke:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });
}
