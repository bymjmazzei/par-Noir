import {
  getPublishTier,
  type PublishTierId,
  type PublishTierNotch
} from '@par-noir/aggregator-domain';
import { apiGet } from './penOwnerFetch';

/** Fallback when the API is unreachable — server still enforces. */
export const PEN_PUBLISH_PLAN_ID: PublishTierId = 'floor';

/** Same code the API and browse uploads use when a video runs past the plan's limit. */
export const EXCEEDS_TIER_MAX_DURATION = 'exceeds_tier_max_duration';

export class PageTooLongError extends Error {
  constructor(
    readonly durationSec: number,
    readonly maxDurationSec: number
  ) {
    super(EXCEEDS_TIER_MAX_DURATION);
  }
}

type CachedPlan = {
  planId: PublishTierId;
  maxDurationSec: number;
  notch: PublishTierNotch;
};

let cached: CachedPlan | null = null;
let cacheKey = '';

export async function fetchPublishPlan(accessToken: string): Promise<CachedPlan> {
  const key = accessToken.slice(0, 24);
  if (cached && cacheKey === key) return cached;
  try {
    const res = await apiGet('/api/aggregator/publish-plan', { authToken: accessToken });
    if (res.ok) {
      const data = (await res.json()) as {
        plan?: { planId?: string; maxDurationSec?: number };
      };
      const planId = (data.plan?.planId || PEN_PUBLISH_PLAN_ID) as PublishTierId;
      const notch = getPublishTier(planId);
      cached = {
        planId: notch.id,
        maxDurationSec: data.plan?.maxDurationSec ?? notch.maxDurationSec,
        notch
      };
      cacheKey = key;
      return cached;
    }
  } catch {
    /* fall through */
  }
  const notch = getPublishTier(PEN_PUBLISH_PLAN_ID);
  cached = { planId: notch.id, maxDurationSec: notch.maxDurationSec, notch };
  cacheKey = key;
  return cached;
}

/** Sync notch after fetchPublishPlan (or floor fallback). */
export function currentPublishTier(): PublishTierNotch {
  return cached?.notch ?? getPublishTier(PEN_PUBLISH_PLAN_ID);
}

export function clearPublishPlanCache(): void {
  cached = null;
  cacheKey = '';
}
