/**
 * Third-party indexer routes.
 * Catalog of indexers, per-identity access grants, and per-file indexing visibility.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../utils/safeError';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function registerThirdPartyRoutes(app: Application): void {
    // Third-party indexers catalog
    app.get('/api/third-party/indexers', async (req: Request, res: Response) => {
      try {
        const { getThirdPartyIndexersService } = await import('./thirdPartyIndexersService');
        const service = getThirdPartyIndexersService();
        const identity = typeof req.query.identity === 'string' ? req.query.identity : undefined;

        const [indexers, access] = await Promise.all([
          service.listIndexers(),
          identity ? service.getAccessForIdentity(identity) : Promise.resolve([])
        ]);

        const accessMap = access.reduce<Record<string, boolean>>((acc, entry) => {
          acc[entry.thirdPartyId] = entry.isEnabled;
          return acc;
        }, {});

        const response = indexers.map((indexer) => ({
          ...indexer,
          isAuthorized: identity ? !!accessMap[indexer.id] : undefined
        }));

        res.json({
          indexers: response,
          access
        });
      } catch (error: any) {
        console.error('❌ [GET /api/third-party/indexers] Error:', error);
        res.status(500).json({
          error: 'Failed to load third-party indexers',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.put('/api/third-party/access/:identity', async (req: Request, res: Response) => {
      const identity = req.params.identity;

      if (!identity) {
        res.status(400).json({ error: 'Identity is required' });
        return;
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, identity))) {
        return;
      }

      const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

      try {
        const { getThirdPartyIndexersService } = await import('./thirdPartyIndexersService');
        const service = getThirdPartyIndexersService();
        await service.upsertAccess(identity, updates);

        const access = await service.getAccessForIdentity(identity);
        res.json({ success: true, access });
      } catch (error: any) {
        console.error('❌ [PUT /api/third-party/access] Error:', error);
        res.status(500).json({
          error: 'Failed to update third-party access',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.get('/api/third-party/files/:fileId/index-visibility', async (req: Request, res: Response) => {
      const { fileId } = req.params;

      if (!fileId) {
        res.status(400).json({ error: 'fileId parameter is required' });
        return;
      }

      try {
        const [{ AggregatorMetadataServiceDB }, { getThirdPartyIndexersService }] = await Promise.all([
          import('./aggregatorMetadataServiceDB'),
          import('./thirdPartyIndexersService')
        ]);

        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const service = getThirdPartyIndexersService();

        const metadataEntry = await aggregator.getFileMetadata(fileId);
        const overrides = await service.getFileOverrides(fileId);

        res.json({
          indexingPermissions: metadataEntry?.metadata.indexingPermissions || null,
          overrides
        });
      } catch (error: any) {
        console.error('❌ [GET /api/third-party/files/:fileId/index-visibility] Error:', error);
        res.status(500).json({
          error: 'Failed to load file indexing visibility',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    app.put('/api/third-party/files/:fileId/index-visibility', async (req: Request, res: Response) => {
      const { fileId } = req.params;
      const { indexingPermissions } = req.body || {};

      if (!fileId) {
        res.status(400).json({ error: 'fileId parameter is required' });
        return;
      }

      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite))) {
        return;
      }

      try {
        const [{ AggregatorMetadataServiceDB }, { getThirdPartyIndexersService }] = await Promise.all([
          import('./aggregatorMetadataServiceDB'),
          import('./thirdPartyIndexersService')
        ]);

        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const service = getThirdPartyIndexersService();

        const updatedMetadata = await aggregator.updateIndexingPermissions(fileId, indexingPermissions);

        // Derive overrides from permissions
        const overridesPayload: { thirdPartyId: string; isAllowed: boolean }[] = [];
        if (indexingPermissions) {
          const mode = indexingPermissions.mode || 'all';
          if (mode === 'custom') {
            (indexingPermissions.allowed || []).forEach((id: string) => {
              overridesPayload.push({ thirdPartyId: id, isAllowed: true });
            });
            (indexingPermissions.blocked || []).forEach((id: string) => {
              overridesPayload.push({ thirdPartyId: id, isAllowed: false });
            });
          } else if (mode === 'all') {
            (indexingPermissions.blocked || []).forEach((id: string) => {
              overridesPayload.push({ thirdPartyId: id, isAllowed: false });
            });
          } else if (mode === 'none') {
            // No overrides needed; absence represents full restriction.
          }
        }

        await service.setFileOverrides(fileId, overridesPayload);

        res.json({
          success: true,
          indexingPermissions: updatedMetadata?.indexingPermissions || indexingPermissions || null
        });
      } catch (error: any) {
        console.error('❌ [PUT /api/third-party/files/:fileId/index-visibility] Error:', error);
        res.status(500).json({
          error: 'Failed to update file indexing visibility',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });
}
