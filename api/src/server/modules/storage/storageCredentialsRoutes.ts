/**
 * Storage credentials + Google Drive layout initialization routes.
 *
 * Save/read the server-encrypted storage credential envelope, kick off (and poll)
 * the Drive layout build, and migrate a legacy volume identifier to the canonical one.
 */

import type { Application, Request, Response } from 'express';
import { safeClientErrorMessage } from '../../utils/safeError';
import {
  gateOwnerRoute,
  gateStorageCredentialsPut,
  DEVICE_CAPABILITIES,
} from '../deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface StorageCredentialsRouteDeps {
  extractAccountId: (account: any) => string | undefined;
}

/** Init-only: discover folders/sheets, verify layout, persist complete pnDriveIndex. */
async function initializeGoogleDriveStorage(
  token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
  pnIdentifier: string,
  accountId: string | undefined,
  credentials: Record<string, unknown>,
  identityId: string,
  logPrefix: string
): Promise<{ metadataFolderId: string; pnFolderId: string }> {
  const { runFullDriveInitAndPersist } = await import('../driveInitSteps');
  return runFullDriveInitAndPersist(
    token,
    pnIdentifier,
    accountId,
    credentials,
    identityId,
    logPrefix
  );
}

export function setupStorageCredentialsRoutes(app: Application, deps: StorageCredentialsRouteDeps) {
  const { extractAccountId } = deps;

    // PUT /api/storage/credentials/:identityId - Save storage credentials (server encrypted)
    app.put('/api/storage/credentials/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        const { credentials, cid } = req.body;

        // SECURITY: Sanitize identityId in logs - never log pn names or short identifiers
        // CRITICAL: pn identifiers start with 'pn-' and are safe to log (they're hashes, not names)
        // Only redact if it's short AND doesn't start with 'pn-' or 'did:' or public key prefix
        const sanitizedIdentityId = identityId && identityId.length < 20 && !identityId.startsWith('pn-') && !identityId.startsWith('did:') && !identityId.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA')
          ? '[REDACTED - potential pn name]'
          : identityId?.substring(0, 50) + (identityId && identityId.length > 50 ? '...' : '');

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

        // Merge with existing so reconnect/layout updates cannot wipe pnDriveIndex / sheet IDs.
        const existingRecord = await storageCredentialsService.getCredentials(pnIdentifier);
        const existingCreds = (existingRecord?.credentials || {}) as Record<string, unknown>;
        const incoming = credentialsToStore as Record<string, unknown>;
        credentialsToStore = {
          ...existingCreds,
          ...incoming,
          pnDriveIndex: incoming.pnDriveIndex ?? existingCreds.pnDriveIndex,
          cachedFolderIds: incoming.cachedFolderIds ?? existingCreds.cachedFolderIds,
          driveFolderId: incoming.driveFolderId ?? existingCreds.driveFolderId,
        };

        const record = await storageCredentialsService.upsertCredentials(
          pnIdentifier,
          credentialsToStore,
          cid
        );

        // SECURITY: Use sanitized identityId in logs
        console.log(`[StorageCredentials PUT] Successfully saved credentials for identityId: ${sanitizedIdentityId}`);

        let directoryBuilt = true;
        let folderInitError: string | null = null;

        try {
          const {
            inferPrimaryProviderFromCredentials,
            shouldInitializePortable,
            initializePortableStorage
          } = await import('./storageInitService');
          const inferred = inferPrimaryProviderFromCredentials(credentials);
          if (shouldInitializePortable(inferred) && inferred.primaryProvider !== 'google_drive') {
            await initializePortableStorage(pnIdentifier, inferred);
            console.log(`[StorageCredentials PUT] Initialized portable storage for ${inferred.primaryProvider}`);
          }
        } catch (portableInitErr: any) {
          console.warn(`[StorageCredentials PUT] Portable init warning:`, portableInitErr?.message || portableInitErr);
          folderInitError = portableInitErr?.message || 'Portable storage init failed';
        }

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

        // No server-side token refresh here: under device cloud custody the stored
        // row holds account shells with no refresh secret, so there is nothing to
        // refresh. The device refreshes and forwards X-PN-Cloud-Access-Token.

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

        const { isPnRevokedForNetwork } = await import('../identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description: 'This pN identifier is retired on the par Noir network.'
          });
        }

        const { storageCredentialsService } = await import('../storageCredentialsService');
        const { googleDriveProxyService } = await import('../googleDriveProxy');

        const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!credentials?.credentials) {
          return res.status(404).json({ error: 'No storage credentials found for identity' });
        }

        const googleDriveAccounts = credentials.credentials.googleDriveAccounts ||
          (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);

        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive accounts connected' });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;

        // Use a fresh (auto-refreshed) access token from the proxy, or an ephemeral
        // device-forwarded token under cloud custody (API has no stored Google secrets).
        let freshAccessToken: string | null = null;
        try {
          const { resolveOwnerDriveToken } = await import('../ownerDriveToken');
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { account, accountId });
          freshAccessToken = resolved.token.access_token;
        } catch (tokenErr: any) {
          // Caller falls back to the stored token below.
          console.warn(
            `[StorageInitialize POST] Could not resolve access token, falling back to stored token:`,
            tokenErr?.message || tokenErr
          );
        }

        const token = {
          access_token: freshAccessToken || account.access_token || account.accessToken,
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const accessToken = token.access_token;

        if (!accessToken) {
          return res.status(400).json({
            error: 'No Google Drive access token available for this identity',
            error_description:
              'Under device custody, reconnect Google Drive on this device and retry initialize with a cloud access token.'
          });
        }

        console.log(`[StorageInitialize POST] Re-initializing folder structure for identityId: ${sanitizedIdentityId}`);

        try {
          const { runDriveInitOnce } = await import('../driveInitCoordinator');
          const { withGoogleRetry } = await import('../googleApiRetry');
          const { metadataFolderId, pnFolderId } = await withGoogleRetry(
            'driveInitFull',
            () =>
              runDriveInitOnce(pnIdentifier, () =>
                initializeGoogleDriveStorage(
                  token,
                  pnIdentifier,
                  accountId,
                  credentials.credentials as Record<string, unknown>,
                  sanitizedIdentityId,
                  `[StorageInitialize POST]`
                )
              ),
            3
          );

          return res.json({
            success: true,
            message: 'Google Drive folder structure initialized successfully',
            identityId: pnIdentifier,
            metadataFolderId,
            pnFolderId
          });
        } catch (initError: any) {
          console.error(`[StorageInitialize POST] Failed to initialize:`, initError);
          const { isRetryableGoogleError } = await import('../googleApiRetry');
          const retryable = isRetryableGoogleError(initError);
          return res.status(retryable ? 503 : 500).json({
            error: 'Failed to initialize Google Drive folder structure',
            message: initError.message || String(initError),
            retryable,
            details: 'Check Railway logs for more details'
          });
        }
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

        const { isDriveInitInFlight } = await import('../driveInitCoordinator');
        const { getDriveInitProgress, isDriveInitProgressActive } = await import(
          '../driveInitProgress'
        );

        const progress = getDriveInitProgress(pnIdentifier);
        const inFlight = isDriveInitInFlight(pnIdentifier) || isDriveInitProgressActive(pnIdentifier);

        return res.json({
          identityId: pnIdentifier,
          inFlight,
          progress,
        });
      } catch (error: unknown) {
        console.error('Error in storage initialize status endpoint:', error);
        return res.status(500).json({
          error: 'Failed to read storage initialize status',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        });
      }
    });

    /** Ensure private `_metadata/zkp-docs` folder exists; patch pnDriveIndex.zkpDocsFolderId */
    app.post('/api/storage/:identityId/zkp-docs/ensure', async (req: Request, res: Response) => {
      try {
        const rawId = req.params.identityId;
        if (!rawId) return res.status(400).json({ error: 'identityId required' });
        const pnIdentifier = rawId.startsWith('pn-') ? rawId : `pn-${rawId}`;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

        const { extractCloudAccessToken } = await import('../cloudAccessToken');
        const { storageCredentialsService } = await import('../storageCredentialsService');
        const { readPnDriveIndex, patchPnDriveIndex } = await import('../pnDriveIndex');
        const { findOrCreateFolderUnderParent } = await import('../pnDriveLayout');
        const { googleDriveProxyService } = await import('../googleDriveProxy');

        const record = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!record?.credentials) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect Google Drive first' });
        }
        const index = readPnDriveIndex(record.credentials as Record<string, unknown>);
        if (!index?.metadataFolderId) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Drive layout incomplete' });
        }
        if (index.zkpDocsFolderId) {
          return res.json({ folderId: index.zkpDocsFolderId });
        }

        let accessToken: string;
        try {
          const { resolveOwnerDriveToken } = await import('../ownerDriveToken');
          const resolved = await resolveOwnerDriveToken(req, pnIdentifier);
          accessToken = resolved.token.access_token;
        } catch (tokenErr) {
          const { respondDriveTokenError } = await import('../ownerDriveToken');
          if (respondDriveTokenError(res, tokenErr)) return;
          throw tokenErr;
        }

        const folderId = await findOrCreateFolderUnderParent(
          accessToken,
          'zkp-docs',
          index.metadataFolderId
        );
        await patchPnDriveIndex(pnIdentifier, { zkpDocsFolderId: folderId });
        return res.json({ folderId });
      } catch (error: unknown) {
        console.error('Error ensuring zkp-docs folder:', error);
        return res.status(500).json({
          error: 'Failed to ensure zkp-docs folder',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
        });
      }
    });
}

