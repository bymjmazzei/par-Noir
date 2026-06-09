/**
 * REST routes for owned-asset registry (dashboard OAuth).
 */

import type { Application, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { OwnedAssetService, type OwnedAssetKind } from './ownedAssetService';
import { safeClientErrorMessage } from '../utils/safeError';
import { gateOwnerRoute, gateOwnerSelfRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

const KINDS: Set<string> = new Set([
  'human',
  'api_key',
  'feed',
  'device',
  'ai_agent',
  'smart_device'
]);

export function registerOwnedAssetRoutes(app: Application): void {
  const chain = [requireAuth];

  app.get('/api/owned-assets', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, pn))) return;
      const assets = await OwnedAssetService.listByRoot(pn);
      return res.json({ assets });
    } catch (e: unknown) {
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
      const asset = await OwnedAssetService.createAsset({
        rootPnIdentifier: pn,
        subjectPnIdentifier: subjectPn || null,
        kind,
        metadata
      });
      return res.status(201).json({ asset });
    } catch (e: unknown) {
      console.error('[owned-assets] create:', e);
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
      const ok = await OwnedAssetService.revokeAsset(req.params.id, pn);
      if (!ok) return res.status(404).json({ error: 'not_found', error_description: 'Asset not found or already revoked' });
      return res.json({ ok: true });
    } catch (e: unknown) {
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
      const list = await OwnedAssetService.listDelegations(req.params.id, pn);
      return res.json({ delegations: list });
    } catch (e: unknown) {
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
      const id = await OwnedAssetService.addDelegation({
        ownedAssetId: req.params.id,
        rootPn: pn,
        delegateePnIdentifier: body.delegateePnIdentifier,
        delegateeClientId: body.delegateeClientId,
        scope: typeof body.scope === 'string' ? body.scope : '*',
        expiresAt: body.expiresAt ? String(body.expiresAt) : null
      });
      return res.status(201).json({ id });
    } catch (e: unknown) {
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
      const ok = await OwnedAssetService.revokeDelegation(req.params.delegationId, pn);
      if (!ok) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (e: unknown) {
      console.error('[owned-assets] delegation revoke:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/ipfs-pointer', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pn identifier on token' });
      }
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const cid = String((req.body || {}).cid || '').trim();
      if (!cid) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'cid required' });
      }
      await OwnedAssetService.setIpfsManifestPointer(pn, cid);
      return res.json({ ok: true });
    } catch (e: unknown) {
      console.error('[owned-assets] ipfs-pointer:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });
}
