/**
 * Hook to load and manage drive accounts from the API.
 */

import { useState, useEffect } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import { accountsCacheService } from '../services/accountsCacheService';
import { API_ENDPOINT } from '../config/api';
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
        accountsCacheService.clearAll();
        return;
      }

      const cached = accountsCacheService.get(authenticatedUserId);
      if (cached) {
        setAccounts(cached);
        if (cached.length > 0 && !selectedId) setSelectedId(cached[0].accountId);
        return;
      }

      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) return;

        const response = await fetch(`${API_ENDPOINT}/api/storage/accounts/${authenticatedUserId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.ok) {
          const data = await response.json();
          const list = data.accounts || [];
          accountsCacheService.set(authenticatedUserId, list);
          setAccounts(list);
          if (list.length > 0 && !selectedId) setSelectedId(list[0].accountId);
        }
      } catch (err) {
        console.error('[useDriveAccounts] Failed to load accounts:', err);
      }
    };

    loadAccounts();
  }, [authenticatedUserId, userState.isUnlocked, userState.pnIdentifier]);

  return { accounts, selectedId, setSelectedId, setAccounts };
}
