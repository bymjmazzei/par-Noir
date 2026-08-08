/**
 * Short-TTL Redis cache for OAuth consent-skip hints, keyed per client.
 *
 * Positives only. `getCache` cannot distinguish a miss from a stored null or
 * from Redis being down, so caching a negative would be indistinguishable from
 * "unknown" and would suppress the authoritative Drive read. Absence therefore
 * always means "go ask Drive".
 */

import { deleteCache, getCache, setCache } from '../utils/cache';

const GRANT_HINT_TTL_SECONDS = 600;

function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function cacheKey(clientId: string, pnIdentifier: string): string {
  return `oauth:grant:${clientId}:${normalizePn(pnIdentifier)}`;
}

/** What the user granted this client, and what they were asked about. */
export type GrantHint = {
  dataPoints: string[];
  consideredDataPoints: string[];
};

function isGrantHint(value: unknown): value is GrantHint {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as GrantHint).dataPoints) &&
    Array.isArray((value as GrantHint).consideredDataPoints)
  );
}

/** Returns null when there is no usable hint (miss, no Redis, or malformed). */
export async function getCachedGrant(
  clientId: string,
  pnIdentifier: string
): Promise<GrantHint | null> {
  const hit = await getCache<unknown>(cacheKey(clientId, pnIdentifier));
  if (!isGrantHint(hit)) return null;
  return {
    dataPoints: [...hit.dataPoints],
    consideredDataPoints: [...hit.consideredDataPoints],
  };
}

export async function setCachedGrant(
  clientId: string,
  pnIdentifier: string,
  grant: GrantHint
): Promise<void> {
  await setCache(
    cacheKey(clientId, pnIdentifier),
    {
      dataPoints: [...grant.dataPoints],
      consideredDataPoints: [...grant.consideredDataPoints],
    } satisfies GrantHint,
    GRANT_HINT_TTL_SECONDS
  );
}

export async function invalidateCachedGrant(
  clientId: string,
  pnIdentifier: string
): Promise<void> {
  await deleteCache(cacheKey(clientId, pnIdentifier));
}
