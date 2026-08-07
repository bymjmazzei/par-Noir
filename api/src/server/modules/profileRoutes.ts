/**
 * Profile Routes
 * Profile image, display name, ML-KEM messaging public key, profile lookup and
 * profile search. Profiles live in the owner's Drive _metadata folder and are
 * mirrored into user_profiles for fast lookups.
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';
import {
  gateOwnerRoute,
  gateOwnerSelfRoute,
  DEVICE_CAPABILITIES,
} from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface ProfileRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
}

export function setupProfileRoutes(app: express.Application, deps: ProfileRouteDeps) {
  const { extractAccountId, getMetadataFolder } = deps;

    // POST /api/profile/image - Set profile image fileId
    app.post('/api/profile/image', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

        const { ProfileService } = await import('./profileService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
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
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';

        // Find metadata folder
        const folderQuery = `name='Metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
        const folderResponse = await fetch(folderUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!folderResponse.ok) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }

        const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
        if (!folderData.files || folderData.files.length === 0) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }

        const metadataFolderId = folderData.files[0].id;

        // Update profile image (use normalized pnIdentifier)
        await ProfileService.updateProfileImage(
          userAccessToken,
          metadataFolderId,
          pnIdentifier,
          fileId
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating profile image:', error);
        return res.status(500).json({
          error: 'Failed to update profile image',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update profile image'
        });
      }
    });

    // POST /api/profile/display-name - Update display name
    app.post('/api/profile/display-name', async (req, res) => {
      try {
        const { userPnIdentifier, displayName } = req.body;
        if (!userPnIdentifier || !displayName) {
          return res.status(400).json({ error: 'userPnIdentifier and displayName are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

        const { ProfileService } = await import('./profileService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
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
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';

        // Find metadata folder - try both '_metadata' and 'Metadata'
        let metadataFolderId: string | null = null;
        
        for (const folderName of ['_metadata', 'Metadata']) {
          const folderQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
          const folderResponse = await fetch(folderUrl, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` }
          });

          if (folderResponse.ok) {
            const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
            if (folderData.files && folderData.files.length > 0) {
              metadataFolderId = folderData.files[0].id;
              break;
            }
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: 'Metadata folder not found. Please ensure you have a folder named "_metadata" or "Metadata" in your Google Drive.' });
        }

        // Update display name in Google Drive
        await ProfileService.updateDisplayName(
          userAccessToken,
          metadataFolderId,
          pnIdentifier,
          displayName
        );

        // Also save to database for fast lookups
        const db = (await import('../utils/database')).getDatabasePool();
        await db.query(`
          INSERT INTO user_profiles (pn_identifier, display_name, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (pn_identifier) 
          DO UPDATE SET 
            display_name = EXCLUDED.display_name,
            updated_at = NOW()
        `, [pnIdentifier, displayName]);

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating display name:', error);
        return res.status(500).json({
          error: 'Failed to update display name',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update display name'
        });
      }
    });

    // GET /api/profile/search - Exact match on listed public names only
    app.get('/api/profile/search', async (req, res) => {
      try {
        const q = String(req.query.q || '').trim();
        if (!q) {
          return res.json({ profiles: [] });
        }
        const { PublicNameService } = await import('./publicNameService');
        const row = await PublicNameService.searchListedExact(q);
        if (!row) {
          return res.json({ profiles: [] });
        }
        return res.json({
          profiles: [
            {
              pnIdentifier: row.pnIdentifier,
              displayName: row.publicName,
              publicName: row.publicName,
              proofType: row.proofType,
              verified: true,
              isVanity: row.isVanity,
            },
          ],
        });
      } catch (error: any) {
        console.error('Error searching profiles:', error);
        return res.status(500).json({ error: 'Failed to search profiles' });
      }
    });

    // GET /api/profile/:userPnIdentifier - Get user profile
    app.get('/api/profile/:userPnIdentifier', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, userPnIdentifier))) return;

        const { ProfileService } = await import('./profileService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');
        const db = (await import('../utils/database')).getDatabasePool();

        // Use pn identifier directly (already normalized)
        const pnIdentifier = typeof req.params.userPnIdentifier === 'string' ? req.params.userPnIdentifier : String(req.params.userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // First, try to get from database (fast lookup)
        const dbProfileResult = await db.query(`
          SELECT display_name, profile_image_file_id, updated_at
          FROM user_profiles
          WHERE pn_identifier = $1
        `, [pnIdentifier]);

        if (dbProfileResult.rows.length > 0) {
          const dbProfile = dbProfileResult.rows[0];
          // Log for debugging
          if (NODE_ENV === 'development') {
            console.log(`[Profile API] Retrieved profile from database for ${pnIdentifier}:`, {
              displayName: dbProfile.display_name || 'null',
              profileImageFileId: dbProfile.profile_image_file_id || 'null'
            });
          }
          const driveProfile = await (async () => {
            try {
              const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
              if (!userCredentials?.credentials) return null;
              const googleDriveAccounts =
                userCredentials.credentials.googleDriveAccounts ||
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              if (googleDriveAccounts.length === 0) return null;
              const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
              const accountId = account ? extractAccountId(account) : undefined;
              const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';
              const metadataFolder = await getMetadataFolder(
                {
                  access_token: account?.access_token || account?.accessToken || '',
                  refresh_token: account?.refresh_token || account?.refreshToken,
                  expires_at: account?.expires_at,
                  expires_in: account?.expires_in
                },
                pnIdentifier,
                accountId
              );
              if (!metadataFolder?.metadataFolderId) return null;
              return ProfileService.getProfile(userAccessToken, metadataFolder.metadataFolderId);
            } catch {
              return null;
            }
          })();

          return res.json({
            displayName: dbProfile.display_name || null,
            profileImageFileId: dbProfile.profile_image_file_id || null,
            mlKemPublicKey: driveProfile?.mlKemPublicKey || null
          });
        }

        // Fallback to Google Drive if not in database
        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ displayName: null, profileImageFileId: null });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ displayName: null, profileImageFileId: null });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';

        // Find metadata folder - try both '_metadata' and 'Metadata'
        let metadataFolderId: string | null = null;
        
        for (const folderName of ['_metadata', 'Metadata']) {
          const folderQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
          const folderResponse = await fetch(folderUrl, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` }
          });

          if (folderResponse.ok) {
            const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
            if (folderData.files && folderData.files.length > 0) {
              metadataFolderId = folderData.files[0].id;
              break;
            }
          }
        }

        if (!metadataFolderId) {
          return res.json({ displayName: null, profileImageFileId: null });
        }

        const profile = await ProfileService.getProfile(userAccessToken, metadataFolderId);

        // If we got a profile from Google Drive, save it to database for next time
        if (profile?.displayName) {
          await db.query(`
            INSERT INTO user_profiles (pn_identifier, display_name, profile_image_file_id, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (pn_identifier) 
            DO UPDATE SET 
              display_name = EXCLUDED.display_name,
              profile_image_file_id = EXCLUDED.profile_image_file_id,
              updated_at = NOW()
          `, [pnIdentifier, profile.displayName, profile.profileImageFileId || null]);
        }

        // Log for debugging
        if (NODE_ENV === 'development') {
          console.log(`[Profile API] Retrieved profile from Google Drive for ${pnIdentifier}:`, {
            hasProfile: !!profile,
            displayName: profile?.displayName || 'null',
            profileImageFileId: profile?.profileImageFileId || 'null'
          });
        }

        return res.json({
          displayName: profile?.displayName || null,
          profileImageFileId: profile?.profileImageFileId || null,
          mlKemPublicKey: profile?.mlKemPublicKey || null
        });
      } catch (error: any) {
        console.error('Error getting profile:', error);
        return res.status(500).json({
          error: 'Failed to get profile',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get profile'
        });
      }
    });

    app.post('/api/profile/ml-kem-public-key', async (req, res) => {
      try {
        const { userPnIdentifier, mlKemPublicKey } = req.body;
        if (!userPnIdentifier || !mlKemPublicKey) {
          return res.status(400).json({ error: 'userPnIdentifier and mlKemPublicKey are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

        const { ProfileService } = await import('./profileService');
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        const pnIdentifier = String(userPnIdentifier);
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }
        const googleDriveAccounts =
          userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive connected' });
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';
        const metadataFolder = await getMetadataFolder(
          {
            access_token: account?.access_token || account?.accessToken || '',
            refresh_token: account?.refresh_token || account?.refreshToken,
            expires_at: account?.expires_at,
            expires_in: account?.expires_in
          },
          pnIdentifier,
          accountId
        );
        if (!metadataFolder?.metadataFolderId) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }
        const existingProfile = await ProfileService.getProfileFile(
          userAccessToken,
          metadataFolder.metadataFolderId
        );
        const profile = {
          identifier: existingProfile?.identifier || pnIdentifier,
          displayName: existingProfile?.displayName,
          profileImageFileId: existingProfile?.profileImageFileId,
          storageTier: existingProfile?.storageTier,
          updatedAt: new Date().toISOString(),
          mlKemPublicKey
        };
        await ProfileService.updateProfileFile(
          userAccessToken,
          metadataFolder.metadataFolderId,
          pnIdentifier,
          profile
        );
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating ML-KEM public key:', error);
        return res.status(500).json({
          error: 'Failed to update messaging public key',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });
}
