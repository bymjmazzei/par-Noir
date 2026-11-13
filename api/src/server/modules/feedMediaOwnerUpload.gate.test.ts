/**
 * @jest-environment node
 *
 * Feed media routes: binary owner-upload for 1080p HD previews, HD for every viewer,
 * the unverified daily view-start cap (no byte cap), and the server-decided plan.
 */
import express from 'express';
import request from 'supertest';
import { FEED_FREE_DAILY_VIEW_STARTS } from '@par-noir/aggregator-domain';

jest.mock('../../utils/logger', () => ({
  safeLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  hashIdentifier: jest.fn(() => 'hashed'),
}));

const cache = new Map<string, unknown>();
jest.mock('../utils/cache', () => ({
  getCache: jest.fn(async (k: string) => cache.get(k) ?? null),
  setCache: jest.fn(async (k: string, v: unknown) => {
    cache.set(k, v);
  }),
}));

const putMock = jest.fn(async () => undefined);
const deleteMock = jest.fn(async () => undefined);
const presignMock = jest.fn(async () => ({ url: 'https://r2/put', maxBytes: 1 }));
jest.mock('./feedPreviewR2', () => ({
  getFeedR2: jest.fn(() => ({ config: { signedGetTtlSec: 300 } })),
  feedR2Put: (...args: unknown[]) => (putMock as jest.Mock)(...args),
  feedR2Head: jest.fn(async () => ({ size: 1 })),
  feedR2Delete: (...args: unknown[]) => (deleteMock as jest.Mock)(...args),
  feedR2PresignedPutUrl: (...args: unknown[]) => (presignMock as jest.Mock)(...args),
  feedR2SignedGetUrl: jest.fn(async (key: string) => `https://r2/${key}`),
}));

let bearerPn: string | null = 'pn-owner';
jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: jest.fn(() => (bearerPn ? { pnIdentifier: bearerPn } : null)),
}));

let verified = false;
jest.mock('./engagementService', () => ({
  EngagementService: { isIdentityVerifiedForMonetization: jest.fn(async () => verified) },
}));

const hdRef = { r2Key: 'feed/f1/hd', contentType: 'video/mp4', byteSize: 30_000_000, r2Warm: true };
const sdRef = { r2Key: 'feed/f1/sd', contentType: 'video/mp4', byteSize: 3_000_000, r2Warm: true };
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      getFileMetadata: jest.fn(async () => ({
        metadata: { isPublic: true, feedPreviewHd: hdRef, feedPreviewSd: sdRef },
      })),
      updateMetadata: jest.fn(async () => undefined),
    }),
  },
}));

jest.mock('./mediaFingerprints', () => ({
  enqueueFingerprint: jest.fn(),
  creditFromMetadata: jest.fn(() => undefined),
}));

jest.mock('./publicBlobAccess', () => ({
  PublicBlobAccessError: class PublicBlobAccessError extends Error {},
  fetchPublicBytesTimed: jest.fn(),
}));

import { registerFeedMediaRoutes } from './feedMediaRoutes';

function app() {
  const a = express();
  a.use((req, res, next) => express.json({ limit: '10mb' })(req, res, next));
  registerFeedMediaRoutes(a);
  return a;
}

