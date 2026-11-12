/**
 * Silent perceptual fingerprints of public feed previews (v1: recorded, never acted on).
 * Posters get one DCT pHash; sd video gets one pHash per second so v2 can match a short
 * re-encoded clip inside a longer original. Rows are private and deleted on revoke; the
 * only output is an aggregate near-duplicate count with no identifiers.
 */

import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { Pool } from 'pg';
import { getDatabasePool } from '../utils/database';
import { safeLogger } from '../../utils/logger';
import { nextZonedHour } from '../utils/zonedTime';
import { feedR2GetBytes } from './feedPreviewR2';

export const IMAGE_ALGORITHM = 'phash-dct32-v1';
export const VIDEO_ALGORITHM = 'phash-dct32-fps1-v1';

const SIDE = 32;
const LOW = 8;
const MAX_FRAMES = 600;
/** Near-duplicate when at most this many of 64 bits differ (8 bands: a match shares a band). */
export const NEAR_BITS = 6;
/** A video near-duplicates another when this many of its seconds match. */
const VIDEO_MATCH_FRAMES = 3;

const COS: Float64Array[] = Array.from({ length: LOW }, (_, u) => {
  const row = new Float64Array(SIDE);
  for (let x = 0; x < SIDE; x++) row[x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIDE));
  return row;
});

/** 64-bit pHash (16 hex chars) of a 32x32 grayscale frame: low 8x8 DCT vs. its median. */
export function phash(gray: Uint8Array): string {
  if (gray.length !== SIDE * SIDE) throw new Error('phash_frame_size');
  const coeffs: number[] = [];
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      let sum = 0;
      for (let y = 0; y < SIDE; y++) {
        const cy = COS[u]![y]!;
        for (let x = 0; x < SIDE; x++) sum += gray[y * SIDE + x]! * cy * COS[v]![x]!;
      }
      coeffs.push(sum);
    }
  }
  const ac = coeffs.slice(1);
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]!;
  let bits = 0n;
  for (const c of coeffs) bits = (bits << 1n) | (c > median ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}

export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** 32x32 grayscale frames: one for an image, one per second for a video. */
export async function decodeGrayFrames(bytes: Uint8Array, kind: 'image' | 'video'): Promise<Uint8Array[]> {
  // MP4s whose index trails the media can't be read from a pipe.
  const dir = await mkdtemp(path.join(tmpdir(), 'pn-fp-'));
  const input = path.join(dir, 'in');
  try {
    await writeFile(input, bytes);
    const filter = `${kind === 'video' ? 'fps=1,' : ''}scale=${SIDE}:${SIDE}:flags=area,format=gray`;
    const args = ['-v', 'error', '-i', input, '-vf', filter, '-frames:v', String(kind === 'video' ? MAX_FRAMES : 1), '-f', 'rawvideo', 'pipe:1'];
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      proc.stdout.on('data', (c: Buffer) => chunks.push(c));
      proc.stderr.on('data', () => undefined);
      proc.on('error', reject);
      proc.on('close', (code) => {
        const out = Buffer.concat(chunks);
        if (code !== 0 && out.length < SIDE * SIDE) reject(new Error(`ffmpeg_exit_${code}`));
        else resolve(out);
      });
    });
    const frames: Uint8Array[] = [];
    for (let o = 0; o + SIDE * SIDE <= raw.length; o += SIDE * SIDE) frames.push(new Uint8Array(raw.subarray(o, o + SIDE * SIDE)));
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Credit = { hasVerifiedManifest: boolean; creditedCreator: string | null };

/** What the index row says about the post's verified credentials, if anything yet. */
export function creditFromMetadata(meta: Record<string, unknown> | null | undefined): Credit {
  const c2pa = meta?.c2pa as { trust?: string; creator?: { kind?: string; authorKeyId?: string; display?: string } | null } | null | undefined;
  if (!c2pa || c2pa.trust === 'invalid') return { hasVerifiedManifest: false, creditedCreator: null };
  const creator = c2pa.creator;
  const credited = creator?.kind === 'pn' ? creator.authorKeyId ?? null : creator?.kind === 'cawg' ? creator.display ?? null : null;
  return { hasVerifiedManifest: true, creditedCreator: credited };
}

export async function fingerprintPreview(
  input: { fileId: string; variant: 'poster' | 'sd'; uploaderPn: string; r2Key: string; credit: Credit },
  deps: { db?: Pick<Pool, 'query'>; getBytes?: (key: string) => Promise<Uint8Array | null> } = {}
): Promise<void> {
  const bytes = await (deps.getBytes ?? feedR2GetBytes)(input.r2Key);
  if (!bytes) return;
  const kind = input.variant === 'sd' ? 'video' : 'image';
  const frames = await decodeGrayFrames(bytes, kind);
  if (!frames.length) return;
  const db = deps.db ?? getDatabasePool();
  await db.query(
    `INSERT INTO media_fingerprints (file_id, variant, uploader_pn, algorithm, hashes, has_verified_manifest, credited_creator)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (file_id, variant) DO UPDATE SET uploader_pn = $3, algorithm = $4, hashes = $5,
       has_verified_manifest = $6, credited_creator = $7, created_at = NOW()`,
    [
      input.fileId,
      input.variant,
      input.uploaderPn,
      kind === 'video' ? VIDEO_ALGORITHM : IMAGE_ALGORITHM,
      frames.map(phash),
      input.credit.hasVerifiedManifest,
      input.credit.creditedCreator
    ]
  );
}

