/**
 * @jest-environment node
 *
 * Status-code and payload branches for the storage credential + Drive init routes.
 * Every collaborator (credential store, Drive proxy, init coordinator) is mocked.
 */

/** Bearer identity under test — swapped to prove pn_mismatch / unauthorized. */
let currentBearer: string | null = 'pn-test';
/** When false, cloud-vault path treats the session as unkeyed. */
let gateIsKeyed = false;
/** When set, Case B (firstDeviceKeyedAt present) — unkeyed overwrite must deny. */
let gateFirstDeviceKeyedAt: string | undefined;

jest.mock('../deviceCapabilityService', () => {
  const DEVICE_CAPABILITIES = {
    driveRead: 'drive.read',
    driveUpload: 'drive.upload',
    profileWrite: 'profile.write',
  };
  return {
    DEVICE_CAPABILITIES,
    gateStorageCredentialsPut: jest.fn(async () => ({
      pnIdentifier: 'pn-test',
      isKeyed: gateIsKeyed,
      policy: { version: 1, unkeyedAllows: [], firstDeviceKeyedAt: gateFirstDeviceKeyedAt },
    })),
    gateOwnerRoute: jest.fn(async (_req: unknown, res: any, _cap: string, targetPn?: string) => {
      if (!currentBearer) {
        res.status(401).json({ error: 'unauthorized' });
        return null;
      }
      if (targetPn !== undefined && currentBearer !== targetPn) {
        res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
        return null;
      }
      return {
        pnIdentifier: currentBearer,
        isKeyed: gateIsKeyed,
        policy: { version: 1, unkeyedAllows: [], firstDeviceKeyedAt: gateFirstDeviceKeyedAt },
      };
    }),
  };
});

jest.mock('../identitySuccessionService', () => ({
  isPnRevokedForNetwork: jest.fn(() => false),
}));

jest.mock('../storageCredentialsService', () => ({
  storageCredentialsService: {
    getCredentials: jest.fn(),
    upsertCredentials: jest.fn(),
    migrateIdentityId: jest.fn(),
    stripCloudSecrets: jest.fn((c: Record<string, unknown>) => ({ ...c, stripped: true })),
  },
}));

jest.mock('../socialMailboxService', () => ({
  isDeviceCloudCustodyEnabled: jest.fn(() => false),
}));

jest.mock('./storageInitService', () => ({
  inferPrimaryProviderFromCredentials: jest.fn(() => ({ primaryProvider: 'google_drive' })),
  shouldInitializePortable: jest.fn(() => false),
  initializePortableStorage: jest.fn(async () => undefined),
}));

jest.mock('../googleDriveProxy', () => ({
  googleDriveProxyService: { getAccessToken: jest.fn() },
}));

jest.mock('../driveInitCoordinator', () => ({
  runDriveInitOnce: jest.fn(async (_pn: string, fn: () => Promise<unknown>) => fn()),
  isDriveInitInFlight: jest.fn(() => false),
}));

jest.mock('../driveInitProgress', () => ({
  getDriveInitProgress: jest.fn(() => null),
  isDriveInitProgressActive: jest.fn(() => false),
}));

jest.mock('../googleApiRetry', () => ({
  withGoogleRetry: jest.fn(async (_label: string, fn: () => Promise<unknown>) => fn()),
  isRetryableGoogleError: jest.fn(() => false),
}));

jest.mock('../driveInitSteps', () => ({
  runFullDriveInitAndPersist: jest.fn(),
}));

jest.mock('./storageProviderUtils', () => ({
  isPortableSocialCloud: jest.fn(async () => false),
  isPortableStorageProvider: jest.fn(async () => false),
}));

jest.mock('../messageSheetsService', () => ({
  MessageSheetsService: {
    ensureInboxChannelColumn: jest.fn(async () => undefined),
  },
}));

jest.mock('../cloudVaultService', () => ({
  cloudVaultService: {
    getSealedVault: jest.fn(),
    putSealedVault: jest.fn(),
  },
  looksLikePlaintextCloudSecrets: jest.fn(() => false),
}));

jest.mock('../../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
}));

