/**
 * Storage credential layout + cloud layout bookkeeping routes.
 *
 * The API stores the layout shell (no provider secrets) and the layout version the
 * device reports. Every cloud write, including the layout build, runs on the device.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../../utils/safeError';
import { hashIdentifier, safeLogger } from '../../../utils/logger';
import { getDeviceAccessMode } from '@par-noir/device-auth';
import { isPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import {
  gateOwnerRoute,
  gateStorageCredentialsPut,
  DEVICE_CAPABILITIES,
} from '../deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function setupStorageCredentialsRoutes(app: Application) {

    // PUT /api/storage/credentials/:identityId - Save storage credentials (server encrypted)
    app.put('/api/storage/credentials/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        const { credentials, cid } = req.body;

        // Only canonical pN ids (public-key hashes) are logged; anything else could be Key 1.
        const sanitizedIdentityId = isPnIdentifier(identityId) ? identityId : '[REDACTED]';

        console.log(`[StorageCredentials PUT] Received request for identityId: ${sanitizedIdentityId}`);
        console.log(`[StorageCredentials PUT] Credentials structure:`, {
          hasGoogleDriveAccounts: !!credentials?.googleDriveAccounts,
          googleDriveAccountsLength: Array.isArray(credentials?.googleDriveAccounts) ? credentials.googleDriveAccounts.length : 0,
          hasGoogleDrive: !!credentials?.googleDrive,
          allKeys: Object.keys(credentials || {})
        });

        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize to pnIdentifier format
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        if (!(await gateStorageCredentialsPut(req, res, pnIdentifier))) return;

        if (!credentials) {
          return res.status(400).json({ error: 'Missing credentials in request body' });
        }

        const { isPnRevokedForNetwork } = await import('../identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description:
              'This pN identifier is retired on the par Noir network. Use your successor identity for storage and services.'
          });
        }

        const { storageCredentialsService } = await import('../storageCredentialsService');
        const { isDeviceCloudCustodyEnabled } = await import('../socialMailboxService');
        let credentialsToStore = credentials;
        if (isDeviceCloudCustodyEnabled()) {
          // Prefer layout-only persistence; clients seal secrets on device.
          credentialsToStore = storageCredentialsService.stripCloudSecrets(
            credentials as Record<string, unknown>
          );
          console.log(
            `[StorageCredentials PUT] DEVICE_CLOUD_CUSTODY=1 — stripped cloud secrets for identity`
          );
        }

        // Merge with existing so reconnect/layout updates cannot wipe pnDriveIndex / sheet IDs
        // while Drive remains linked. Explicit empty googleDriveAccounts (disconnect) must
        // clear legacy googleDrive + layout — otherwise deleted Drive folders leave a stale
        // index and reconnect skips folder recreate.
        const existingRecord = await storageCredentialsService.getCredentials(pnIdentifier);
        const existingCreds = (existingRecord?.credentials || {}) as Record<string, unknown>;
        const incoming = credentialsToStore as Record<string, unknown>;
        credentialsToStore = {
          ...existingCreds,
          ...incoming,
        };
        const incomingClearedAccounts =
          Array.isArray(incoming.googleDriveAccounts) &&
          incoming.googleDriveAccounts.length === 0;
        if (incomingClearedAccounts) {
          delete credentialsToStore.googleDrive;
          delete credentialsToStore.pnDriveIndex;
          delete credentialsToStore.cachedFolderIds;
          delete credentialsToStore.driveFolderId;
          if (incoming.socialCloudProvider == null) {
            delete credentialsToStore.socialCloudProvider;
            delete credentialsToStore.socialCloudAccountId;
          }
        } else {
          const pickLayout = (key: 'pnDriveIndex' | 'cachedFolderIds' | 'driveFolderId') => {
            if (Object.prototype.hasOwnProperty.call(incoming, key)) {
              if (incoming[key] == null) {
                delete credentialsToStore[key];
              } else {
                credentialsToStore[key] = incoming[key];
              }
            } else if (existingCreds[key] != null) {
              credentialsToStore[key] = existingCreds[key];
            }
          };
          pickLayout('pnDriveIndex');
          pickLayout('cachedFolderIds');
          pickLayout('driveFolderId');
        }

        const record = await storageCredentialsService.upsertCredentials(
          pnIdentifier,
          credentialsToStore,
          cid
        );

        // SECURITY: Use sanitized identityId in logs
        console.log(`[StorageCredentials PUT] Successfully saved credentials for identityId: ${sanitizedIdentityId}`);

        let directoryBuilt = true;
        let folderInitError: string | null = null;

        // Initialize Google Drive folder structure if this is a new Google Drive connection
        const hasGoogleDrive = !!(credentials?.googleDriveAccounts?.length > 0 || credentials?.googleDrive);
        const deviceCustody = isDeviceCloudCustodyEnabled();
        let clientSideLayoutRequired = false;
        if (hasGoogleDrive) {
          try {
            const googleDriveAccounts = credentials.googleDriveAccounts ||
              (credentials.googleDrive ? [credentials.googleDrive] : []);

            if (googleDriveAccounts.length > 0) {
              if (deviceCustody) {
                // OAuth secrets are device-held — server POST /storage/initialize cannot run.
                // Dashboard must discover/build Drive layout with the local Google token.
                clientSideLayoutRequired = true;
                directoryBuilt = true;
                console.log(
                  `[StorageCredentials PUT] DEVICE_CLOUD_CUSTODY — client-side Drive layout required for identityId: ${sanitizedIdentityId}`
                );
              } else {
                // Credentials are saved. The full Drive layout build is a long, multi-minute
                // operation that must run inside a request that is actually awaited by the client.
                // The dashboard always calls POST /api/storage/initialize right after this PUT and
                // awaits it, so we do NOT fire-and-forget here (that races and can be abandoned when
                // the HTTP response returns). Just report that init still needs to run.
                console.log(`[StorageCredentials PUT] Credentials saved; Drive layout build deferred to /storage/initialize for identityId: ${sanitizedIdentityId}`);
                directoryBuilt = false;
              }
            }
          } catch (err: any) {
            directoryBuilt = false;
            folderInitError = err?.message || String(err);
            console.warn(`[StorageCredentials PUT] Failed to prepare folder init for identityId: ${sanitizedIdentityId}`, folderInitError);
          }
        }

        return res.json({
          success: true,
          identityId: record.identityId,
          cid: record.cid ?? null,
          updatedAt: record.updatedAt,
          directoryBuilt,
          initInProgress: hasGoogleDrive && !directoryBuilt && !clientSideLayoutRequired,
          ...(clientSideLayoutRequired && { clientSideLayoutRequired: true }),
          ...(folderInitError != null && { folderInitError })
        });
      } catch (error: any) {
        console.error('Error saving storage credentials:', error);
        return res.status(500).json({
          error: 'Failed to save storage credentials',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // GET /api/storage/credentials/:identityId - Retrieve encrypted storage credentials
    app.get('/api/storage/credentials/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;

        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize to pnIdentifier format
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

        const { isPnRevokedForNetwork } = await import('../identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description:
              'This pN identifier is retired on the par Noir network. Cloud storage and synced state are bound to your successor identity.'
          });
        }

        const { storageCredentialsService } = await import('../storageCredentialsService');
        let record = await storageCredentialsService.getCredentials(pnIdentifier);

        if (!record) {
          return res.status(404).json({ error: 'No storage credentials found for identity' });
        }

        // No server-side token refresh: the stored row holds account shells with no
        // refresh secret. Cloud tokens live and refresh only on the device.

        return res.json({
          success: true,
          identityId: record.identityId,
          credentials: record.credentials,
          cid: record.cid,
          updatedAt: record.updatedAt,
          createdAt: record.createdAt
        });
      } catch (error: any) {
        console.error('Error retrieving storage credentials:', error);
        return res.status(500).json({
          error: 'Failed to retrieve storage credentials',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // POST /api/storage/initialize/:identityId - Re-initialize Google Drive folder structure
    app.post('/api/storage/initialize/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        const sanitizedIdentityId = identityId.replace(/[^a-zA-Z0-9-]/g, '');
        const pnIdentifier = sanitizedIdentityId.startsWith('pn-') ? sanitizedIdentityId : `pn-${sanitizedIdentityId}`;

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

        const { isPnRevokedForNetwork } = await import('../identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description: 'This pN identifier is retired on the par Noir network.'
          });
        }

        const { storageCredentialsService } = await import('../storageCredentialsService');

        const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!credentials?.credentials) {
          return res.status(404).json({ error: 'No storage credentials found for identity' });
        }

        const layoutMigrationCommit =
          typeof req.body?.layoutMigrationCommit === 'string'
            ? req.body.layoutMigrationCommit.trim()
            : '';
        if (layoutMigrationCommit) {
          const { commitCloudLayoutMigration } = await import('./cloudLayoutMigrations');
          try {
            const layoutStatus = await commitCloudLayoutMigration(
              pnIdentifier,
              layoutMigrationCommit
            );
            return res.json({ success: true, identityId: pnIdentifier, ...layoutStatus });
          } catch (commitErr: unknown) {
            const code =
              commitErr && typeof commitErr === 'object' && 'code' in commitErr
                ? String((commitErr as { code: unknown }).code)
                : '';
            if (code === 'MIGRATION_ORDER' || code === 'MIGRATION_UNKNOWN') {
              return res.status(400).json({
                error: code,
                message: commitErr instanceof Error ? commitErr.message : 'Invalid migration',
              });
            }
            if (code === 'DRIVE_NOT_INITIALIZED') {
              return res.status(404).json({
                error: 'NO_STORAGE_CREDENTIALS',
                message: 'Connect cloud storage first',
              });
            }
            throw commitErr;
          }
        }

        const submittedIndex = req.body?.pnDriveIndex as Record<string, unknown> | undefined;
        if (
          submittedIndex?.pnFolderId &&
          submittedIndex?.metadataFolderId &&
          submittedIndex?.sheetIds
        ) {
          const { persistPnDriveIndex, isPnDriveIndexComplete } = await import('../pnDriveIndex');
          const creds = { ...(credentials.credentials as Record<string, unknown>) };
          const sub = submittedIndex as {
            pnFolderId: string;
            metadataFolderId: string;
            integratorsRootId?: string;
            messagesFolderId?: string;
            inboxSheetId?: string;
            sheetIds: Record<string, string>;
            conversationSheets?: Record<string, string>;
            zkpDocsFolderId?: string;
            filesFolderId?: string;
            contentFolderId?: string;
            contentNotesFolderId?: string;
            contentMediaFolderId?: string;
            contentCollectionsFolderId?: string;
          };
          const index = {
            schemaVersion: 1 as const,
            pnFolderId: String(sub.pnFolderId),
            metadataFolderId: String(sub.metadataFolderId),
            integratorsRootId: String(sub.integratorsRootId || ''),
            messagesFolderId: String(sub.messagesFolderId || ''),
            inboxSheetId: String(sub.inboxSheetId || ''),
            sheetIds: sub.sheetIds,
            conversationSheets: sub.conversationSheets || {},
            ...(sub.zkpDocsFolderId ? { zkpDocsFolderId: String(sub.zkpDocsFolderId) } : {}),
            ...(sub.filesFolderId ? { filesFolderId: String(sub.filesFolderId) } : {}),
            ...(sub.contentFolderId ? { contentFolderId: String(sub.contentFolderId) } : {}),
            ...(sub.contentNotesFolderId
              ? { contentNotesFolderId: String(sub.contentNotesFolderId) }
              : {}),
            ...(sub.contentMediaFolderId
              ? { contentMediaFolderId: String(sub.contentMediaFolderId) }
              : {}),
            ...(sub.contentCollectionsFolderId
              ? { contentCollectionsFolderId: String(sub.contentCollectionsFolderId) }
              : {}),
          };
          if (isPnDriveIndexComplete(index) && index.filesFolderId?.trim()) {
            const { stampCloudLayoutCurrent } = await import('./cloudLayoutMigrations');
            stampCloudLayoutCurrent(creds);
          }
          await persistPnDriveIndex(pnIdentifier, creds, index);
          return res.json({
            success: true,
            pnFolderId: index.pnFolderId,
            metadataFolderId: index.metadataFolderId,
          });
        }
        return res.status(409).json({
          error: 'cloud_on_device',
          error_description: 'Build the Drive layout on the device and submit pnDriveIndex.',
        });

      } catch (error: any) {
        console.error('Error in storage initialize endpoint:', error);
        return res.status(500).json({
          error: 'Failed to initialize storage',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // GET /api/storage/initialize/:identityId/status - Poll Drive layout init progress
    app.get('/api/storage/initialize/:identityId/status', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        const sanitizedIdentityId = identityId.replace(/[^a-zA-Z0-9-]/g, '');
        const pnIdentifier = sanitizedIdentityId.startsWith('pn-')
          ? sanitizedIdentityId
          : `pn-${sanitizedIdentityId}`;

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

        const { isDriveInitInFlight } = await import('../driveInitCoordinator');
        const { getDriveInitProgress, isDriveInitProgressActive } = await import(
          '../driveInitProgress'
        );

        const progress = getDriveInitProgress(pnIdentifier);
        const inFlight = isDriveInitInFlight(pnIdentifier) || isDriveInitProgressActive(pnIdentifier);
        let complete = progress?.phase === 'complete';
        const failed = progress?.phase === 'failed';

        // After progress TTL clears, still report complete when the persisted index is ready.
        if (!inFlight && !complete && !failed) {
          try {
            const { loadPnDriveIndex, isPnDriveIndexComplete } = await import('../pnDriveIndex');
            complete = isPnDriveIndexComplete(await loadPnDriveIndex(pnIdentifier));
          } catch {
            /* index unread — leave complete false */
          }
        }

        return res.json({
          identityId: pnIdentifier,
          inFlight,
          progress,
          complete,
          failed,
        });
      } catch (error: unknown) {
        console.error('Error in storage initialize status endpoint:', error);
        return res.status(500).json({
          error: 'Failed to read storage initialize status',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        });
      }
    });

    /** GET /api/storage/:identityId/layout/status — cloud layout version vs required (no Drive writes) */
    app.get('/api/storage/:identityId/layout/status', async (req: Request, res: Response) => {
      try {
        const rawId = req.params.identityId;
        if (!rawId) return res.status(400).json({ error: 'identityId required' });
        const pnIdentifier = rawId.startsWith('pn-') ? rawId : `pn-${rawId}`;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

        const { loadCloudLayoutStatus } = await import('./cloudLayoutMigrations');
        const status = await loadCloudLayoutStatus(pnIdentifier);
        if (!status) {
          return res.status(404).json({
            error: 'NO_STORAGE_CREDENTIALS',
            message: 'Connect cloud storage first',
            complete: false,
            current: 0,
            required: (await import('./cloudLayoutMigrations')).CURRENT_CLOUD_LAYOUT_VERSION,
            pending: [],
            appliedMigrations: [],
          });
        }
        return res.json({ identityId: pnIdentifier, ...status });
      } catch (error: unknown) {
        console.error('Error reading cloud layout status:', error);
        return res.status(500).json({
          error: 'Failed to read cloud layout status',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        });
      }
    });

    /** POST /api/storage/:identityId/layout/commit-migration — stamp one migration after device execution */
    app.post('/api/storage/:identityId/layout/commit-migration', async (req: Request, res: Response) => {
      try {
        const rawId = req.params.identityId;
        if (!rawId) return res.status(400).json({ error: 'identityId required' });
        const pnIdentifier = rawId.startsWith('pn-') ? rawId : `pn-${rawId}`;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

        const migrationId =
          typeof req.body?.migrationId === 'string' ? req.body.migrationId.trim() : '';
        if (!migrationId) {
          return res.status(400).json({ error: 'migrationId required' });
        }

        const { commitCloudLayoutMigration } = await import('./cloudLayoutMigrations');
        try {
          const status = await commitCloudLayoutMigration(pnIdentifier, migrationId);
          return res.json({ success: true, identityId: pnIdentifier, ...status });
        } catch (commitErr: unknown) {
          const code =
            commitErr && typeof commitErr === 'object' && 'code' in commitErr
              ? String((commitErr as { code: unknown }).code)
              : '';
          if (code === 'MIGRATION_ORDER' || code === 'MIGRATION_UNKNOWN') {
            return res.status(400).json({
              error: code,
              message: commitErr instanceof Error ? commitErr.message : 'Invalid migration',
            });
          }
          if (code === 'DRIVE_NOT_INITIALIZED') {
            return res.status(404).json({
              error: 'NO_STORAGE_CREDENTIALS',
              message: 'Connect cloud storage first',
            });
          }
          throw commitErr;
        }
      } catch (error: unknown) {
        console.error('Error committing cloud layout migration:', error);
        return res.status(500).json({
          error: 'Failed to commit cloud layout migration',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        });
      }
    });

}

