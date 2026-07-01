/**
 * Integrator-facing routes (L5 storage root, etc.)
 */

import { Application, Request, Response } from 'express';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { googleDriveProxyService } from './googleDriveProxy';
import { IntegratorFolderService, IntegratorStorageError } from './integratorFolderService';
import {
  integratorPathLabel,
  isFirstPartyClient,
  normalizePnIdentifier,
  scopesIncludeCloudApp,
  SCOPE_CLOUD_APP
} from './integratorStoragePaths';
import { integratorStorageErrorResponse } from './integratorDriveContext';
import { isPnDriveIndexComplete, loadPnDriveIndex } from './pnDriveIndex';

export function registerIntegratorRoutes(app: Application): void {
  /**
   * GET /api/integrator/storage-root
   * Bearer token with cloud:app — returns integrator silo folder id and path.
   */
  app.get('/api/integrator/storage-root', async (req: Request, res: Response) => {
    try {
      const tokenPayload = getBearerTokenPayload(req);
      if (!tokenPayload) {
        return res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid or expired access token'
        });
      }

      if (isFirstPartyClient(tokenPayload.clientId)) {
        return res.status(400).json({
          error: 'invalid_client',
          error_description: 'First-party clients do not use integrator storage silos'
        });
      }

      if (!scopesIncludeCloudApp(tokenPayload.scope)) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: `Scope ${SCOPE_CLOUD_APP} is required`
        });
      }

      const pnIdentifier = tokenPayload.pnIdentifier;
      if (!pnIdentifier) {
        return res.status(400).json({
          error: 'pnIdentifier required',
          error_description: 'Token must include pnIdentifier'
        });
      }

      const normalized = normalizePnIdentifier(pnIdentifier);
      const accountId =
        typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

      const accessToken = await googleDriveProxyService.getAccessToken(
        normalized,
        accountId,
        [normalized]
      );

      const index = await loadPnDriveIndex(normalized);
      if (!isPnDriveIndexComplete(index)) {
        return res.status(409).json({
          error: 'drive_not_initialized',
          error_description: 'Google Drive storage not initialized. Connect storage in the dashboard first.'
        });
      }

      const result = await IntegratorFolderService.ensureIntegratorFolder(
        accessToken,
        normalized,
        tokenPayload.clientId,
        accountId,
        index
      );

      return res.json({
        integratorFolderId: result.integratorFolderId,
        integratorPath: result.integratorPath,
        clientId: tokenPayload.clientId
      });
    } catch (err) {
      if (err instanceof IntegratorStorageError) {
        const { status, body } = integratorStorageErrorResponse(err);
        return res.status(status).json(body);
      }
      console.error('[integrator] storage-root:', err);
      return res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to resolve integrator storage root'
      });
    }
  });
}

export { integratorPathLabel };