import express from 'express';
import request from 'supertest';
import {
  setupStorageCredentialsRoutes,
  setupStorageVolumeMigrationRoute,
} from './storageCredentialsRoutes';
import { storageCredentialsService } from '../storageCredentialsService';
import { isPnRevokedForNetwork } from '../identitySuccessionService';
import { isDeviceCloudCustodyEnabled } from '../socialMailboxService';
import { googleDriveProxyService } from '../googleDriveProxy';
import { isRetryableGoogleError } from '../googleApiRetry';
import { runFullDriveInitAndPersist } from '../driveInitSteps';
import { getDriveInitProgress, isDriveInitProgressActive } from '../driveInitProgress';
import { cloudVaultService, looksLikePlaintextCloudSecrets } from '../cloudVaultService';
import { MessageSheetsService } from '../messageSheetsService';
import {
  CURRENT_CLOUD_LAYOUT_VERSION,
  MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1,
} from './cloudLayoutMigrations';
import { PN_DRIVE_SHEET_KEYS, REQUIRED_PN_DRIVE_SHEET_KEYS } from '../pnDriveIndex';

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockUpsertCredentials = storageCredentialsService.upsertCredentials as jest.Mock;
const mockMigrateIdentityId = storageCredentialsService.migrateIdentityId as jest.Mock;
const mockStripCloudSecrets = storageCredentialsService.stripCloudSecrets as jest.Mock;
const mockIsRevoked = isPnRevokedForNetwork as jest.Mock;
const mockCustodyEnabled = isDeviceCloudCustodyEnabled as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockIsRetryable = isRetryableGoogleError as jest.Mock;
const mockRunFullDriveInit = runFullDriveInitAndPersist as jest.Mock;
const mockGetProgress = getDriveInitProgress as jest.Mock;
const mockProgressActive = isDriveInitProgressActive as jest.Mock;
const mockGetSealedVault = cloudVaultService.getSealedVault as jest.Mock;
const mockPutSealedVault = cloudVaultService.putSealedVault as jest.Mock;
const mockLooksLikePlaintext = looksLikePlaintextCloudSecrets as jest.Mock;
const mockEnsureInboxChannel = MessageSheetsService.ensureInboxChannelColumn as jest.Mock;

const PN = 'pn-test';