export function setupStorageCloudVaultRoutes(app: Application) {
    // PUT /api/storage/cloud-vault/:identityId — store opaque client-sealed credentials (ciphertext only)
    app.put('/api/storage/cloud-vault/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
        const ctx = await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier);
        if (!ctx) return;

        const { isPnRevokedForNetwork } = await import('../identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description: 'This pN identifier is retired on the par Noir network.'
          });
        }

        const envelope = req.body?.envelope ?? req.body?.sealed ?? req.body;
        const {
          cloudVaultService,
          looksLikePlaintextCloudSecrets
        } = await import('../cloudVaultService');

        if (looksLikePlaintextCloudSecrets(envelope)) {
          return res.status(400).json({
            error: 'plaintext_not_allowed',
            error_description: 'Cloud vault accepts only a client-sealed envelope, not OAuth secrets'
          });
        }

        // Overwrite: Case A (unkeyed_legacy) may refresh Drive into the shared vault;
        // Case B unkeyed (unkeyed_restricted) stays keyed-only. Empty first-seal is unchanged.
        const existingVault = await cloudVaultService.getSealedVault(pnIdentifier);
        const accessMode = getDeviceAccessMode(ctx.policy, ctx.isKeyed);
        if (existingVault && accessMode === 'unkeyed_restricted') {
          safeLogger.warn('[cloud-vault] overwrite denied for Case B unkeyed session', {
            pnHash: hashIdentifier(pnIdentifier),
          });
          return res.status(403).json({
            error: 'device_key_required',
            reason: 'device_required',
          });
        }

        try {
          await cloudVaultService.putSealedVault(pnIdentifier, envelope);
        } catch (e: any) {
          return res.status(400).json({
            error: 'invalid_envelope',
            error_description: e?.message || 'Invalid sealed envelope'
          });
        }
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error saving cloud vault:', error);
        return res.status(500).json({
          error: 'Failed to save cloud vault',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // GET /api/storage/cloud-vault/:identityId — return opaque sealed envelope (never decrypted)
    app.get('/api/storage/cloud-vault/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

        const { isPnRevokedForNetwork } = await import('../identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description: 'This pN identifier is retired on the par Noir network.'
          });
        }

        const { cloudVaultService } = await import('../cloudVaultService');
        const envelope = await cloudVaultService.getSealedVault(pnIdentifier);
        if (!envelope) {
          return res.status(404).json({ error: 'Cloud vault not found' });
        }
        return res.json({ success: true, envelope });
      } catch (error: any) {
        console.error('Error reading cloud vault:', error);
        return res.status(500).json({
          error: 'Failed to read cloud vault',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });
}
