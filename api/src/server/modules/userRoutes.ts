/**
 * User Routes
 * User-scoped endpoints: storage tier, subscriptions, third-party grants, and
 * the ZK proofs the owner's device releases under them. Preferences and held
 * proofs live in the user's cloud and are read on the device.
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import {
  gateOwnerRoute,
  gateOwnerSelfRoute,
  DEVICE_CAPABILITIES,
} from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

/**
 * Setup user routes
 */
export function setupUserRoutes(app: express.Application) {

    // GET /api/users/:userPnIdentifier/storage-tier - Get encryption limit (derived from feed creator tier)
    app.get('/api/users/:userPnIdentifier/storage-tier', async (req, res) => {
      try {
        const payload = getBearerTokenPayload(req);
        if (!payload?.pnIdentifier) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        const { userPnIdentifier } = req.params;
        const id = userPnIdentifier === 'me' ? payload.pnIdentifier : userPnIdentifier;
        if (id !== payload.pnIdentifier && id !== payload.did) {
          return res.status(403).json({ error: 'Can only request your own storage tier' });
        }
        const { getStorageTier } = await import('./storageTierService');
        const result = await getStorageTier(payload.pnIdentifier, payload.did);
        return res.json(result);
      } catch (err: any) {
        console.error('[StorageTier] Error:', err);
        return res.status(500).json({ error: err?.message || 'Failed to get storage tier' });
      }
    });

    // GET /api/users/:userPnIdentifier/subscriptions - Get user's subscriptions
    app.get('/api/users/:userPnIdentifier/subscriptions', async (req, res) => {
      try {
        const { FeedService } = await import('./feedService');
        const { userPnIdentifier } = req.params;

        const feeds = await FeedService.getUserSubscriptions(userPnIdentifier);

        return res.json({
          userPnIdentifier,
          feeds,
          count: feeds.length
        });
      } catch (error: any) {
        console.error('Error getting user subscriptions:', error);
        return res.status(500).json({ error: 'Failed to get subscriptions', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/users/:pnIdentifier/third-party-permissions - Every grant this pN has made
    app.get('/api/users/:pnIdentifier/third-party-permissions', async (req, res) => {
      try {
        const normalizedPnIdentifier = normalizePn(req.params.pnIdentifier);
        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, normalizedPnIdentifier))) return;

        const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
        const permissions = await ThirdPartyPermissionsService.getPermissions(normalizedPnIdentifier);
        return res.json({ success: true, permissions });
      } catch (error: any) {
        console.error('Error getting third-party permissions:', error);
        return res.status(500).json({
          error: 'Failed to get third-party permissions',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get third-party permissions'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/third-party-permissions - Store or update one grant
    app.put('/api/users/:pnIdentifier/third-party-permissions', async (req, res) => {
      try {
        const normalizedPnIdentifier = normalizePn(req.params.pnIdentifier);
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalizedPnIdentifier))) return;

        const { toolId, permission } = req.body || {};
        if (typeof toolId !== 'string' || !toolId || !permission || typeof permission !== 'object') {
          return res.status(400).json({ error: 'toolId and permission are required' });
        }
        if (!['active', 'pending', 'revoked'].includes(permission.status)) {
          return res.status(400).json({ error: 'permission.status must be active, pending, or revoked' });
        }

        // First-party apps have a static contract; dataPoints still reflects what
        // the user granted and remains editable.
        const { applyStaticContract } = await import('@par-noir/standard-data-points');
        const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
        const finalPermission = applyStaticContract(toolId, {
          ...permission,
          toolId,
          dataPoints: Array.isArray(permission.dataPoints) ? permission.dataPoints : [],
          requiredDataPoints: Array.isArray(permission.requiredDataPoints) ? permission.requiredDataPoints : [],
          optionalDataPoints: Array.isArray(permission.optionalDataPoints) ? permission.optionalDataPoints : [],
          permissions: Array.isArray(permission.permissions) ? permission.permissions : [],
        });
        await ThirdPartyPermissionsService.storePermission(normalizedPnIdentifier, finalPermission);

        return res.json({ success: true, permission: finalPermission });
      } catch (error: any) {
        console.error('Error storing third-party permission:', error);
        return res.status(500).json({
          error: 'Failed to store third-party permission',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to store third-party permission'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/released-proofs - The device releases its held proofs
    // for data points the user has granted. Proofs nobody was granted are dropped.
    app.put('/api/users/:pnIdentifier/released-proofs', async (req, res) => {
      try {
        const normalizedPnIdentifier = normalizePn(req.params.pnIdentifier);
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalizedPnIdentifier))) return;

        const proofs = req.body?.proofs;
        if (!Array.isArray(proofs) || proofs.length > 200) {
          return res.status(400).json({ error: 'proofs must be an array of at most 200 entries' });
        }

        const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
        const released = await ThirdPartyPermissionsService.releaseProofs(normalizedPnIdentifier, proofs);
        return res.json({ success: true, released });
      } catch (error: any) {
        console.error('Error releasing proofs:', error);
        return res.status(500).json({
          error: 'Failed to release proofs',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to release proofs'
        });
      }
    });

    // POST /api/users/:pnIdentifier/zkp-data-points/verify - Verify a ZKP proof against a condition
    app.post('/api/users/:pnIdentifier/zkp-data-points/verify', async (req, res) => {
      try {
        const normalizedPnIdentifier = normalizePn(req.params.pnIdentifier);
        const { dataPointId, condition, zkpProof } = req.body || {};
        if (typeof condition !== 'string' || !condition || (!zkpProof && !dataPointId)) {
          return res.status(400).json({ error: 'condition and either zkpProof or dataPointId are required' });
        }

        let proof: string | undefined = typeof zkpProof === 'string' && zkpProof ? zkpProof : undefined;
        if (!proof) {
          const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
          const released = await ThirdPartyPermissionsService.getReleasedProofs(normalizedPnIdentifier);
          proof = released.find((p) => p.dataPointId === dataPointId)?.zkpProof;
        }
        if (!proof) {
          return res.status(404).json({ error: 'ZKP data point not found or expired' });
        }

        const { ZKPDataPointsService } = await import('./zkpDataPointsService');
        const verification = await ZKPDataPointsService.verifyProof(proof, condition);
        return res.json({ success: true, verification });
      } catch (error: any) {
        console.error('Error verifying ZKP proof:', error);
        return res.status(500).json({
          error: 'Failed to verify ZKP proof',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to verify ZKP proof'
        });
      }
    });
}
