/**
 * @jest-environment node
 *
 * Silent fingerprints: confirming a poster or sd preview records a private perceptual
 * fingerprint in the background, revoking deletes it, re-encodes and clips still match,
 * and the near-duplicate metric reports counts only.
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';

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

const objects = new Map<string, Buffer>();
jest.mock('./feedPreviewR2', () => ({
  getFeedR2: jest.fn(() => ({ config: { signedGetTtlSec: 300 } })),
  feedR2Put: jest.fn(async () => undefined),
  feedR2Head: jest.fn(async () => ({ size: 1 })),
  feedR2Delete: jest.fn(async () => undefined),
  feedR2GetBytes: jest.fn(async (key: string) => objects.get(key) ?? null),
  feedR2PresignedPutUrl: jest.fn(async () => ({ url: 'https://r2/put', maxBytes: 1 })),
  feedR2SignedGetUrl: jest.fn(async (key: string) => `https://r2/${key}`),
}));

jest.mock('../middleware/authMiddleware', () => ({
  getBearerTokenPayload: jest.fn(() => ({ pnIdentifier: 'pn-owner' })),
}));

jest.mock('./engagementService', () => ({
  EngagementService: { isIdentityVerifiedForMonetization: jest.fn(async () => false) },
}));

jest.mock('./publicBlobAccess', () => ({
  PublicBlobAccessError: class PublicBlobAccessError extends Error {},
  fetchPublicBytesTimed: jest.fn(),
}));

let rowMetadata: Record<string, unknown> = {};
jest.mock('./aggregatorMetadataServiceDB', () => ({
  AggregatorMetadataServiceDB: {
    getInstance: () => ({
      getFileMetadata: jest.fn(async () => ({ pnIdentifier: 'pn-owner', metadata: rowMetadata })),
      updateMetadata: jest.fn(async () => undefined),
    }),
  },
}));

type FpRow = {
  file_id: string;
  variant: string;
  uploader_pn: string;
  algorithm: string;
  hashes: string[];
  has_verified_manifest: boolean;
  credited_creator: string | null;
};
const table = new Map<string, FpRow>();
const fakeDb = {
  query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO media_fingerprints')) {
      const [file_id, variant, uploader_pn, algorithm, hashes, has, credited] = params as [string, string, string, string, string[], boolean, string | null];
      table.set(`${file_id}|${variant}`, { file_id, variant, uploader_pn, algorithm, hashes, has_verified_manifest: has, credited_creator: credited });
    } else if (sql.includes('DELETE FROM media_fingerprints')) {
      for (const k of [...table.keys()]) if (k.startsWith(`${params[0]}|`)) table.delete(k);
    } else if (sql.includes('UPDATE media_fingerprints')) {
      for (const r of table.values()) if (r.file_id === params[0]) Object.assign(r, { has_verified_manifest: params[1], credited_creator: params[2] });
    } else if (sql.includes('FROM media_fingerprints')) {
      return { rows: [...table.values()] };
    }
    return { rows: [] };
  },
};
jest.mock('../utils/database', () => ({ getDatabasePool: () => fakeDb }));

import { registerFeedMediaRoutes } from './feedMediaRoutes';
import {
  IMAGE_ALGORITHM,
  NEAR_BITS,
  VIDEO_ALGORITHM,
  decodeGrayFrames,
  fingerprintPreview,
  hamming,
  phash,
  runNearDuplicateMetric,
} from './mediaFingerprints';

jest.setTimeout(60_000);

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const itMedia = hasFfmpeg ? it : it.skip;

let dir: string;
function ffmpeg(args: string[], out: string): Buffer {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, path.join(dir, out)], { stdio: 'pipe' });
  return readFileSync(path.join(dir, out));
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'fp-test-'));
});

beforeEach(() => {
  table.clear();
  objects.clear();
  cache.clear();
  rowMetadata = {};
});

function app() {
  const a = express();
  a.use(express.json());
  registerFeedMediaRoutes(a);
  return a;
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 50));
}

const poster = (key: string) => ({ r2Key: key, contentType: 'image/jpeg', byteSize: 1000, r2Warm: true });

describe('perceptual hash', () => {
  it('is stable for one frame and counts differing bits', () => {
    const frame = Uint8Array.from({ length: 1024 }, (_, i) => (i * 37) % 256);
    expect(phash(frame)).toMatch(/^[0-9a-f]{16}$/);
    expect(phash(frame)).toBe(phash(frame));
    expect(hamming('0000000000000000', '000000000000000f')).toBe(4);
  });

  itMedia('matches a re-encoded, resized copy and not a different image', async () => {
    const png = ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x480', '-frames:v', '1'], 'a.png');
    const jpeg = ffmpeg(['-i', path.join(dir, 'a.png'), '-vf', 'scale=320:240', '-q:v', '20'], 'a.jpg');
    const other = ffmpeg(['-f', 'lavfi', '-i', 'mandelbrot=size=640x480', '-frames:v', '1'], 'b.png');
    const [a] = await decodeGrayFrames(png, 'image');
    const [b] = await decodeGrayFrames(jpeg, 'image');
    const [c] = await decodeGrayFrames(other, 'image');
    expect(hamming(phash(a!), phash(b!))).toBeLessThanOrEqual(NEAR_BITS);
    expect(hamming(phash(a!), phash(c!))).toBeGreaterThan(NEAR_BITS);
  });
});

describe('fingerprints on confirm and revoke', () => {
  itMedia('confirming a poster records a private fingerprint in the background; revoke deletes it', async () => {
    objects.set('feed/f1/poster', ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x240', '-frames:v', '1'], 'p.jpg'));
    rowMetadata = { isPublic: true, c2pa: { trust: 'trusted', creator: { kind: 'pn', handle: 'ana', authorKeyId: 'key-1' } } };

    const res = await request(app())
      .post('/api/aggregator/feed-media/confirm-upload')
      .send({ fileId: 'f1', variant: 'poster', ref: poster('feed/f1/poster') });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/hash|fingerprint/i);

    await until(() => table.size > 0);
    expect(table.get('f1|poster')).toMatchObject({
      uploader_pn: 'pn-owner',
      algorithm: IMAGE_ALGORITHM,
      has_verified_manifest: true,
      credited_creator: 'key-1',
    });

    rowMetadata = { isPublic: true, feedPoster: poster('feed/f1/poster') };
    const revoked = await request(app()).post('/api/aggregator/feed-media/f1/revoke').send({});
    expect(revoked.status).toBe(200);
    expect(table.size).toBe(0);
  });

  it('does not fingerprint hd renditions', async () => {
    const res = await request(app())
      .post('/api/aggregator/feed-media/confirm-upload')
      .send({ fileId: 'f2', variant: 'hd', ref: { ...poster('feed/f2/hd'), contentType: 'video/mp4' } });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(table.size).toBe(0);
  });
});

describe('near-duplicate metric', () => {
  itMedia('finds a stripped clip of a credentialed video by another uploader and reports counts only', async () => {
    const full = ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=24', '-t', '12', '-pix_fmt', 'yuv420p'], 'full.mp4');
    const clip = ffmpeg(['-ss', '3', '-i', path.join(dir, 'full.mp4'), '-t', '5', '-vf', 'scale=320:180', '-b:v', '200k'], 'clip.mp4');
    const unrelated = ffmpeg(['-f', 'lavfi', '-i', 'mandelbrot=size=480x270:rate=24', '-t', '6', '-pix_fmt', 'yuv420p'], 'other.mp4');
    objects.set('full', full);
    objects.set('clip', clip);
    objects.set('other', unrelated);

    const credited = { hasVerifiedManifest: true, creditedCreator: 'key-1' };
    const none = { hasVerifiedManifest: false, creditedCreator: null };
    await fingerprintPreview({ fileId: 'orig', variant: 'sd', uploaderPn: 'pn-ana', r2Key: 'full', credit: credited });
    await fingerprintPreview({ fileId: 'repost', variant: 'sd', uploaderPn: 'pn-clipper', r2Key: 'clip', credit: none });
    await fingerprintPreview({ fileId: 'own', variant: 'sd', uploaderPn: 'pn-bo', r2Key: 'other', credit: none });
    expect(table.get('orig|sd')!.algorithm).toBe(VIDEO_ALGORITHM);
    expect(table.get('orig|sd')!.hashes.length).toBeGreaterThanOrEqual(11);

    const counts = await runNearDuplicateMetric();
    expect(counts).toEqual({
      posts: 3,
      duplicated: 2,
      duplicatedWithManifest: 1,
      duplicatedWithoutManifest: 1,
      matchingCredentialed: 1,
    });
    expect(Object.values(counts).every((v) => typeof v === 'number')).toBe(true);
  });
});
