/**
 * Public cache reconcile. Owner and public file indexes live on the owner's cloud
 * and are read and written by the owner's device; the API has no index routes.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../../utils/safeError';
import { gateOwnerSelfRoute, DEVICE_CAPABILITIES } from '../deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function setupStorageIndexRoutes(app: Application) {
  // POST /api/storage/owner-index/:identityId/reconcile
  // Public cache ↔ cloud SoT (OAuth-less publicContentRef probe). No owner cloud access.
  app.post('/api/storage/owner-index/:identityId/reconcile', async (req: Request, res: Response) => {
    try {
      const { identityId } = req.params;
      if (!identityId) {
        return res.status(400).json({ error: 'Missing identityId parameter' });
      }

      const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
      if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

      const { reconcilePublicCacheToCloud } = await import('./reconcilePublicCacheToCloud');
      const result = await reconcilePublicCacheToCloud({ pnIdentifier });
      return res.json(result);
    } catch (error: unknown) {
      console.error('[OwnerIndexReconcile] Error:', error instanceof Error ? error.message : error);
      return res.status(500).json({
        error: 'Failed to reconcile public cache to cloud SoT',
        message: safeClientErrorMessage(error, NODE_ENV === 'production'),
      });
    }
  });
}
