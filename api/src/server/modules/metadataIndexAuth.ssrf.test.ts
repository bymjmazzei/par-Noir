/**
 * @jest-environment node
 *
 * POST /api/aggregator/metadata-index must reject unauthenticated writes that
 * can plant publicContentRef.publicUrl (SSRF write path).
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false,
}));

const mockSubmitMetadata = jest.fn().mockResolvedValue(undefined);
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      submitMetadata: mockSubmitMetadata,
      getFileMetadata: jest.fn(),
      updateMetadata: jest.fn(),
      removeMetadata: jest.fn(),
    }),
  },
}));

jest.mock('./repeatInfringerService', () => ({
  isRepeatInfringer: async () => false,
}));

jest.mock('./prismQueueService', () => ({
  isFileApprovedByPrism: async () => true,
  addToPrismQueue: async () => null,
}));

jest.mock('./safePublicFetchUrl', () => {
  return {
    assertSafePublicFetchUrlResolved: async (url: string, backend: string) => {
      const { assertSafePublicFetchUrl } = jest.requireActual(
        '@par-noir/aggregator-domain'
      ) as typeof import('@par-noir/aggregator-domain');
      return assertSafePublicFetchUrl(url, backend);
    },
    fetchSafePublicBytes: jest.fn(),
    UnsafePublicFetchUrlError: (
      jest.requireActual('@par-noir/aggregator-domain') as typeof import('@par-noir/aggregator-domain')
    ).UnsafePublicFetchUrlError,
  };
});

/** Bearer identity under test. */
let currentBearer: string | null = null;
let grantedCapabilities: string[] = ['drive.upload'];

jest.mock('./deviceCapabilityService', () => {
  const DEVICE_CAPABILITIES = {
    driveUpload: 'drive.upload',
  };
  return {
    DEVICE_CAPABILITIES,
    normalizePnIdentifier: (pn: string) => pn,
    getBearerPnIdentifier: () => currentBearer,
    assertDeviceCapability: async (_req: unknown, cap: string) =>
      grantedCapabilities.includes(cap)
        ? { ok: true, ctx: {} }
        : { ok: false, status: 403, error: 'capability_not_allowed' },
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

const validToken = JSON.stringify({
  fileId: 'f1',
  shareKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  contentKey: { encrypted: '', wrappedWith: '', iv: '' },
  expiresAt: '2027-01-01T00:00:00.000Z',
  permissions: ['read'],
});

const validRef = {
  backend: 'google_drive',
  objectId: 'obj-1',
  publicUrl: 'https://drive.google.com/uc?export=download&id=obj-1&confirm=t',
};

const evilRef = {
  backend: 'google_drive',
  objectId: 'obj-evil',
  publicUrl: 'https://169.254.169.254/latest/meta-data/',
};

const passthroughLimiter: express.RequestHandler = (_req, _res, next) => next();

function buildApp() {
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

beforeEach(() => {
  mockSubmitMetadata.mockClear();
  currentBearer = null;
  grantedCapabilities = ['drive.upload'];
});

describe('POST /api/aggregator/metadata-index auth + publicUrl', () => {
  it('rejects unauthenticated write with 401', async () => {
    currentBearer = null;
    const res = await request(buildApp())
      .post('/api/aggregator/metadata-index')
      .send({
        pnIdentifier: 'attacker',
        metadata: {
          fileId: 'f1',
          isPublic: true,
          publicToken: validToken,
          publicContentRef: validRef,
          name: 'x',
        },
      });

    expect(res.status).toBe(401);
    expect(mockSubmitMetadata).not.toHaveBeenCalled();
  });

  it('rejects authenticated plant of evil publicUrl with 400', async () => {
    currentBearer = 'pn-owner';
    const res = await request(buildApp())
      .post('/api/aggregator/metadata-index')
      .set('Authorization', 'Bearer test')
      .send({
        pnIdentifier: 'pn-owner',
        metadata: {
          fileId: 'f-evil',
          isPublic: true,
          publicToken: validToken,
          publicContentRef: evilRef,
          name: 'evil',
        },
      });

    expect(res.status).toBe(400);
    expect(
      res.body.error === 'unsafe_public_url' || res.body.error === 'missing_public_content_ref'
    ).toBe(true);
    expect(mockSubmitMetadata).not.toHaveBeenCalled();
  });

  it('accepts authenticated write with Drive publicUrl using token owner', async () => {
    currentBearer = 'pn-owner';
    const res = await request(buildApp())
      .post('/api/aggregator/metadata-index')
      .set('Authorization', 'Bearer test')
      .send({
        pnIdentifier: 'ignored-body-pn',
        metadata: {
          fileId: 'f-ok',
          isPublic: true,
          publicToken: validToken,
          publicContentRef: validRef,
          name: 'ok',
          mimeType: 'application/octet-stream',
        },
      });

    expect(res.status).toBe(200);
    expect(mockSubmitMetadata).toHaveBeenCalled();
    expect(mockSubmitMetadata.mock.calls[0][1]).toBe('pn-owner');
  });
});
