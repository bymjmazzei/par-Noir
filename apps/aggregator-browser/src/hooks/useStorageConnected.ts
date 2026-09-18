/**
 * Whether the unlocked user has at least one cloud storage account connected.
 */

import { useEffect, useState } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import { fetchStorageAccounts } from '../services/storageApiClient';
import { isUnlockPrefetchComplete } from '../services/unlockSessionCoordinator';

export function useStorageConnected(pnIdentifier?: string): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!pnIdentifier || pnIdentifier.startsWith('did:key:')) {
        if (!cancelled) setConnected(false);
        return;
      }

      if (!isUnlockPrefetchComplete(pnIdentifier)) {
        return;
      }

      const token = await PNOAuthService.getValidAccessToken();
      if (!token) {
        if (!cancelled) setConnected(false);
        return;
      }

      try {
        const { connected: hasAccounts } = await fetchStorageAccounts(token, pnIdentifier);
        if (!cancelled) setConnected(hasAccounts);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };

    void run();
    const onPrefetch = () => {
      void run();
    };
    window.addEventListener('pn_unlock_prefetch_complete', onPrefetch);
    return () => {
      cancelled = true;
      window.removeEventListener('pn_unlock_prefetch_complete', onPrefetch);
    };
  }, [pnIdentifier]);

  return connected;
}
