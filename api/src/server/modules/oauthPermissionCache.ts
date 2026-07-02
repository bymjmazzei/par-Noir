/**
 * Short-TTL Redis cache for browser-app OAuth consent skip hints.
 */

import { deleteCache, getCache, setCache } from '../utils/cache';

const BROWSER_APP_PERMISSION_TTL_SECONDS = 600;

function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function cacheKey(pnIdentifier: string): string {
  return `oauth:browser-app:${normalizePn(pnIdentifier)}`;
}

export type BrowserAppPermissionHint = { ageShared: boolean };

/** Returns undefined when cache miss. */
export async function getCachedBrowserAppPermissions(
  pnIdentifier: string
): Promise<BrowserAppPermissionHint | null | undefined> {
  const hit = await getCache<BrowserAppPermissionHint | null>(cacheKey(pnIdentifier));
  if (hit === null) return null;
  if (hit && typeof hit === 'object' && 'ageShared' in hit) return hit;
  return undefined;
}

export async function setCachedBrowserAppPermissions(
  pnIdentifier: string,
  value: BrowserAppPermissionHint | null
): Promise<void> {
  await setCache(cacheKey(pnIdentifier), value, BROWSER_APP_PERMISSION_TTL_SECONDS);
}

export async function invalidateBrowserAppPermissionsCache(pnIdentifier: string): Promise<void> {
  await deleteCache(cacheKey(pnIdentifier));
}
