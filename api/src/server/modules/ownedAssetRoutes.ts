/**
 * AI agent routes on the owned-asset authz cache. Other owned assets live on the
 * owner's device sheet; the API holds no routes that read or write it.
 */

import type { Application, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { OwnedAssetService } from './ownedAssetService';
import { safeClientErrorMessage } from '../utils/safeError';
import { gateFirstPartyOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function registerOwnedAssetRoutes(app: Application): void {
  const chain = [requireAuth];

  app.get('/api/owned-assets/agents', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) return res.status(400).json({ error: 'invalid_request' });
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, pn))) return;
      const agents = await OwnedAssetService.listAgents(pn);
      return res.json({ agents });
    } catch (e: unknown) {
      console.error('[owned-assets] agents list:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/agents', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) return res.status(400).json({ error: 'invalid_request' });
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const body = req.body || {};
      const registration = await OwnedAssetService.registerAgent({
        rootPn: pn,
        assetId: typeof body.assetId === 'string' ? body.assetId : undefined,
        subjectPnIdentifier: String(body.subjectPnIdentifier || ''),
        subjectPublicKey: String(body.subjectPublicKey || ''),
        label: String(body.label || ''),
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
        statement: body.statement,
        signature: typeof body.signature === 'string' ? body.signature : ''
      });
      return res.status(201).json({ agent: registration });
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'INVALID_INPUT') {
        return res.status(400).json({ error: 'invalid_request', error_description: (e as Error).message });
      }
      if (code === 'FORBIDDEN') {
        return res.status(409).json({ error: 'conflict', error_description: 'Agent id already in use' });
      }
      console.error('[owned-assets] agent register:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.get('/api/owned-assets/agents/:id/connectors', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) return res.status(400).json({ error: 'invalid_request' });
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, pn))) return;
      const connectors = await OwnedAssetService.listAgentConnectors(pn, req.params.id);
      if (!connectors) return res.status(404).json({ error: 'not_found' });
      return res.json({ connectors });
    } catch (e: unknown) {
      console.error('[owned-assets] agent connectors:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/agents/revoke-all', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) return res.status(400).json({ error: 'invalid_request' });
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const revoked = await OwnedAssetService.revokeAllAgents(pn);
      return res.json({ ok: true, revoked });
    } catch (e: unknown) {
      console.error('[owned-assets] agents revoke-all:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });

  app.post('/api/owned-assets/agents/:id/revoke', ...chain, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pn = req.user?.pnIdentifier?.trim();
      if (!pn) return res.status(400).json({ error: 'invalid_request' });
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pn))) return;
      const ok = await OwnedAssetService.revokeAgent(pn, req.params.id);
      if (!ok) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (e: unknown) {
      console.error('[owned-assets] agent revoke:', e);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(e, NODE_ENV === 'production')
      });
    }
  });
}
