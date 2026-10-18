/**
 * @jest-environment node
 *
 * PUT /api/aggregator/metadata-index/:fileId with penPostUpdate=true
 * replaces Pen fields in place without touching engagement.
 */
jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: (v: string) => `hash(${v})`,
  isDevVerbose: () => false,
}));

const mockGetFileMetadata = jest.fn();
const mockUpdateMetadata = jest.fn();
const mockFeedR2Delete = jest.fn().mockResolvedValue(undefined);

jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      submitMetadata: jest.fn(),
      getFileMetadata: (...args: unknown[]) => mockGetFileMetadata(...args),
      updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
      removeMetadata: jest.fn(),
    }),
  },
}));

jest.mock('./feedPreviewR2', () => ({
  feedR2Delete: (...args: unknown[]) => mockFeedR2Delete(...args),
  getFeedR2: () => null,
  readFeedR2ConfigFromEnv: () => null,
}));

jest.mock('./repeatInfringerService', () => ({
  isRepeatInfringer: async () => false,
}));

jest.mock('./prismQueueService', () => ({
  isFileApprovedByPrism: async () => true,
  addToPrismQueue: async () => null,
}));

jest.mock('./safePublicFetchUrl', () => ({
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
}));

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

jest.mock('./storage/storageRequestContext', () => ({
  createStorageRequestContext: async () => null,
  getDriveTokenFromContext: () => null,
}));

import express from 'express';
import request from 'supertest';
import { setupAggregatorRoutes } from './aggregatorRoutes';

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

const ownerRow = {
  fileId: 'post-1',
  pnIdentifier: 'pn-owner',
  submittedAt: '2026-01-01T00:00:00.000Z',
  metadata: {
    fileId: 'post-1',
    isPublic: true,
    penDocId: 'doc-1',
    contentClass: 'note',
    fileType: 'note',
    textPost: { content: 'old' },
    penFeedPage: { canvas: {} },
    feedPoster: { r2Key: 'feed/post-1/poster-old' },
    publicToken: JSON.stringify({
      fileId: 'post-1',
      shareKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      contentKey: { encrypted: '', wrappedWith: '', iv: '' },
      expiresAt: '2027-01-01T00:00:00.000Z',
      permissions: ['read'],
    }),
    publicContentRef: {
      backend: 'google_drive',
      objectId: 'post-1',
      publicUrl: 'https://drive.google.com/uc?export=download&id=post-1&confirm=t',
    },
    creator: { identifier: { value: 'pn-owner' } },
  },
};

describe('penPostUpdate metadata-index PUT', () => {
  beforeEach(() => {
    currentBearer = 'pn-owner';
    grantedCapabilities = ['drive.upload'];
    mockGetFileMetadata.mockReset();
    mockUpdateMetadata.mockReset();
    mockFeedR2Delete.mockClear();
    mockGetFileMetadata.mockResolvedValue(ownerRow);
    mockUpdateMetadata.mockResolvedValue(ownerRow);
  });

  it('rejects a non-owner', async () => {
    currentBearer = 'pn-other';
    const res = await request(buildApp())
      .put('/api/aggregator/metadata-index/post-1')
      .send({
        penPostUpdate: true,
        penDocId: 'doc-1',
        isPublic: true,
        title: 'Updated',
        publicToken: ownerRow.metadata.publicToken,
        publicContentRef: ownerRow.metadata.publicContentRef,
      });
    expect(res.status).toBe(403);
    expect(mockUpdateMetadata).not.toHaveBeenCalled();
  });

  it('clears absent Pen keys and deletes superseded R2 keys; engagement is not touched', async () => {
    const res = await request(buildApp())
      .put('/api/aggregator/metadata-index/post-1')
      .send({
        penPostUpdate: true,
        penDocId: 'doc-1',
        penPostUpdatedAt: '2026-02-01T00:00:00.000Z',
        contentClass: 'note',
        fileType: 'note',
        textPost: { content: 'new' },
        isPublic: true,
        title: 'Updated',
        feedPoster: { r2Key: 'feed/post-1/poster-new', r2Warm: true, byteSize: 10 },
        publicToken: ownerRow.metadata.publicToken,
        publicContentRef: ownerRow.metadata.publicContentRef,
      });

    expect(res.status).toBeLessThan(500);
    expect(mockUpdateMetadata).toHaveBeenCalled();
    const patch = mockUpdateMetadata.mock.calls[0][1] as { clearKeys?: string[] };
    expect(patch.clearKeys).toEqual(expect.arrayContaining(['penFeedPage', 'collection', 'feedPreviewSd']));
    expect(patch.clearKeys).not.toContain('textPost');
    expect(patch.clearKeys).not.toContain('feedPoster');
    expect(mockFeedR2Delete).toHaveBeenCalledWith('feed/post-1/poster-old');
    // Engagement tables are never passed to updateMetadata / removeMetadata.
    expect(JSON.stringify(mockUpdateMetadata.mock.calls)).not.toMatch(/engagement/i);
  });
});
