/**
 * @jest-environment node
 *
 * Route-level behaviour for user-scoped endpoints. Everything that touches Drive,
 * OAuth, or the credential store is mocked; no network calls are made.
 */
jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: jest.fn(),
}));

jest.mock('./deviceCapabilityService', () => ({
  gateOwnerRoute: jest.fn(async () => ({ pnIdentifier: 'pn-test' })),
  gateOwnerSelfRoute: jest.fn(async () => true),
  DEVICE_CAPABILITIES: {
    profileRead: 'profile.read',
    profileWrite: 'profile.write',
  },
}));

jest.mock('./storageCredentialsService', () => ({
  storageCredentialsService: { getCredentials: jest.fn() },
}));

jest.mock('./googleDriveProxy', () => ({
  googleDriveProxyService: { getAccessToken: jest.fn() },
}));

jest.mock('./thirdPartyPermissionsService', () => ({
  ThirdPartyPermissionsService: {
    getPermissions: jest.fn(),
    storePermissions: jest.fn(),
  },
}));

jest.mock('./storage/storageProviderUtils', () => ({
  isPortableStorageProvider: jest.fn(async () => false),
}));

jest.mock('./storageTierService', () => ({
  getStorageTier: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { setupUserRoutes, UserRouteDeps } from './userRoutes';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { storageCredentialsService } from './storageCredentialsService';
import { googleDriveProxyService } from './googleDriveProxy';
import { ThirdPartyPermissionsService } from './thirdPartyPermissionsService';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import { getStorageTier } from './storageTierService';

const mockBearerPayload = getBearerTokenPayload as jest.Mock;
const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;
const mockGetPermissions = ThirdPartyPermissionsService.getPermissions as jest.Mock;
const mockStorePermissions = ThirdPartyPermissionsService.storePermissions as jest.Mock;
const mockIsPortable = isPortableStorageProvider as jest.Mock;
const mockGetStorageTier = getStorageTier as jest.Mock;

const PN = 'pn-test';
const AUTH = 'Bearer test-token';

function buildApp(overrides: Partial<UserRouteDeps> = {}) {
  const getMetadataFolder = jest.fn(async () => ({
    metadataFolderId: 'meta-folder',
    pnFolderId: 'pn-folder',
  }));
  const driveNotInitialized = jest.fn((res: express.Response) =>
    res.status(409).json({ error: 'drive_not_initialized' })
  );
  const deps: UserRouteDeps = {
    extractAccountId: (account: any) => account?.backendId || account?.keyPrefix,
    getMetadataFolder: getMetadataFolder as unknown as UserRouteDeps['getMetadataFolder'],
    driveNotInitialized: driveNotInitialized as unknown as UserRouteDeps['driveNotInitialized'],
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  setupUserRoutes(app, deps);
  return { app, deps, getMetadataFolder, driveNotInitialized };
}

/** Drive folder lookups: pN root first, then _metadata. */
function mockDriveFolderLookups(options: { pnFolder?: boolean; metadataFolder?: boolean } = {}) {
  const { pnFolder = true, metadataFolder = true } = options;
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("name='par Noir - ")) {
      return new Response(JSON.stringify({ files: pnFolder ? [{ id: 'pn-folder' }] : [] }), {
        status: 200,
      });
    }
    if (url.includes("name='_metadata'")) {
      return new Response(
        JSON.stringify({ files: metadataFolder ? [{ id: 'meta-folder' }] : [] }),
        { status: 200 }
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function credentialsWithDrive() {
  return {
    credentials: {
      googleDriveAccounts: [{ backendId: 'acct-1' }],
    },
  };
}

describe('setupUserRoutes', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetCredentials.mockReset();
    mockGetAccessToken.mockReset();
    mockGetPermissions.mockReset();
    mockStorePermissions.mockReset();
    mockIsPortable.mockReset().mockResolvedValue(false);
    mockBearerPayload.mockReset();
    mockGetStorageTier.mockReset();
    global.fetch = jest.fn(async () => {
      throw new Error('fetch should not be called');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('GET /api/users/:pnIdentifier/third-party-permissions', () => {
    it('rejects requests without a Bearer token', async () => {
      const { app } = buildApp();
      const res = await request(app).get(`/api/users/${PN}/third-party-permissions`).expect(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(mockGetCredentials).not.toHaveBeenCalled();
    });

    it('returns 404 when no storage provider is connected at all', async () => {
      mockGetCredentials.mockResolvedValue({ credentials: {} });
      const { app } = buildApp();

      const res = await request(app)
        .get(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .expect(404);
      expect(res.body.error).toBe('Storage not connected');
    });

    it('soft-empties when the server cannot mint a Drive token (device cloud custody)', async () => {
      mockGetCredentials.mockResolvedValue(credentialsWithDrive());
      mockGetAccessToken.mockRejectedValue(new Error('oauth secrets are device-held'));
      const { app } = buildApp();

      const res = await request(app)
        .get(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .expect(200);

      expect(res.body).toEqual({ success: true, permissions: {} });
      expect(mockGetPermissions).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('soft-empties when the Drive access token is blank', async () => {
      mockGetCredentials.mockResolvedValue(credentialsWithDrive());
      mockGetAccessToken.mockResolvedValue('');
      const { app } = buildApp();

      const res = await request(app)
        .get(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .expect(200);

      expect(res.body).toEqual({ success: true, permissions: {} });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('soft-empties when the pN root folder does not exist yet', async () => {
      mockGetCredentials.mockResolvedValue(credentialsWithDrive());
      mockGetAccessToken.mockResolvedValue('drive-token');
      mockDriveFolderLookups({ pnFolder: false });
      const { app } = buildApp();

      const res = await request(app)
        .get(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .expect(200);

      expect(res.body).toEqual({ success: true, permissions: {} });
      expect(mockGetPermissions).not.toHaveBeenCalled();
    });

    it('soft-empties when the _metadata folder is missing', async () => {
      mockGetCredentials.mockResolvedValue(credentialsWithDrive());
      mockGetAccessToken.mockResolvedValue('drive-token');
      mockDriveFolderLookups({ metadataFolder: false });
      const { app } = buildApp();

      const res = await request(app)
        .get(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .expect(200);

      expect(res.body).toEqual({ success: true, permissions: {} });
      expect(mockGetPermissions).not.toHaveBeenCalled();
    });

    it('returns stored permissions on the happy path', async () => {
      mockGetCredentials.mockResolvedValue(credentialsWithDrive());
      mockGetAccessToken.mockResolvedValue('drive-token');
      mockDriveFolderLookups();
      mockGetPermissions.mockResolvedValue({ 'browser-app': { dataPoints: ['age_attestation'] } });
      const { app } = buildApp();

      const res = await request(app)
        .get(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.permissions['browser-app'].dataPoints).toEqual(['age_attestation']);
      expect(mockGetPermissions).toHaveBeenCalledWith('drive-token', 'meta-folder', PN, 'acct-1');
    });

    it('normalizes a bare identifier to pn- form before reading credentials', async () => {
      mockGetCredentials.mockResolvedValue({ credentials: {} });
      const { app } = buildApp();

      await request(app)
        .get('/api/users/test/third-party-permissions')
        .set('Authorization', AUTH)
        .expect(404);

      expect(mockGetCredentials).toHaveBeenCalledWith('pn-test');
    });
  });

  describe('PUT /api/users/:pnIdentifier/third-party-permissions', () => {
    it('requires toolId and permission', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({ toolId: 'browser-app' })
        .expect(400);
      expect(res.body.error).toBe('toolId and permission are required');
    });

    it('reports drive-not-initialized when the metadata folder cannot be resolved', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1', access_token: 'tok' }] },
      });
      const { app, driveNotInitialized } = buildApp({
        getMetadataFolder: jest.fn(async () => null) as unknown as UserRouteDeps['getMetadataFolder'],
      });

      await request(app)
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({ toolId: 'some-tool', permission: { dataPoints: [] } })
        .expect(409);

      expect(driveNotInitialized).toHaveBeenCalled();
      expect(mockStorePermissions).not.toHaveBeenCalled();
    });

    it('forces browser-app required/optional data points to the static contract', async () => {
      mockGetCredentials.mockResolvedValue({
        credentials: { googleDriveAccounts: [{ backendId: 'acct-1', access_token: 'tok' }] },
      });
      mockGetPermissions.mockResolvedValue({ 'other-tool': { dataPoints: [] } });
      const { app } = buildApp();

      await request(app)
        .put(`/api/users/${PN}/third-party-permissions`)
        .set('Authorization', AUTH)
        .send({
          toolId: 'browser-app',
          permission: {
            dataPoints: ['age_attestation'],
            requiredDataPoints: ['email_verification'],
            optionalDataPoints: ['phone_verification'],
          },
        })
        .expect(200);

      const stored = mockStorePermissions.mock.calls[0][3];
      expect(stored['browser-app'].requiredDataPoints).toEqual([]);
      expect(stored['browser-app'].optionalDataPoints).toEqual(['age_attestation']);
      expect(stored['browser-app'].dataPoints).toEqual(['age_attestation']);
      expect(stored['other-tool']).toBeDefined();
    });
  });

  describe('GET /api/users/:userPnIdentifier/storage-tier', () => {
    it('rejects an unauthenticated request', async () => {
      mockBearerPayload.mockReturnValue(null);
      const { app } = buildApp();
      const res = await request(app).get(`/api/users/${PN}/storage-tier`).expect(401);
      expect(res.body.error).toBe('Invalid token');
    });

    it('rejects reading another identity tier', async () => {
      mockBearerPayload.mockReturnValue({ pnIdentifier: PN, did: 'did:key:test' });
      const { app } = buildApp();
      const res = await request(app).get('/api/users/pn-someone-else/storage-tier').expect(403);
      expect(res.body.error).toBe('Can only request your own storage tier');
      expect(mockGetStorageTier).not.toHaveBeenCalled();
    });

    it('resolves "me" to the bearer identity', async () => {
      mockBearerPayload.mockReturnValue({ pnIdentifier: PN, did: 'did:key:test' });
      mockGetStorageTier.mockResolvedValue({ tier: 'free', encryptionLimit: 10 });
      const { app } = buildApp();

      const res = await request(app).get('/api/users/me/storage-tier').expect(200);
      expect(res.body).toEqual({ tier: 'free', encryptionLimit: 10 });
      expect(mockGetStorageTier).toHaveBeenCalledWith(PN, 'did:key:test');
    });
  });

  describe('GET /api/users/:pnIdentifier/tag-preferences', () => {
    it('returns an empty list rather than 404 when the identity has no credentials', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const { app } = buildApp();

      const res = await request(app).get(`/api/users/${PN}/tag-preferences`).expect(200);
      expect(res.body).toEqual({ preferences: [] });
    });

    it('returns an empty list when no Drive account is attached', async () => {
      mockGetCredentials.mockResolvedValue({ credentials: {} });
      const { app } = buildApp();

      const res = await request(app).get(`/api/users/${PN}/tag-preferences`).expect(200);
      expect(res.body).toEqual({ preferences: [] });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
