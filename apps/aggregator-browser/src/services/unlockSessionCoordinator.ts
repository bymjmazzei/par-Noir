/**
 * Unlock-scoped post-unlock prefetch: one wave per stable pn identifier per page lifetime.
 */

import { PNOAuthService } from './pnOAuthService';
import { fetchStorageAccounts, canonicalStorageAccountsPnId } from './storageApiClient';
import { prefetchConnectionsList } from './connectionService';

const completedUnlockPn = new Set<string>();
let discoverySeededForUnlock = false;
let engagementPrefetchAllowed = false;
let prefetchInflight: Promise<void> | null = null;

export function canonicalUnlockPnId(pnIdentifier: string): string {
  return canonicalStorageAccountsPnId(pnIdentifier);
}

export function resetUnlockSessionCoordinator(): void {
  completedUnlockPn.clear();
  discoverySeededForUnlock = false;
  engagementPrefetchAllowed = false;
  prefetchInflight = null;
}

export function isUnlockPrefetchComplete(pnIdentifier: string): boolean {
  return completedUnlockPn.has(canonicalUnlockPnId(pnIdentifier));
}

export function isDiscoverySeededForUnlock(): boolean {
  return discoverySeededForUnlock;
}

export function markDiscoverySeededForUnlock(): void {
  discoverySeededForUnlock = true;
}

export function isEngagementPrefetchAllowed(): boolean {
  return engagementPrefetchAllowed;
}

function isStablePn(pnIdentifier: string | undefined): pnIdentifier is string {
  return !!pnIdentifier && !pnIdentifier.startsWith('did:key:');
}

/**
 * Warm viewer storage accounts + connections list once after unlock stabilizes.
 */
export function runUnlockPostPrefetch(pnIdentifier: string): Promise<void> {
  if (!isStablePn(pnIdentifier)) {
    return Promise.resolve();
  }
  const key = canonicalUnlockPnId(pnIdentifier);
  if (completedUnlockPn.has(key) && prefetchInflight) {
    return prefetchInflight;
  }
  if (completedUnlockPn.has(key)) {
    engagementPrefetchAllowed = true;
    return Promise.resolve();
  }

  if (prefetchInflight) return prefetchInflight;

  prefetchInflight = (async () => {
    const token = await PNOAuthService.getValidAccessToken();
    if (!token) return;

    await Promise.all([
      fetchStorageAccounts(token, pnIdentifier).catch(() => null),
      prefetchConnectionsList(pnIdentifier).catch(() => []),
    ]);

    completedUnlockPn.add(key);
    engagementPrefetchAllowed = true;
  })().finally(() => {
    prefetchInflight = null;
  });

  return prefetchInflight;
}

/** Test-only. */
export function resetUnlockSessionCoordinatorForTests(): void {
  resetUnlockSessionCoordinator();
}
