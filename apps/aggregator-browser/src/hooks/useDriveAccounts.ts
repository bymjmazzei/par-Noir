/**
 * Hook to load and manage drive accounts from the API.
 */

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const loadAccounts = async () => {
      if (!authenticatedUserId) {
        setAccounts([]);
        return;
      }

      if (!isUnlockPrefetchComplete(authenticatedUserId)) {
        return;
      }

      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) return;

        const { accounts: list } = await fetchStorageAccounts(accessToken, authenticatedUserId);
        setAccounts(list as DriveAccount[]);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].accountId);
      } catch (err) {
        console.error('[useDriveAccounts] Failed to load accounts:', err);
      }
    };

    loadAccounts();
  }, [authenticatedUserId, userState.isUnlocked, userState.pnIdentifier]);

  return { accounts, selectedId, setSelectedId, setAccounts };
}
