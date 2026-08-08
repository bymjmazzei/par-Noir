/**
 * User Routes
 * User-scoped endpoints: storage tier, subscriptions, preferences, tag
 * preferences, ZKP data points, and third-party permissions
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

export interface UserRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  driveNotInitialized: (res: express.Response) => express.Response;
}

/**
 * Setup user routes
 */
export function setupUserRoutes(app: express.Application, deps: UserRouteDeps) {
  const { extractAccountId, getMetadataFolder, driveNotInitialized } = deps;

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

    // PUT /api/users/:pnIdentifier/preferences - Save user preferences to Google Drive
    app.put('/api/users/:pnIdentifier/preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const preferences = req.body;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { PreferencesService } = await import('./preferencesService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          let userAccessToken = '';
          try {
            const resolved = await resolveOwnerDriveToken(req, normalizedPnIdentifier, {
              accountId,
              account
            });
            userAccessToken = resolved.token.access_token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }

        // Find pN folder and _metadata folder (same pattern as other endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Update preferences file
        const updatedPreferences = await PreferencesService.updatePreferencesFile(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          preferences,
          normalizedPnIdentifier,
          accountId
        );

        return res.json({ success: true, preferences: updatedPreferences });
      } catch (error: any) {
        const { respondDriveTokenError } = await import('./ownerDriveToken');
        if (respondDriveTokenError(res, error)) return;
        console.error('Error saving preferences:', error);
        return res.status(500).json({
          error: 'Failed to save preferences',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to save preferences'
        });
      }
    });

    // GET /api/users/:pnIdentifier/zkp-data-points - Get all available ZKP data points (metadata only)
    app.get('/api/users/:pnIdentifier/zkp-data-points', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { ZKPDataPointsService } = await import('./zkpDataPointsService');
        const { extractCloudAccessToken } = await import('./cloudAccessToken');
        const { loadZkpBundle } = await import('./storage/zkpStorageService');

        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, normalizedPnIdentifier))) return;

        const bundle = await loadZkpBundle(normalizedPnIdentifier, {
          accessToken: extractCloudAccessToken(req),
        });
        if (!bundle) {
          return driveNotInitialized(res);
        }
        if (!bundle.isPortable && !bundle.token?.access_token) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            details: 'Access token is missing. Please reconnect Google Drive in the dashboard.',
          });
        }

        const dataPoints = await ZKPDataPointsService.getAvailableDataPoints(
          bundle.token?.access_token || '',
          bundle.spreadsheetId || '',
          bundle.pnIdentifier,
          bundle.accountId
        );

        return res.json({ success: true, dataPoints });
      } catch (error: any) {
        console.error('Error getting ZKP data points:', error);
        return res.status(500).json({
          error: 'Failed to get ZKP data points',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get ZKP data points'
        });
      }
    });

    // GET /api/users/:pnIdentifier/zkp-data-points/:dataPointId - Get specific ZKP proof
    app.get('/api/users/:pnIdentifier/zkp-data-points/:dataPointId', async (req, res) => {
      try {
        const { pnIdentifier, dataPointId } = req.params;

        if (!pnIdentifier || !dataPointId) {
          return res.status(400).json({ error: 'pnIdentifier and dataPointId are required' });
        }

        const { ZKPDataPointsService } = await import('./zkpDataPointsService');
        const { extractCloudAccessToken } = await import('./cloudAccessToken');
        const { loadZkpBundle } = await import('./storage/zkpStorageService');

        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, normalizedPnIdentifier))) return;

        const bundle = await loadZkpBundle(normalizedPnIdentifier, {
          accessToken: extractCloudAccessToken(req),
        });
        if (!bundle) {
          return driveNotInitialized(res);
        }
        if (!bundle.isPortable && !bundle.token?.access_token) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            details: 'Access token is missing. Please reconnect Google Drive in the dashboard.',
          });
        }

        const proof = await ZKPDataPointsService.getDataPointProof(
          bundle.token?.access_token || '',
          bundle.spreadsheetId || '',
          dataPointId,
          bundle.pnIdentifier,
          bundle.accountId
        );

        if (!proof) {
          return res.status(404).json({ error: 'ZKP data point not found or expired' });
        }

        return res.json({ success: true, proof });
      } catch (error: any) {
        console.error('Error getting ZKP data point:', error);
        return res.status(500).json({
          error: 'Failed to get ZKP data point',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get ZKP data point'
        });
      }
    });

    // GET /api/users/:pnIdentifier/third-party-permissions - Get all third-party permissions
    app.get('/api/users/:pnIdentifier/third-party-permissions', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, normalizedPnIdentifier))) return;

        const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          const { extractCloudAccessToken } = await import('./cloudAccessToken');
          let userAccessToken = extractCloudAccessToken(req) || '';
          if (!userAccessToken && account) {
            try {
              userAccessToken = await googleDriveProxyService.getAccessToken(
                normalizedPnIdentifier,
                accountId
              );
            } catch {
              // Device cloud custody: OAuth secrets are device-held.
              return res.json({ success: true, permissions: {} });
            }
          }
          if (!userAccessToken) {
            return res.json({ success: true, permissions: {} });
          }

        // Find pN folder and _metadata folder (same pattern as ZKP endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.json({ success: true, permissions: {} });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!metadataFolderResponse.ok) {
          return res.json({ success: true, permissions: {} });
        }

        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
        if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
          return res.json({ success: true, permissions: {} });
        }

        const metadataFolderId = metadataFolderData.files[0].id;

        // Get permissions
        const permissions = await ThirdPartyPermissionsService.getPermissions(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          accountId
        );

        return res.json({ success: true, permissions });
      } catch (error: any) {
        console.error('Error getting third-party permissions:', error);
        return res.status(500).json({
          error: 'Failed to get third-party permissions',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get third-party permissions'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/third-party-permissions - Store or update third-party permission
    app.put('/api/users/:pnIdentifier/third-party-permissions', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const { toolId, permission } = req.body;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

        if (!toolId || !permission) {
          return res.status(400).json({ error: 'toolId and permission are required' });
        }

        const { ThirdPartyPermissionsService } = await import('./thirdPartyPermissionsService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          let token: {
            access_token: string;
            refresh_token?: string;
            expires_at?: number;
            expires_in?: number;
          };
          let userAccessToken = '';
          try {
            const resolved = await resolveOwnerDriveToken(req, normalizedPnIdentifier, {
              accountId,
              account
            });
            token = resolved.token;
            userAccessToken = resolved.token.access_token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }

        const out = await getMetadataFolder(token, normalizedPnIdentifier, accountId);
        if (!out) {
          return driveNotInitialized(res);
        }
        const metadataFolderId = out.metadataFolderId;

        // Get existing permissions
        const existingPermissions = await ThirdPartyPermissionsService.getPermissions(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          accountId
        );

        // For browser-app, ensure static required/optional data points + levels are preserved
        let finalPermission = permission;
        if (toolId === 'browser-app') {
          const { applyBrowserAppStaticContract } = await import('@par-noir/standard-data-points');
          finalPermission = applyBrowserAppStaticContract({
            ...permission,
            // dataPoints array reflects what user has granted (can change)
          });
        }

        // Update permissions
        const updatedPermissions = {
          ...existingPermissions,
          [toolId]: finalPermission
        };

        // Store permissions
        await ThirdPartyPermissionsService.storePermissions(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          updatedPermissions,
          normalizedPnIdentifier,
          accountId
        );

        return res.json({ success: true, permission });
      } catch (error: any) {
        const { respondDriveTokenError } = await import('./ownerDriveToken');
        if (respondDriveTokenError(res, error)) return;
        console.error('Error storing third-party permission:', error);
        return res.status(500).json({
          error: 'Failed to store third-party permission',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to store third-party permission'
        });
      }
    });

    // POST /api/users/:pnIdentifier/zkp-data-points/verify - Verify a ZKP proof against a condition
    app.post('/api/users/:pnIdentifier/zkp-data-points/verify', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const { dataPointId, condition } = req.body; // e.g., condition: "age >= 18"

        if (!pnIdentifier || !dataPointId || !condition) {
          return res.status(400).json({ error: 'pnIdentifier, dataPointId, and condition are required' });
        }

        const { ZKPDataPointsService } = await import('./zkpDataPointsService');
        const { extractCloudAccessToken } = await import('./cloudAccessToken');
        const { loadZkpBundle } = await import('./storage/zkpStorageService');

        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const bundle = await loadZkpBundle(normalizedPnIdentifier, {
          accessToken: extractCloudAccessToken(req),
        });
        if (!bundle) {
          return driveNotInitialized(res);
        }
        if (!bundle.isPortable && !bundle.token?.access_token) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            details: 'Access token is missing. Please reconnect Google Drive in the dashboard.',
          });
        }

        const proof = await ZKPDataPointsService.getDataPointProof(
          bundle.token?.access_token || '',
          bundle.spreadsheetId || '',
          dataPointId,
          bundle.pnIdentifier,
          bundle.accountId
        );

        if (!proof) {
          return res.status(404).json({ error: 'ZKP data point not found or expired' });
        }

        const verification = await ZKPDataPointsService.verifyProof(proof.zkpProof, condition);

        return res.json({ success: true, verification });
      } catch (error: any) {
        console.error('Error verifying ZKP proof:', error);
        return res.status(500).json({
          error: 'Failed to verify ZKP proof',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to verify ZKP proof'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/zkp-data-points/:dataPointId - Store/update ZKP data point
    app.put('/api/users/:pnIdentifier/zkp-data-points/:dataPointId', async (req, res) => {
      try {
        const { pnIdentifier, dataPointId } = req.params;
        const dataPoint = req.body; // ZKPDataPoint object

        if (!pnIdentifier || !dataPointId) {
          return res.status(400).json({ error: 'pnIdentifier and dataPointId are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

        if (!dataPoint || dataPoint.dataPointId !== dataPointId) {
          return res.status(400).json({ error: 'Invalid data point' });
        }

        const { ZKPDataPointsService } = await import('./zkpDataPointsService');
        const { extractCloudAccessToken } = await import('./cloudAccessToken');
        const { loadZkpBundle } = await import('./storage/zkpStorageService');

        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const bundle = await loadZkpBundle(normalizedPnIdentifier, {
          accessToken: extractCloudAccessToken(req),
        });
        if (!bundle) {
          return driveNotInitialized(res);
        }
        if (!bundle.isPortable && !bundle.token?.access_token) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            details: 'Access token is missing. Please reconnect Google Drive in the dashboard.',
          });
        }

        // Verified ZKPs are immutable without identity rekey / zkp_reissue
        const allowReissue = req.headers['x-pn-zkp-reissue'] === '1';
        if (!allowReissue) {
          try {
            const existing = await ZKPDataPointsService.getDataPointProof(
              bundle.token?.access_token || '',
              bundle.spreadsheetId || '',
              dataPointId,
              bundle.pnIdentifier,
              bundle.accountId
            );
            if (existing?.verificationLevel === 'verified') {
              return res.status(403).json({
                error: 'verified_immutable',
                error_description:
                  'Veriff-verified data points cannot be changed without identity rekey / rotation.',
              });
            }
          } catch {
            /* no existing row */
          }
        }

        await ZKPDataPointsService.storeDataPoint(
          bundle.token?.access_token || '',
          bundle.spreadsheetId || '',
          normalizedPnIdentifier,
          dataPoint,
          bundle.pnIdentifier,
          bundle.accountId
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error storing ZKP data point:', error);
        return res.status(500).json({
          error: 'Failed to store ZKP data point',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to store ZKP data point'
        });
      }
    });

    // GET /api/users/:pnIdentifier/preferences - Get user preferences from Google Drive
    app.get('/api/users/:pnIdentifier/preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { PreferencesService } = await import('./preferencesService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          let userAccessToken = '';
          try {
            const resolved = await resolveOwnerDriveToken(req, normalizedPnIdentifier, {
              accountId,
              account
            });
            userAccessToken = resolved.token.access_token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }

        // Find pN folder and _metadata folder (same pattern as other endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Get preferences file
        const preferences = await PreferencesService.getPreferencesFile(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier
        );

        if (!preferences) {
          return res.json({ preferences: null });
        }

        return res.json({ preferences });
      } catch (error: any) {
        const { respondDriveTokenError } = await import('./ownerDriveToken');
        if (respondDriveTokenError(res, error)) return;
        console.error('Error getting preferences:', error);
        return res.status(500).json({
          error: 'Failed to get preferences',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get preferences'
        });
      }
    });

    // POST /api/users/:pnIdentifier/tag-preferences - Save a tag preference
    app.post('/api/users/:pnIdentifier/tag-preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const { tagId, preference, action, confidence, metadata, sourceFileId } = req.body;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        if (!tagId || !preference || !action) {
          return res.status(400).json({ error: 'tagId, preference, and action are required' });
        }

        if (!['like', 'dislike', 'block', 'subscribe'].includes(preference)) {
          return res.status(400).json({ error: 'preference must be one of: like, dislike, block, subscribe' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const { PreferencesService } = await import('./preferencesService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          let userAccessToken = '';
          try {
            const resolved = await resolveOwnerDriveToken(req, normalizedPnIdentifier, {
              accountId,
              account
            });
            userAccessToken = resolved.token.access_token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }

        // Find _metadata folder
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Save tag preference to Google Drive
        await PreferencesService.addTagPreference(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          tagId.toLowerCase(),
          preference,
          action,
          {
            sourceFileId,
            confidence: confidence ?? 0.8,
            metadata
          }
        );

        return res.json({ success: true });
      } catch (error: any) {
        const { respondDriveTokenError } = await import('./ownerDriveToken');
        if (respondDriveTokenError(res, error)) return;
        console.error('Error saving tag preference:', error);
        return res.status(500).json({
          error: 'Failed to save tag preference',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to save tag preference'
        });
      }
    });

    // GET /api/users/:pnIdentifier/tag-preferences - Get all tag preferences
    app.get('/api/users/:pnIdentifier/tag-preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const { PreferencesService } = await import('./preferencesService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ preferences: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ preferences: [] });
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          let userAccessToken = '';
          try {
            const resolved = await resolveOwnerDriveToken(req, normalizedPnIdentifier, {
              accountId,
              account
            });
            userAccessToken = resolved.token.access_token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }

        // Find _metadata folder
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.json({ preferences: [] });
        }

        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.json({ preferences: [] });
        }

        // Get tag preferences from Google Drive
        const preferences = await PreferencesService.getTagPreferences(userAccessToken, metadataFolderId, normalizedPnIdentifier);

        return res.json({ preferences });
      } catch (error: any) {
        const { respondDriveTokenError } = await import('./ownerDriveToken');
        if (respondDriveTokenError(res, error)) return;
        console.error('Error getting tag preferences:', error);
        return res.status(500).json({
          error: 'Failed to get tag preferences',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get tag preferences'
        });
      }
    });

    // DELETE /api/users/:pnIdentifier/tag-preferences/:tagId - Remove a tag preference
    app.delete('/api/users/:pnIdentifier/tag-preferences/:tagId', async (req, res) => {
      try {
        const { pnIdentifier, tagId } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        if (!tagId) {
          return res.status(400).json({ error: 'tagId is required' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const { PreferencesService } = await import('./preferencesService');
        const { resolveOwnerDriveToken, respondDriveTokenError } = await import('./ownerDriveToken');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          const accountId = account ? extractAccountId(account) : undefined;
          let userAccessToken = '';
          try {
            const resolved = await resolveOwnerDriveToken(req, normalizedPnIdentifier, {
              accountId,
              account
            });
            userAccessToken = resolved.token.access_token;
          } catch (error) {
            if (respondDriveTokenError(res, error)) return;
            throw error;
          }

        // Find _metadata folder
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Remove tag preference from Google Drive
        await PreferencesService.removeTagPreference(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          tagId.toLowerCase()
        );

        return res.json({ success: true });
      } catch (error: any) {
        const { respondDriveTokenError } = await import('./ownerDriveToken');
        if (respondDriveTokenError(res, error)) return;
        console.error('Error removing tag preference:', error);
        return res.status(500).json({
          error: 'Failed to remove tag preference',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to remove tag preference'
        });
      }
    });
}