function completePnDriveIndex() {
  const sheetIds: Record<string, string> = {};
  for (const key of REQUIRED_PN_DRIVE_SHEET_KEYS) {
    sheetIds[key] = `sheet-${key}`;
  }
  sheetIds[PN_DRIVE_SHEET_KEYS.OWNED_ASSETS] = 'sheet-owned-assets';
  return {
    schemaVersion: 1,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'int-root',
    messagesFolderId: 'msg-folder',
    inboxSheetId: 'inbox-sheet',
    sheetIds,
    conversationSheets: {},
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  setupStorageCredentialsRoutes(app, {
    extractAccountId: (account: any) => account?.backendId || account?.keyPrefix,
  });
  setupStorageVolumeMigrationRoute(app);
  return app;
}

function upsertResult() {
  return {
    identityId: PN,
    cid: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('storage credentials routes', () => {
  beforeEach(() => {
    currentBearer = PN;
    gateIsKeyed = false;
    gateFirstDeviceKeyedAt = undefined;
    mockGetCredentials.mockReset();
    mockUpsertCredentials.mockReset().mockResolvedValue(upsertResult());
    mockMigrateIdentityId.mockReset();
    mockStripCloudSecrets
      .mockReset()
      .mockImplementation((c: Record<string, unknown>) => ({ ...c, stripped: true }));
    mockIsRevoked.mockReset().mockReturnValue(false);
    mockCustodyEnabled.mockReset().mockReturnValue(false);
    mockGetAccessToken.mockReset();
    mockIsRetryable.mockReset().mockReturnValue(false);
    mockRunFullDriveInit.mockReset();
    mockGetProgress.mockReset().mockReturnValue(null);
    mockProgressActive.mockReset().mockReturnValue(false);
    mockGetSealedVault.mockReset().mockResolvedValue(null);
    mockPutSealedVault.mockReset().mockResolvedValue(undefined);
    mockLooksLikePlaintext.mockReset().mockReturnValue(false);
  });

  describe('PUT /api/storage/credentials/:identityId', () => {
    it('rejects a retired identity with identity_superseded', async () => {
      mockIsRevoked.mockReturnValue(true);

      const res = await request(buildApp())
        .put(`/api/storage/credentials/${PN}`)
        .send({ credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] } })
        .expect(403);

      expect(res.body.error).toBe('identity_superseded');
      expect(mockUpsertCredentials).not.toHaveBeenCalled();
    });

    it('requires a credentials body', async () => {
      const res = await request(buildApp()).put(`/api/storage/credentials/${PN}`).send({}).expect(400);
      expect(res.body.error).toBe('Missing credentials in request body');
    });

    it('defers the Drive layout build to /storage/initialize', async () => {
      const res = await request(buildApp())
        .put(`/api/storage/credentials/${PN}`)
        .send({ credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] } })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.directoryBuilt).toBe(false);
      expect(res.body.initInProgress).toBe(true);
      expect(res.body.clientSideLayoutRequired).toBeUndefined();
    });

    it('strips cloud secrets and requires a client-side layout under device custody', async () => {
      mockCustodyEnabled.mockReturnValue(true);

      const res = await request(buildApp())
        .put(`/api/storage/credentials/${PN}`)
        .send({ credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] } })
        .expect(200);

      expect(mockStripCloudSecrets).toHaveBeenCalled();
      expect(mockUpsertCredentials.mock.calls[0][1]).toMatchObject({ stripped: true });
      expect(res.body.clientSideLayoutRequired).toBe(true);
      expect(res.body.directoryBuilt).toBe(true);
      expect(res.body.initInProgress).toBe(false);
    });

    it('reports no init work when the identity has no Drive account', async () => {
      const res = await request(buildApp())
        .put(`/api/storage/credentials/${PN}`)
        .send({ credentials: {} })
        .expect(200);

      expect(res.body.directoryBuilt).toBe(true);
      expect(res.body.initInProgress).toBe(false);
    });
  });

  describe('GET /api/storage/credentials/:identityId', () => {
    it('returns 404 when nothing is stored', async () => {
      mockGetCredentials.mockResolvedValue(null);

      const res = await request(buildApp()).get(`/api/storage/credentials/${PN}`).expect(404);
      expect(res.body.error).toBe('No storage credentials found for identity');
    });

    it('returns the record without attempting a server-side token refresh', async () => {
      const record = {
        identityId: PN,
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1', refresh_token: 'r' }] },
        cid: 'cid-1',
        updatedAt: 'u',
        createdAt: 'c',
      };
      mockGetCredentials.mockResolvedValue(record);

      const res = await request(buildApp()).get(`/api/storage/credentials/${PN}`).expect(200);

      // Under device cloud custody the stored row has no refresh secret, so there is
      // nothing for the server to refresh. The device refreshes and forwards its token.
      expect(mockGetAccessToken).not.toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(res.body.cid).toBe('cid-1');
    });
  });

  describe('POST /api/storage/initialize/:identityId', () => {
    it('rejects wrong bearer pn with 403 before credentials lookup', async () => {
      currentBearer = 'pn-attacker';

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(403);

      expect(res.body).toEqual({ error: 'forbidden', reason: 'pn_mismatch' });
      expect(mockGetCredentials).not.toHaveBeenCalled();
      expect(mockRunFullDriveInit).not.toHaveBeenCalled();
    });

    it('rejects missing bearer with 401 before credentials lookup', async () => {
      currentBearer = null;

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(401);

      expect(res.body.error).toBe('unauthorized');
      expect(mockGetCredentials).not.toHaveBeenCalled();
    });

    it('returns 404 when no Google Drive account is connected', async () => {
      mockGetCredentials.mockResolvedValue({ credentials: {} });

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(404);
      expect(res.body.error).toBe('No Google Drive accounts connected');
    });

    it('returns 409 cloud_token_required when no access token can be obtained', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
      });
      mockGetAccessToken.mockRejectedValue(new Error('device custody'));

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(409);
      expect(res.body.error).toBe('cloud_token_required');
      expect(mockRunFullDriveInit).not.toHaveBeenCalled();
    });

    it('returns folder ids on a successful init', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
      });
      mockGetAccessToken.mockResolvedValue('fresh-token');
      mockRunFullDriveInit.mockResolvedValue({
        metadataFolderId: 'meta-folder',
        pnFolderId: 'pn-folder',
      });

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(200);

      expect(res.body).toMatchObject({
        success: true,
        identityId: PN,
        metadataFolderId: 'meta-folder',
        pnFolderId: 'pn-folder',
      });
    });

    it('maps a retryable Google failure to 503 with retryable=true', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
      });
      mockGetAccessToken.mockResolvedValue('fresh-token');
      mockRunFullDriveInit.mockRejectedValue(new Error('rateLimitExceeded'));
      mockIsRetryable.mockReturnValue(true);

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(503);
      expect(res.body.retryable).toBe(true);
    });

    it('maps a non-retryable failure to 500', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
      });
      mockGetAccessToken.mockResolvedValue('fresh-token');
      mockRunFullDriveInit.mockRejectedValue(new Error('bad layout'));

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(500);
      expect(res.body.retryable).toBe(false);
    });
  });

  describe('GET /api/storage/initialize/:identityId/status', () => {
    it('rejects wrong bearer pn with 403', async () => {
      currentBearer = 'pn-attacker';

      const res = await request(buildApp())
        .get(`/api/storage/initialize/${PN}/status`)
        .expect(403);

      expect(res.body).toEqual({ error: 'forbidden', reason: 'pn_mismatch' });
    });

    it('reports idle when nothing is running', async () => {
      const res = await request(buildApp())
        .get(`/api/storage/initialize/${PN}/status`)
        .expect(200);

      expect(res.body).toEqual({ identityId: PN, inFlight: false, progress: null });
    });

    it('reports in-flight when progress is active', async () => {
      mockProgressActive.mockReturnValue(true);
      mockGetProgress.mockReturnValue({ step: 'sheets', completed: 3, total: 9 });

      const res = await request(buildApp())
        .get(`/api/storage/initialize/${PN}/status`)
        .expect(200);

      expect(res.body.inFlight).toBe(true);
      expect(res.body.progress).toEqual({ step: 'sheets', completed: 3, total: 9 });
    });
  });

  describe('PUT /api/storage/cloud-vault/:identityId', () => {
    const sealedEnvelope = {
      v: 1,
      alg: 'test',
      ciphertext: 'c',
      iv: 'i',
      salt: 's',
    };

    it('allows first seal when vault is empty and session is unkeyed (Case A bootstrap)', async () => {
      gateIsKeyed = false;
      gateFirstDeviceKeyedAt = undefined;
      mockGetSealedVault.mockResolvedValue(null);

      const res = await request(buildApp())
        .put(`/api/storage/cloud-vault/${PN}`)
        .send({ envelope: sealedEnvelope })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPutSealedVault).toHaveBeenCalledWith(PN, sealedEnvelope);
    });

    it('allows overwrite of existing vault for Case A unkeyed (unkeyed_legacy)', async () => {
      gateIsKeyed = false;
      gateFirstDeviceKeyedAt = undefined;
      mockGetSealedVault.mockResolvedValue(sealedEnvelope);

      const res = await request(buildApp())
        .put(`/api/storage/cloud-vault/${PN}`)
        .send({ envelope: { ...sealedEnvelope, ciphertext: 'new' } })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPutSealedVault).toHaveBeenCalled();
    });

    it('denies overwrite of existing vault for Case B unkeyed (unkeyed_restricted)', async () => {
      gateIsKeyed = false;
      gateFirstDeviceKeyedAt = '2026-01-01T00:00:00.000Z';
      mockGetSealedVault.mockResolvedValue(sealedEnvelope);

      const res = await request(buildApp())
        .put(`/api/storage/cloud-vault/${PN}`)
        .send({ envelope: { ...sealedEnvelope, ciphertext: 'new' } })
        .expect(403);

      expect(res.body).toEqual({ error: 'device_key_required', reason: 'device_required' });
      expect(mockPutSealedVault).not.toHaveBeenCalled();
    });

    it('allows overwrite when session is keyed', async () => {
      gateIsKeyed = true;
      gateFirstDeviceKeyedAt = '2026-01-01T00:00:00.000Z';
      mockGetSealedVault.mockResolvedValue(sealedEnvelope);

      const res = await request(buildApp())
        .put(`/api/storage/cloud-vault/${PN}`)
        .send({ envelope: { ...sealedEnvelope, ciphertext: 'new' } })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockPutSealedVault).toHaveBeenCalled();
    });
  });

  describe('GET /api/storage/:identityId/layout/status', () => {
    it('reports incomplete when index exists but migrations are missing', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { pnDriveIndex: completePnDriveIndex() },
      });

      const res = await request(buildApp()).get(`/api/storage/${PN}/layout/status`).expect(200);

      expect(res.body.complete).toBe(false);
      expect(res.body.required).toBe(CURRENT_CLOUD_LAYOUT_VERSION);
      expect(res.body.pending.map((p: { id: string }) => p.id)).toContain(
        MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1
      );
    });

    it('reports complete when stamped', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: {
          pnDriveIndex: completePnDriveIndex(),
          cloudLayoutVersion: CURRENT_CLOUD_LAYOUT_VERSION,
          appliedMigrations: [MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1],
        },
      });

      const res = await request(buildApp()).get(`/api/storage/${PN}/layout/status`).expect(200);
      expect(res.body.complete).toBe(true);
      expect(res.body.pending).toEqual([]);
    });
  });

  describe('POST /api/storage/:identityId/layout/upgrade', () => {
    it('returns 409 cloud_token_required under custody without X-PN-Cloud-Access-Token', async () => {
      mockCustodyEnabled.mockReturnValue(true);
      mockGetCredentials.mockResolvedValue({
        credentials: {
          googleDriveAccounts: [{ backendId: 'acct-1' }],
          pnDriveIndex: completePnDriveIndex(),
        },
      });

      const res = await request(buildApp()).post(`/api/storage/${PN}/layout/upgrade`).expect(409);
      expect(res.body.error).toBe('cloud_token_required');
      expect(mockEnsureInboxChannel).not.toHaveBeenCalled();
    });

    it('runs inbox migration and stamps complete when cloud token is forwarded', async () => {
      mockCustodyEnabled.mockReturnValue(true);
      const creds: Record<string, unknown> = {
        googleDriveAccounts: [{ backendId: 'acct-1' }],
        pnDriveIndex: completePnDriveIndex(),
      };
      mockGetCredentials.mockImplementation(async () => ({ credentials: { ...creds } }));
      mockUpsertCredentials.mockImplementation(async (_id: string, next: Record<string, unknown>) => {
        Object.assign(creds, next);
        return upsertResult();
      });

      const res = await request(buildApp())
        .post(`/api/storage/${PN}/layout/upgrade`)
        .set('X-PN-Cloud-Access-Token', 'ya29.test-upgrade')
        .expect(200);

      expect(mockEnsureInboxChannel).toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(res.body.complete).toBe(true);
      expect(res.body.appliedMigrations).toContain(MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1);
    });
  });

  describe('POST /api/storage/migrate-volume-id', () => {
    it('requires legacy, canonical, and publicKey', async () => {
      const res = await request(buildApp())
        .post('/api/storage/migrate-volume-id')
        .send({ legacyPnIdentifier: 'legacy' })
        .expect(400);
      expect(res.body.error).toContain('publicKey');
    });

    it('returns 404 when the legacy record is absent', async () => {
      mockMigrateIdentityId.mockResolvedValue(null);

      await request(buildApp())
        .post('/api/storage/migrate-volume-id')
        .send({ legacyPnIdentifier: 'legacy', canonicalPnIdentifier: 'canonical', publicKey: 'pk' })
        .expect(404);
    });

    it('normalizes both identifiers to pn- form before migrating', async () => {
      mockMigrateIdentityId.mockResolvedValue({ identityId: 'pn-canonical' });

      const res = await request(buildApp())
        .post('/api/storage/migrate-volume-id')
        .send({
          legacyPnIdentifier: 'legacy',
          canonicalPnIdentifier: 'pn-canonical',
          publicKey: 'pk',
          driveFolderId: 'folder-1',
        })
        .expect(200);

      expect(mockMigrateIdentityId).toHaveBeenCalledWith('pn-legacy', 'pn-canonical', {
        driveFolderId: 'folder-1',
        publicKey: 'pk',
      });
      expect(res.body).toEqual({ success: true, identityId: 'pn-canonical' });
    });
  });
});