/** POST /api/storage/migrate-volume-id — legacy passcode pn id → canonical publicKey id */
export function setupStorageVolumeMigrationRoute(app: Application) {
    app.post('/api/storage/migrate-volume-id', async (req: Request, res: Response) => {
      try {
        const { legacyPnIdentifier, canonicalPnIdentifier, publicKey, driveFolderId } = req.body as {
          legacyPnIdentifier?: string;
          canonicalPnIdentifier?: string;
          publicKey?: string;
          driveFolderId?: string;
        };
        if (!legacyPnIdentifier || !canonicalPnIdentifier || !publicKey) {
          return res.status(400).json({ error: 'legacyPnIdentifier, canonicalPnIdentifier, and publicKey are required' });
        }
        const { storageCredentialsService } = await import('../storageCredentialsService');
        const record = await storageCredentialsService.migrateIdentityId(
          legacyPnIdentifier.startsWith('pn-') ? legacyPnIdentifier : `pn-${legacyPnIdentifier}`,
          canonicalPnIdentifier.startsWith('pn-') ? canonicalPnIdentifier : `pn-${canonicalPnIdentifier}`,
          { driveFolderId, publicKey }
        );
        if (!record) {
          return res.status(404).json({ error: 'Legacy credentials not found' });
        }
        return res.json({ success: true, identityId: record.identityId });
      } catch (error: any) {
        console.error('Error migrating volume id:', error);
        return res.status(500).json({ error: 'Failed to migrate volume id' });
      }
    });

    // PUT /api/storage/cloud-vault/:identityId — store opaque client-sealed credentials (ciphertext only)
    app.put('/api/storage/cloud-vault/:identityId', async (req: Request, res: Response) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

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
