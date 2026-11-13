/**
 * The publisher's plan (decided here, never by the client) + free daily view caps (Redis).
 */
import {
  FEED_FREE_DAILY_VIEW_STARTS,
  getPublishTier,
  type PublishTierId,
} from '@par-noir/aggregator-domain';
import { createHash } from 'crypto';

function dayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function hashPn(pn: string): string {
  return createHash('sha256').update(pn).digest('hex').slice(0, 16);
}

export function freeViewStartsKey(viewerKey: string): string {
  return `feed-free-views:v1:${viewerKey}:${dayKey()}`;
}

export function viewerKeyFromRequest(pnIdentifier?: string | null, anonId?: string | null): string {
  if (pnIdentifier) return `pn:${hashPn(pnIdentifier)}`;
  if (anonId) return `anon:${createHash('sha256').update(anonId).digest('hex').slice(0, 16)}`;
  return 'anon:unknown';
}

export type PublishPlanStatus = {
  planId: PublishTierId;
  maxDurationSec: number;
  maxHeight: number;
  allowHd: boolean;
  retailUsd: number;
};

/** Verified publishers get floor; everyone else is free. Paid plans are not live yet. */
export async function resolvePublishPlan(pnIdentifier: string): Promise<PublishPlanStatus> {
  const { EngagementService } = await import('./engagementService');
  return publishPlanFor(await EngagementService.isIdentityVerifiedForMonetization(pnIdentifier));
}

export function publishPlanFor(verified: boolean): PublishPlanStatus {
  const notch = getPublishTier(verified ? 'floor' : 'free');
  return {
    planId: notch.id,
    maxDurationSec: notch.maxDurationSec,
    maxHeight: notch.maxHeight,
    allowHd: notch.allowHd,
    retailUsd: notch.retailUsd,
  };
}

function freeViewStartsLimit(): number {
  const n = Number(process.env.FEED_FREE_DAILY_VIEW_STARTS);
  return Number.isFinite(n) && n > 0 ? n : FEED_FREE_DAILY_VIEW_STARTS;
}

export type FreeViewGate =
  | { ok: true; startsUsed: number }
  | { ok: false; reason: 'daily_view_cap'; startsUsed: number };

/** Unverified viewers: daily view-start cap only (R2 egress is not billed, so no byte cap). */
export async function checkAndConsumeFreeView(viewerKey: string): Promise<FreeViewGate> {
  const { getCache, setCache } = await import('../utils/cache');
  const sk = freeViewStartsKey(viewerKey);
  const starts = (await getCache<{ n?: number }>(sk))?.n ?? 0;
  if (starts >= freeViewStartsLimit()) {
    return { ok: false, reason: 'daily_view_cap', startsUsed: starts };
  }
  await setCache(sk, { n: starts + 1 }, 36 * 3600);
  return { ok: true, startsUsed: starts + 1 };
}
