import { useCallback, useEffect, useState } from 'react';
import {
  fetchRecoveryCustodianSummary,
  type RecoveryCustodianSummary,
} from '../services/recoveryApiService';
import {
  flushPendingRecoverySharesToDrive,
  reconcileRecoveryVaultOnDrive,
} from '../services/recoveryVaultService';

export function useRecoveryVaultState(params: {
  apiToken?: string | null;
  userPnIdentifier?: string | null;
  publicKey?: string | null;
  recoveryThreshold?: number;
  recoveryTotalShares?: number;
  /** When false, skip vault refresh (e.g. unkeyed session without custodians.read). */
  enabled?: boolean;
}) {
  const [summary, setSummary] = useState<RecoveryCustodianSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (params.enabled === false) {
      setSummary(null);
      return;
    }
    if (!params.apiToken || !params.userPnIdentifier) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      if (params.publicKey) {
        await flushPendingRecoverySharesToDrive({
          userPnIdentifier: params.userPnIdentifier,
          authToken: params.apiToken,
          publicKey: params.publicKey,
        });
      }
      if (params.recoveryTotalShares && params.recoveryTotalShares > 0) {
        await reconcileRecoveryVaultOnDrive({
          userPnIdentifier: params.userPnIdentifier,
          authToken: params.apiToken,
          totalShares: params.recoveryTotalShares,
        });
      }
      const data = await fetchRecoveryCustodianSummary(params.userPnIdentifier, params.apiToken);
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [params.apiToken, params.userPnIdentifier, params.publicKey, params.recoveryTotalShares, params.enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const threshold = params.recoveryThreshold ?? 2;
  const recoveryReady =
    Boolean(summary)
    && summary!.counts.accepted >= threshold
    && summary!.counts.acceptedUnrevokable >= 1;

  return { summary, loading, refresh, recoveryReady };
}
