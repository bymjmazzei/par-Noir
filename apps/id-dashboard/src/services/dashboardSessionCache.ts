/**
 * Session-scoped single-flight cache for dashboard tabs that share the same API objects.
 * Cleared on lock / identity change. Explicit Refresh or mutations call invalidate*.
 */

import { ownerGet } from './ownerApiService';
import { fetchOwnedAssets, type OwnedAssetDto } from './ownedAssetsApi';
import {
  MonetizationService,
  type MonetizationStatusResponse,
} from './monetization/MonetizationService';
import {
  getStorageAccountsCache,
  setStorageAccountsCacheEntry,
} from './storage/cloudSessionBootstrap';

export type DashboardCacheResource =
  | 'owned-assets'
  | 'monetization-status'
  | 'storage-accounts';

type CacheEntry<T> = {
  value: T;
  promise?: undefined;
};

type InFlightEntry<T> = {
  value?: undefined;
  promise: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown> | InFlightEntry<unknown>>();

function cacheKey(resource: DashboardCacheResource, scope: string): string {
  return `${resource}:${scope}`;
}

function getCachedOrFlight<T>(key: string): T | Promise<T> | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.promise) return entry.promise as Promise<T>;
  return entry.value as T;
}

async function singleFlight<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = getCachedOrFlight<T>(key);
  if (existing !== undefined) {
    return existing instanceof Promise ? existing : Promise.resolve(existing);
  }
  const promise = loader()
    .then((value) => {
      cache.set(key, { value });
      return value;
    })
    .catch((err) => {
      cache.delete(key);
      throw err;
    });
  cache.set(key, { promise });
  return promise;
}

export function invalidateDashboardCache(
  resource?: DashboardCacheResource | 'all',
  scope?: string
): void {
  if (!resource || resource === 'all') {
    cache.clear();
    return;
  }
  if (scope) {
    cache.delete(cacheKey(resource, scope));
    return;
  }
  const prefix = `${resource}:`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

export async function getOwnedAssetsCached(
  accessToken: string,
  pnIdentifier: string,
  opts?: { force?: boolean }
): Promise<OwnedAssetDto[]> {
  const key = cacheKey('owned-assets', pnIdentifier);
  if (opts?.force) {
    cache.delete(key);
    const { clearOwnedAssetsUnavailable } = await import('./storage/ownedAssetsAvailability');
    clearOwnedAssetsUnavailable(pnIdentifier);
  }
  return singleFlight(key, () => fetchOwnedAssets(accessToken, pnIdentifier, opts));
}

export async function getMonetizationStatusCached(
  accessToken: string,
  opts?: { force?: boolean }
): Promise<MonetizationStatusResponse> {
  const key = cacheKey('monetization-status', accessToken.slice(0, 24));
  if (opts?.force) cache.delete(key);
  return singleFlight(key, () => MonetizationService.getStatus(accessToken));
}

export type StorageAccountsPayload = {
  accounts: Array<{
    provider: string;
    accountId: string;
    displayName?: string;
    isPrimary?: boolean;
    isSocialCloud?: boolean;
    [k: string]: unknown;
  }>;
  socialCloudProvider: string | null;
};

export async function getStorageAccountsCached(
  accessToken: string,
  pnIdentifier: string,
  opts?: { force?: boolean }
): Promise<StorageAccountsPayload> {
  const key = cacheKey('storage-accounts', pnIdentifier);
  if (opts?.force) cache.delete(key);

  const warm = getStorageAccountsCache(pnIdentifier);
  if (!opts?.force && warm && !cache.has(key)) {
    const payload: StorageAccountsPayload = {
      accounts: warm.accounts as StorageAccountsPayload['accounts'],
      socialCloudProvider: warm.socialCloudProvider,
    };
    cache.set(key, { value: payload });
    return payload;
  }

  return singleFlight(key, async () => {
    const res = await ownerGet(
      accessToken,
      `/api/storage/accounts/${encodeURIComponent(pnIdentifier)}`,
      { pnIdentifier }
    );
    if (!res.ok) {
      throw new Error(`storage accounts failed (${res.status})`);
    }
    const data = (await res.json()) as {
      accounts?: StorageAccountsPayload['accounts'];
      socialCloudProvider?: string;
      primaryProvider?: string;
    };
    const payload: StorageAccountsPayload = {
      accounts: data.accounts ?? [],
      socialCloudProvider: data.socialCloudProvider ?? data.primaryProvider ?? null,
    };
    setStorageAccountsCacheEntry(pnIdentifier, {
      accounts: payload.accounts,
      socialCloudProvider: payload.socialCloudProvider,
    });
    return payload;
  });
}

/** Test helper: reset module state. */
export function __resetDashboardSessionCacheForTests(): void {
  cache.clear();
}
