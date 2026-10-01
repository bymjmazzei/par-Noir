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

export function setupProfileRoutes(app: express.Application, _deps: ProfileRouteDeps) {

    // POST /api/profile/image - Set profile image fileId
    app.post('/api/profile/image', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

        const pnIdentifier = userPnIdentifier;
        const db = (await import('../utils/database')).getDatabasePool();
        await db.query(`
          INSERT INTO user_profiles (pn_identifier, profile_image_file_id, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (pn_identifier)
          DO UPDATE SET profile_image_file_id = EXCLUDED.profile_image_file_id, updated_at = NOW()
        `, [pnIdentifier, fileId]);
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
        const pnIdentifier = userPnIdentifier;
        const db = (await import('../utils/database')).getDatabasePool();
        await db.query(`
          INSERT INTO user_profiles (pn_identifier, display_name, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (pn_identifier)
          DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
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

        const db = (await import('../utils/database')).getDatabasePool();

        // Use pn identifier directly (already normalized)
        const pnIdentifier = typeof req.params.userPnIdentifier === 'string' ? req.params.userPnIdentifier : String(req.params.userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // First, try to get from database (fast lookup)
        const dbProfileResult = await db.query(`
          SELECT display_name, profile_image_file_id, ml_kem_public_key, updated_at
          FROM user_profiles
          WHERE pn_identifier = $1
        `, [pnIdentifier]);

        const dbProfile = dbProfileResult.rows.length > 0 ? dbProfileResult.rows[0] : null;
        // The published ML-KEM key is what a peer needs to seal a connection
        // request. Reading it off the target's Drive needs the target's token,
        // which the server does not have, so Postgres is the only path that
        // works under custody.
        const dbFallback = {
          displayName: dbProfile?.display_name || null,
          profileImageFileId: dbProfile?.profile_image_file_id || null,
          mlKemPublicKey: (dbProfile?.ml_kem_public_key as string | null) || null
        };

        return res.json(dbFallback);

      } catch (error: any) {
        console.error('Error getting profile:', error);
        // Soft-fail: empty profile is preferable to 500 under device custody.
        return res.json({ displayName: null, profileImageFileId: null, mlKemPublicKey: null });
      }
    });

    app.post('/api/profile/ml-kem-public-key', async (req, res) => {
      try {
        const { userPnIdentifier, mlKemPublicKey } = req.body;
        if (!userPnIdentifier || !mlKemPublicKey) {
          return res.status(400).json({ error: 'userPnIdentifier and mlKemPublicKey are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

        const pnIdentifier = String(userPnIdentifier);
        const db = (await import('../utils/database')).getDatabasePool();
        await db.query(`
          INSERT INTO user_profiles (pn_identifier, ml_kem_public_key, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (pn_identifier)
          DO UPDATE SET ml_kem_public_key = EXCLUDED.ml_kem_public_key, updated_at = NOW()
        `, [pnIdentifier, mlKemPublicKey]);
        const { rememberMailboxRecipientKey } = await import('./socialMailboxService');
        await rememberMailboxRecipientKey(pnIdentifier);
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
