/**
 * Monthly preview ingest metering + free daily view caps (Redis).
 */
import {
  FEED_FREE_DAILY_MB,
  FEED_FREE_DAILY_VIEW_STARTS,
  getPublishTier,
  type PublishTierId,
} from '@par-noir/aggregator-domain';
import { createHash } from 'crypto';

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function hashPn(pn: string): string {
  return createHash('sha256').update(pn).digest('hex').slice(0, 16);
}

export function uploadMeterKey(pnIdentifier: string): string {
  return `feed-upload-gb:v1:${hashPn(pnIdentifier)}:${monthKey()}`;
}

export function freeViewStartsKey(viewerKey: string): string {
  return `feed-free-views:v1:${viewerKey}:${dayKey()}`;
}

export function freeViewMbKey(viewerKey: string): string {
  return `feed-free-mb:v1:${viewerKey}:${dayKey()}`;
}

export function viewerKeyFromRequest(pnIdentifier?: string | null, anonId?: string | null): string {
  if (pnIdentifier) return `pn:${hashPn(pnIdentifier)}`;
  if (anonId) return `anon:${createHash('sha256').update(anonId).digest('hex').slice(0, 16)}`;
  return 'anon:unknown';
}

export async function getUploadBytesUsed(pnIdentifier: string): Promise<number> {
  const { getCache } = await import('../utils/cache');
  const v = await getCache<{ bytes?: number }>(uploadMeterKey(pnIdentifier));
  return typeof v?.bytes === 'number' && Number.isFinite(v.bytes) ? v.bytes : 0;
}

export async function addUploadBytes(pnIdentifier: string, delta: number): Promise<number> {
  const key = uploadMeterKey(pnIdentifier);
  const { getCache, setCache } = await import('../utils/cache');
  const cur = await getUploadBytesUsed(pnIdentifier);
  const next = cur + Math.max(0, delta);
  // ~40 days TTL so month keys expire
  await setCache(key, { bytes: next }, 40 * 24 * 3600);
  return next;
}

export type PublishPlanStatus = {
  planId: PublishTierId | string;
  maxDurationSec: number;
  maxHeight: number;
  allowHd: boolean;
  uploadBytesUsed: number;
  uploadBytesLimit: number;
  softDegraded: boolean;
  retailUsd: number;
};

export async function resolvePublishPlan(
  pnIdentifier: string,
  planId?: string | null
): Promise<PublishPlanStatus> {
  const id = (planId || 'free') as PublishTierId;
  const notch = getPublishTier(id);
  const used = await getUploadBytesUsed(pnIdentifier);
  const softDegraded = notch.id !== 'free' && used >= notch.uploadBytesPerMonth;
  const effective = softDegraded
    ? { ...getPublishTier('free'), id: notch.id, retailUsd: notch.retailUsd }
    : notch;
  return {
    planId: notch.id,
    maxDurationSec: effective.maxDurationSec,
    maxHeight: effective.maxHeight,
    allowHd: effective.allowHd,
    uploadBytesUsed: used,
    uploadBytesLimit: notch.uploadBytesPerMonth,
    softDegraded,
    retailUsd: notch.retailUsd,
  };
}

function freeViewStartsLimit(): number {
  const n = Number(process.env.FEED_FREE_DAILY_VIEW_STARTS);
  return Number.isFinite(n) && n > 0 ? n : FEED_FREE_DAILY_VIEW_STARTS;
}

function freeViewMbLimit(): number {
  const n = Number(process.env.FEED_FREE_DAILY_MB);
  return Number.isFinite(n) && n > 0 ? n : FEED_FREE_DAILY_MB;
}

export type FreeViewGate =
  | { ok: true; startsUsed: number; mbUsed: number }
  | { ok: false; reason: 'daily_view_cap' | 'daily_mb_cap'; startsUsed: number; mbUsed: number };

export async function checkAndConsumeFreeView(
  viewerKey: string,
  approxBytes: number
): Promise<FreeViewGate> {
  const { getCache, setCache } = await import('../utils/cache');
  const sk = freeViewStartsKey(viewerKey);
  const mk = freeViewMbKey(viewerKey);
  const starts = (await getCache<{ n?: number }>(sk))?.n ?? 0;
  const mb = (await getCache<{ n?: number }>(mk))?.n ?? 0;
  const startLimit = freeViewStartsLimit();
  const mbLimit = freeViewMbLimit();
  if (starts >= startLimit) {
    return { ok: false, reason: 'daily_view_cap', startsUsed: starts, mbUsed: mb };
  }
  const addMb = approxBytes / (1024 * 1024);
  if (mb + addMb > mbLimit) {
    return { ok: false, reason: 'daily_mb_cap', startsUsed: starts, mbUsed: mb };
  }
  const ttl = 36 * 3600;
  await setCache(sk, { n: starts + 1 }, ttl);
  await setCache(mk, { n: mb + addMb }, ttl);
  return { ok: true, startsUsed: starts + 1, mbUsed: mb + addMb };
}
