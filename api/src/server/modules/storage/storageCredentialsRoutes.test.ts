/**
 * @jest-environment node
 *
 * Status-code and payload branches for the storage credential + Drive init routes.
 * Every collaborator (credential store, Drive proxy, init coordinator) is mocked.
 */
jest.mock('../deviceCapabilityService', () => ({
  gateOwnerRoute: jest.fn(async () => ({ pnIdentifier: 'pn-test' })),
  gateStorageCredentialsPut: jest.fn(async () => ({ pnIdentifier: 'pn-test' })),
  DEVICE_CAPABILITIES: { driveRead: 'drive.read' },
}));

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

const PN = 'pn-test';

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

    it('refreshes tokens for accounts that carry a refresh token, then returns the record', async () => {
      const record = {
        identityId: PN,
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1', refresh_token: 'r' }] },
        cid: 'cid-1',
        updatedAt: 'u',
        createdAt: 'c',
      };
      mockGetCredentials.mockResolvedValue(record);
      mockGetAccessToken.mockResolvedValue('fresh-token');

      const res = await request(buildApp()).get(`/api/storage/credentials/${PN}`).expect(200);

      expect(mockGetAccessToken).toHaveBeenCalledWith(PN, 'acct-1', [PN]);
      expect(res.body.success).toBe(true);
      expect(res.body.cid).toBe('cid-1');
    });

    it('still returns the record when the refresh attempt fails', async () => {
      mockGetCredentials.mockResolvedValue({
        identityId: PN,
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1', refresh_token: 'r' }] },
        cid: null,
        updatedAt: 'u',
        createdAt: 'c',
      });
      mockGetAccessToken.mockRejectedValue(new Error('revoked'));

      const res = await request(buildApp()).get(`/api/storage/credentials/${PN}`).expect(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/storage/initialize/:identityId', () => {
    it('returns 404 when no Google Drive account is connected', async () => {
      mockGetCredentials.mockResolvedValue({ credentials: {} });

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(404);
      expect(res.body.error).toBe('No Google Drive accounts connected');
    });

    it('returns 400 when no access token can be obtained', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
      });
      mockGetAccessToken.mockRejectedValue(new Error('device custody'));

      const res = await request(buildApp()).post(`/api/storage/initialize/${PN}`).expect(400);
      expect(res.body.error).toBe('No Google Drive access token available for this identity');
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