/** Background: a confirmed preview never waits on (or fails because of) its fingerprint. */
export function enqueueFingerprint(input: Parameters<typeof fingerprintPreview>[0]): void {
  setImmediate(() => {
    fingerprintPreview(input).catch((err: unknown) =>
      safeLogger.warn('[fingerprint] skipped', { message: err instanceof Error ? err.message : 'unknown' })
    );
  });
}

export async function recordFingerprintCredit(fileId: string, credit: Credit, db: Pick<Pool, 'query'> = getDatabasePool()): Promise<void> {
  await db.query(
    `UPDATE media_fingerprints SET has_verified_manifest = $2, credited_creator = $3 WHERE file_id = $1`,
    [fileId, credit.hasVerifiedManifest, credit.creditedCreator]
  );
}

export async function deleteFingerprints(fileId: string, db: Pick<Pool, 'query'> = getDatabasePool()): Promise<void> {
  await db.query(`DELETE FROM media_fingerprints WHERE file_id = $1`, [fileId]);
}

type Row = { file_id: string; uploader_pn: string; algorithm: string; hashes: string[]; has_verified_manifest: boolean };

export interface NearDuplicateCounts {
  posts: number;
  /** Posts that near-duplicate a post by a different uploader. */
  duplicated: number;
  duplicatedWithManifest: number;
  duplicatedWithoutManifest: number;
  /** Duplicates without credentials that match a post that had them (stripped reposts). */
  matchingCredentialed: number;
}

function bands(hash: string): string[] {
  return Array.from({ length: 8 }, (_, i) => `${i}:${hash.slice(i * 2, i * 2 + 2)}`);
}

/** Aggregate counts only: no file ids, uploaders or creators leave this function. */
export function countNearDuplicates(rows: Row[]): NearDuplicateCounts {
  const index = new Map<string, Array<{ row: number; hash: string }>>();
  rows.forEach((r, i) => {
    for (const h of r.hashes) for (const b of bands(h)) {
      const list = index.get(`${r.algorithm}|${b}`) ?? [];
      list.push({ row: i, hash: h });
      index.set(`${r.algorithm}|${b}`, list);
    }
  });
  const counts: NearDuplicateCounts = { posts: rows.length, duplicated: 0, duplicatedWithManifest: 0, duplicatedWithoutManifest: 0, matchingCredentialed: 0 };
  rows.forEach((r, i) => {
    const matchedFrames = new Map<number, Set<string>>();
    for (const h of r.hashes) {
      for (const b of bands(h)) {
        for (const cand of index.get(`${r.algorithm}|${b}`) ?? []) {
          const other = rows[cand.row]!;
          if (cand.row === i || other.uploader_pn === r.uploader_pn || hamming(h, cand.hash) > NEAR_BITS) continue;
          const set = matchedFrames.get(cand.row) ?? new Set<string>();
          set.add(h);
          matchedFrames.set(cand.row, set);
        }
      }
    }
    const need = r.algorithm === VIDEO_ALGORITHM ? Math.min(VIDEO_MATCH_FRAMES, r.hashes.length) : 1;
    const matches = [...matchedFrames].filter(([, frames]) => frames.size >= need).map(([j]) => rows[j]!);
    if (!matches.length) return;
    counts.duplicated += 1;
    if (r.has_verified_manifest) counts.duplicatedWithManifest += 1;
    else {
      counts.duplicatedWithoutManifest += 1;
      if (matches.some((m) => m.has_verified_manifest)) counts.matchingCredentialed += 1;
    }
  });
  return counts;
}

/** The v2 trigger: how much stripped reposting there is. Logged as counts only. */
export async function runNearDuplicateMetric(db: Pick<Pool, 'query'> = getDatabasePool()): Promise<NearDuplicateCounts> {
  const { rows } = await db.query(
    `SELECT file_id, uploader_pn, algorithm, hashes, has_verified_manifest FROM media_fingerprints`
  );
  const counts = countNearDuplicates(rows as Row[]);
  safeLogger.info('[fingerprint] near-duplicate metric', { ...counts });
  return counts;
}

export const METRIC_HOUR = 2;
export const METRIC_TIME_ZONE = 'America/Los_Angeles';

/** Daily at 2am Pacific (PST or PDT); deploys and restarts don't push it back. */
export function scheduleNearDuplicateMetric(now: () => Date = () => new Date()): void {
  const at = nextZonedHour(now(), METRIC_HOUR, METRIC_TIME_ZONE);
  setTimeout(() => {
    runNearDuplicateMetric()
      .catch((e: unknown) => safeLogger.warn('[fingerprint] near-duplicate metric failed', { message: e instanceof Error ? e.message : 'unknown' }))
      .finally(() => scheduleNearDuplicateMetric(now));
  }, Math.max(0, at.getTime() - now().getTime()));
}
