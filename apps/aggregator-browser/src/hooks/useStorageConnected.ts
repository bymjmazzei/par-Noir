/**
 * Whether the unlocked user has at least one cloud storage account connected.
 */

import { useEffect, useState } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import { fetchStorageAccounts } from '../services/storageApiClient';

export function useStorageConnected(pnIdentifier?: string): boolean | null {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!pnIdentifier) {
        if (!cancelled) setConnected(false);
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
    })();

    return () => {
      cancelled = true;
    };
  }, [pnIdentifier]);

  return connected;
}
