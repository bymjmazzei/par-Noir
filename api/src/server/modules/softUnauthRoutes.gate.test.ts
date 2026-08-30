/**
 * @jest-environment node
 *
 * Soft / mutating admin & owner routes must reject unauthenticated callers.
 * Falsification: without these gates the same requests returned 200/500, not 401/403.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false,
}));

jest.mock('../utils/database', () => ({
  getDatabasePool: () => ({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  }),
}));

jest.mock('../utils/cache', () => ({
  invalidateIndexCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../jobs/reconcilePublicAggregatorJob', () => ({
  runReconcilePublicAggregator: jest.fn().mockResolvedValue({
    usersChecked: 0,
    filesRemoved: 0,
    usersPurged: 0,
  }),
}));

jest.mock('./userStorageSyncService', () => ({
  userStorageSyncService: {
    syncPortableUsers: jest.fn().mockResolvedValue({ synced: 0 }),
  },
}));

jest.mock('./verificationIntegrationService', () => ({
  VerificationIntegrationService: {
    syncVerificationStatus: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./thirdPartyIndexersService', () => ({
  getThirdPartyIndexersService: () => ({
    upsertAccess: jest.fn().mockResolvedValue(undefined),
    getAccessForIdentity: jest.fn().mockResolvedValue([]),
    setFileOverrides: jest.fn().mockResolvedValue(undefined),
    getFileOverrides: jest.fn().mockResolvedValue([]),
    listIndexers: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      getFileMetadata: jest.fn().mockResolvedValue(null),
      updateIndexingPermissions: jest.fn().mockResolvedValue(null),
    }),
  },
}));

let currentBearer: string | null = null;
let grantedCapabilities: string[] = ['profile.write'];

jest.mock('./deviceCapabilityService', () => {
  const DEVICE_CAPABILITIES = {
    profileWrite: 'profile.write',
    driveUpload: 'drive.upload',
  };
  return {
    DEVICE_CAPABILITIES,
    normalizePnIdentifier: (pn: string) => pn,
    getBearerPnIdentifier: () => currentBearer,
    assertDeviceCapability: async () => ({ ok: true, ctx: {} }),
    gateOwnerRoute: async (
      _req: unknown,
      res: { status: (n: number) => { json: (b: unknown) => void } },
      cap: string,
      targetPn?: string
    ) => {
      if (!currentBearer) {
        res.status(401).json({ error: 'unauthorized' });
        return null;
      }
      if (targetPn !== undefined && currentBearer !== targetPn) {
        res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
        return null;
      }
      if (!grantedCapabilities.includes(cap)) {
        res.status(403).json({ error: 'capability_not_allowed' });
        return null;
      }
      return {};
    },
  };
});

jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: () =>
    currentBearer ? { pnIdentifier: currentBearer, did: currentBearer } : null,
}));

import express from 'express';
import request from 'supertest';
import { setupAggregatorRoutes } from './aggregatorRoutes';
import { registerVerificationSyncRoute } from './verificationRoutes';
import { registerThirdPartyRoutes } from './thirdPartyRoutes';

const passthroughLimiter: express.RequestHandler = (_req, _res, next) => next();

function buildAggregatorApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  setupAggregatorRoutes(app, {
    aggregatorLimiter: passthroughLimiter,
    metadataIndexReadLimiter: passthroughLimiter,
    extractAccountId: () => undefined,
    getMetadataFolder: async () => null,
    driveNotInitialized: (res: express.Response) => {
      res.status(409).json({ error: 'drive_not_initialized' });
      return res;
    },
    scheduleDriveIndexUpdates: () => undefined,
  });
  return app;
}

function buildVerificationApp() {
  const app = express();
  app.use(express.json());
  registerVerificationSyncRoute(app);
  return app;
}

function buildThirdPartyApp() {
  const app = express();
  app.use(express.json());
  registerThirdPartyRoutes(app);
  return app;
}

beforeEach(() => {
  currentBearer = null;
  grantedCapabilities = ['profile.write'];
  delete process.env.ADMIN_API_KEY;
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_UNSAFE_DEV_ADMIN_BYPASS = 'false';
});

describe('soft unauth aggregator admin routes', () => {
  const cases: Array<{ method: 'get' | 'post'; path: string }> = [
    { method: 'get', path: '/api/aggregator/metadata-index/debug' },
    { method: 'post', path: '/api/aggregator/metadata-index/invalidate-cache' },
    { method: 'post', path: '/api/aggregator/metadata-index/cleanup-tables' },
    { method: 'post', path: '/api/aggregator/metadata-index/reconcile' },
    { method: 'post', path: '/api/aggregator/metadata-index/sync' },
    { method: 'get', path: '/api/aggregator/fix-feeds' },
  ];

  for (const c of cases) {
    it(`${c.method.toUpperCase()} ${c.path} rejects without admin key`, async () => {
      const app = buildAggregatorApp();
      const res = await request(app)[c.method](c.path).send({});
      expect([401, 403, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  }
});

describe('POST /api/verification/sync', () => {
  it('rejects without admin key', async () => {
    const res = await request(buildVerificationApp())
      .post('/api/verification/sync')
      .send({
        identityId: 'pn-attacker',
        verificationId: 'v1',
        verifiedAt: new Date().toISOString(),
      });
    expect([401, 403, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});

describe('third-party mutating routes', () => {
  it('PUT /api/third-party/access/:identity rejects unauthenticated', async () => {
    currentBearer = null;
    const res = await request(buildThirdPartyApp())
      .put('/api/third-party/access/pn-victim')
      .send({ updates: [] });
    expect(res.status).toBe(401);
  });

  it('PUT /api/third-party/access/:identity rejects pn mismatch', async () => {
    currentBearer = 'pn-attacker';
    const res = await request(buildThirdPartyApp())
      .put('/api/third-party/access/pn-victim')
      .set('Authorization', 'Bearer test')
      .send({ updates: [] });
    expect(res.status).toBe(403);
  });

  it('PUT /api/third-party/files/:fileId/index-visibility rejects unauthenticated', async () => {
    currentBearer = null;
    const res = await request(buildThirdPartyApp())
      .put('/api/third-party/files/file-1/index-visibility')
      .send({ indexingPermissions: { mode: 'none' } });
    expect(res.status).toBe(401);
  });
});
