/**
 * Hook to load and manage drive accounts from the API.
 */

import { useState, useEffect, useCallback } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import { fetchStorageAccounts } from '../services/storageApiClient';
import { isUnlockPrefetchComplete } from '../services/unlockSessionCoordinator';
import type { DriveAccount } from '../components/storage/storageTypes';

export interface UseDriveAccountsParams {
  authenticatedUserId: string | undefined;
  userState: { isUnlocked: boolean; pnIdentifier: string | undefined };
}

export function useDriveAccounts({ authenticatedUserId, userState }: UseDriveAccountsParams) {
  const [accounts, setAccounts] = useState<DriveAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!authenticatedUserId) {
      setAccounts([]);
      return;
    }

    // Prefetch is in-memory and clears on hard reload. Bail quietly until it
    // completes — re-run on pn_unlock_prefetch_complete.
    if (!isUnlockPrefetchComplete(authenticatedUserId)) {
      return;
    }

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) return;

      const { accounts: list } = await fetchStorageAccounts(accessToken, authenticatedUserId);
      setAccounts(list as DriveAccount[]);
      if (list.length > 0) {
        setSelectedId((prev) => prev || list[0]!.accountId);
      }
    } catch (err) {
      console.error('[useDriveAccounts] Failed to load accounts:', err);
    }
  }, [authenticatedUserId]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts, userState.isUnlocked, userState.pnIdentifier]);

  useEffect(() => {
    const onPrefetch = () => {
      void loadAccounts();
    };
    window.addEventListener('pn_unlock_prefetch_complete', onPrefetch);
    return () => window.removeEventListener('pn_unlock_prefetch_complete', onPrefetch);
  }, [loadAccounts]);

  return { accounts, selectedId, setSelectedId, setAccounts };
}
