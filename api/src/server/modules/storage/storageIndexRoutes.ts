/**
 * Owner/public file index HTTP routes.
 *
 * Merged reads aggregate the content-class indexes (media/thoughts/collections) and
 * fall back to the root index; writes upsert a single entry into both.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../../utils/safeError';
import {
  gateOwnerRoute,
  gateOwnerSelfRoute,
  DEVICE_CAPABILITIES,
} from '../deviceCapabilityService';
import {
  getContentClassOwnerIndex,
  getContentClassPublicIndex,
  getOwnerFileIndex,
  getPublicFileIndex,
  updateOwnerFileIndex,
  updatePublicFileIndex,
} from './fileIndexHelpers';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface StorageIndexRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
}

export function setupStorageIndexRoutes(app: Application, deps: StorageIndexRouteDeps) {
  const { extractAccountId, getMetadataFolder } = deps;

    // GET /api/storage/owner-index/:identityId - Read owner file index from Sheets (merged: content-class + root)
    app.get('/api/storage/owner-index/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;
        const contentClassFilter = req.query.contentClass as string | undefined;

        const { isPortableSocialCloud } = await import('./storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          const { handleGetOwnerIndex } = await import('./indexHttpHandlers');
          await handleGetOwnerIndex(req, res, identityId);
          return;
        }

        const { googleDriveProxyService } = await import('../googleDriveProxy');

        // Get user credentials to build token object
        const { storageCredentialsService } = await import('../storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        const { isPortableStorageProvider } = await import('./storageProviderUtils');
        const _portableSocial = await isPortableStorageProvider(pnIdentifier || '');
        if (!_portableSocial && googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Storage not connected' });
        }
        let accountId: string | undefined;
        let token: any = { access_token: '' };
        let accessToken = '';
        let out: any = null;
        if (!_portableSocial) {
          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          accountId = extractAccountId(account);
          token = {
            access_token: account?.access_token || account?.accessToken || '',
            refresh_token: account?.refresh_token || account?.refreshToken,
            expires_at: account?.expires_at,
            expires_in: account?.expires_in
          };
          accessToken = token.access_token;
          out = await getMetadataFolder(token, pnIdentifier, accountId);
        }
        if (!_portableSocial && !out) {
          return res.status(409).json({
            error: 'drive_not_initialized',
            code: 'DRIVE_INDEX_INCOMPLETE',
            message:
              'Google Drive layout is missing or was deleted. Re-save Google Drive in Storage settings to rebuild.',
          });
        }

        // Merged view: aggregate from content-class indices, fallback to root
        const contentTypes: Array<'media' | 'thoughts' | 'collections'> =
          contentClassFilter === 'media' || contentClassFilter === 'thoughts' || contentClassFilter === 'collections'
            ? [contentClassFilter]
            : ['media', 'thoughts', 'collections'];
        const allFiles: any[] = [];
        for (const contentType of contentTypes) {
          const folderQuery = `name='${contentType}' and '${out.metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (!folderRes.ok) continue;
          const folderData = await folderRes.json() as { files?: Array<{ id: string }> };
          if (!folderData.files?.length) continue;
          const idx = await getContentClassOwnerIndex(token, folderData.files[0].id, identityId, contentType, accountId);
          if (idx?.files?.length) allFiles.push(...idx.files);
        }
        if (allFiles.length > 0) {
          return res.json({ identifier: identityId, files: allFiles, updatedAt: new Date().toISOString() });
        }

        // Fallback to root owner index
        const rootIndex = await getOwnerFileIndex(token, out.metadataFolderId, identityId, accountId);
        if (!rootIndex) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }
        return res.json({ identifier: identityId, files: rootIndex.files, updatedAt: rootIndex.updatedAt });
      } catch (error: any) {
        console.error('[OwnerIndex] Error:', error?.message || error);
        const msg = error?.message || String(error);
        if (error?.name === 'DriveIndexError' && error?.code === 'DRIVE_INDEX_STALE') {
          return res.status(409).json({
            error: 'drive_index_stale',
            code: 'DRIVE_INDEX_STALE',
            message: msg,
          });
        }
        if (msg.includes('Sheet not found') || msg.includes('File not found')) {
          try {
            const rawId = req.params.identityId;
            if (rawId) {
              const stalePn = rawId.startsWith('pn-') ? rawId : `pn-${rawId}`;
              const { clearPnDriveIndex } = await import('../pnDriveIndex');
              await clearPnDriveIndex(stalePn);
            }
          } catch {
            /* best-effort */
          }
          return res.status(409).json({
            error: 'drive_index_stale',
            code: 'DRIVE_INDEX_STALE',
            message:
              'Google Drive metadata was deleted or is out of date. Re-save Google Drive in Storage settings to rebuild.',
          });
        }
        return res.status(500).json({
          error: 'Failed to read owner index',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // POST /api/storage/owner-index/:identityId/entries - Add/update entry in owner index (for dashboard)
    app.post('/api/storage/owner-index/:identityId/entries', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        const entry = req.body?.entry;
        if (!identityId || !entry) {
          return res.status(400).json({ error: 'Missing identityId or body.entry' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

        const { isPortableSocialCloud } = await import('./storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          await updateOwnerFileIndex(
            { access_token: '' },
            identityId,
            '',
            entry,
            undefined
          );
          return res.json({ ok: true });
        }

        const { googleDriveProxyService } = await import('../googleDriveProxy');
        const { storageCredentialsService } = await import('../storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };

        const out = await getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect and initialize Google Drive first.' });
        }

        await updateOwnerFileIndex(token, identityId, out.metadataFolderId, entry, accountId);
        return res.json({ ok: true });
      } catch (error: any) {
        console.error('[OwnerIndex POST] Error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to update owner index', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/storage/public-index/:identityId - Read public file index from Sheets (merged: content-class + root)
    app.get('/api/storage/public-index/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { isPortableSocialCloud } = await import('./storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          const { handleGetPublicIndex } = await import('./indexHttpHandlers');
          await handleGetPublicIndex(req, res, identityId);
          return;
        }

        const { googleDriveProxyService } = await import('../googleDriveProxy');
        const { storageCredentialsService } = await import('../storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const accessToken = token.access_token;

        const out = await getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }

        const contentTypes: Array<'media' | 'thoughts' | 'collections'> = ['media', 'thoughts', 'collections'];
        const allFiles: any[] = [];
        for (const contentType of contentTypes) {
          const folderQuery = `name='${contentType}' and '${out.metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (!folderRes.ok) continue;
          const folderData = await folderRes.json() as { files?: Array<{ id: string }> };
          if (!folderData.files?.length) continue;
          const idx = await getContentClassPublicIndex(token, folderData.files[0].id, identityId, contentType, accountId);
          if (idx?.files?.length) allFiles.push(...idx.files);
        }
        if (allFiles.length > 0) {
          return res.json({ identifier: identityId, files: allFiles, updatedAt: new Date().toISOString() });
        }

        const rootIndex = await getPublicFileIndex(token, out.metadataFolderId, identityId, accountId);
        if (!rootIndex) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }
        return res.json({ identifier: identityId, files: rootIndex.files, updatedAt: rootIndex.updatedAt });
      } catch (error: any) {
        console.error('[PublicIndex] Error:', error?.message || error);
        return res.status(500).json({
          error: 'Failed to read public index',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // POST /api/storage/public-index/:identityId/entries - Add/update entry in public index (for dashboard)
    app.post('/api/storage/public-index/:identityId/entries', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        const entry = req.body?.entry;
        if (!identityId || !entry) {
          return res.status(400).json({ error: 'Missing identityId or body.entry' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { isPortableSocialCloud } = await import('./storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;
          await updatePublicFileIndex(
            { access_token: '' },
            identityId,
            '',
            '',
            entry,
            undefined
          );
          return res.json({ ok: true });
        }

        const { googleDriveProxyService } = await import('../googleDriveProxy');
        // Get user credentials to build token object
        const { storageCredentialsService } = await import('../storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };

        const out = await getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect and initialize Google Drive first.' });
        }

        await updatePublicFileIndex(token, identityId, out.metadataFolderId, out.pnFolderId, entry, accountId);
        return res.json({ ok: true });
      } catch (error: any) {
        console.error('[PublicIndex POST] Error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to update public index', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });
}