describe('feed-media owner-upload', () => {
  beforeEach(() => {
    cache.clear();
    putMock.mockClear();
    bearerPn = 'pn-owner';
    verified = false;
  });

  it('accepts a raw binary HD body larger than the 10mb JSON limit', async () => {
    const bytes = Buffer.alloc(12 * 1024 * 1024, 1);
    const res = await request(app())
      .post('/api/aggregator/feed-media/owner-upload')
      .query({ fileId: 'f1', variant: 'hd', contentType: 'video/mp4', durationMs: 30_000 })
      .set('Content-Type', 'application/octet-stream')
      .send(bytes);
    expect(res.status).toBe(200);
    expect(res.body.byteSize).toBe(bytes.length);
    expect(putMock).toHaveBeenCalledTimes(1);
    const [, body, contentType] = putMock.mock.calls[0] as unknown as [string, Buffer, string];
    expect(body.length).toBe(bytes.length);
    expect(contentType).toBe('video/mp4');
  });

  it('rejects an upload with no body', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/owner-upload')
      .query({ fileId: 'f1', variant: 'sd' })
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(0));
    expect(res.status).toBe(400);
  });

  it('ignores a client-claimed plan and stores nothing for a video past the real limit', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/owner-upload')
      .query({ fileId: 'f1', variant: 'sd', contentType: 'video/mp4', planId: 'scale', durationMs: 90_000 })
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(1024, 1));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('exceeds_tier_max_duration');
    expect(res.body.plan.planId).toBe('free');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('requires a length on video uploads', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/owner-upload')
      .query({ fileId: 'f1', variant: 'sd', contentType: 'video/mp4' })
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(1024, 1));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('duration_required');
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe('feed-media plan is decided by the server', () => {
  beforeEach(() => {
    presignMock.mockClear();
    deleteMock.mockClear();
    bearerPn = 'pn-owner';
    verified = false;
  });

  it('gives a verified account floor whatever plan the client asks for', async () => {
    verified = true;
    const res = await request(app())
      .get('/api/aggregator/publish-plan')
      .query({ planId: 'scale' })
      .set('x-pn-publish-plan', 'scale');
    expect(res.status).toBe(200);
    expect(res.body.plan.planId).toBe('floor');
    expect(res.body.plan).not.toHaveProperty('uploadBytesUsed');
  });

  it('presign refuses a video past the limit before signing anything', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/presign-upload')
      .send({
        fileId: 'f1',
        variant: 'sd',
        contentType: 'video/mp4',
        contentLength: 1024,
        planId: 'scale',
        durationMs: 120_000,
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('exceeds_tier_max_duration');
    expect(presignMock).not.toHaveBeenCalled();
  });

  it('confirm deletes a stored video that reports a length past the limit', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/confirm-upload')
      .send({
        fileId: 'f1',
        variant: 'sd',
        ref: { r2Key: 'feed/f1/sd/long', contentType: 'video/mp4', byteSize: 1024, durationMs: 120_000 },
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('exceeds_tier_max_duration');
    expect(deleteMock).toHaveBeenCalledWith('feed/f1/sd/long');
  });

  it('confirm no longer reports a monthly byte total', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/confirm-upload')
      .send({
        fileId: 'f1',
        variant: 'sd',
        ref: { r2Key: 'feed/f1/sd/ok', contentType: 'video/mp4', byteSize: 1024, durationMs: 20_000 },
      });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('uploadBytesUsed');
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('public-media HD for every viewer', () => {
  beforeEach(() => {
    cache.clear();
    bearerPn = null;
  });

  it('serves the HD ref to an unverified viewer', async () => {
    const res = await request(app())
      .get('/api/aggregator/public-media/f1')
      .query({ variant: 'hd' })
      .set('X-PN-Anon-Id', 'anon-1');
    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('hd');
    expect(res.body.url).toBe('https://r2/feed/f1/hd');
  });

  it('caps unverified viewers by daily view starts, not bytes', async () => {
    const a = app();
    for (let i = 0; i < FEED_FREE_DAILY_VIEW_STARTS; i++) {
      const ok = await request(a)
        .get('/api/aggregator/public-media/f1')
        .query({ variant: 'hd' })
        .set('X-PN-Anon-Id', 'anon-2');
      expect(ok.status).toBe(200);
    }
    const capped = await request(a)
      .get('/api/aggregator/public-media/f1')
      .query({ variant: 'hd' })
      .set('X-PN-Anon-Id', 'anon-2');
    expect(capped.status).toBe(429);
    expect(capped.body.error).toBe('daily_view_cap');
    expect(capped.body.mbUsed).toBeUndefined();
  });
});
