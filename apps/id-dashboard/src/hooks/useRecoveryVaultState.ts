import { useCallback, useEffect, useState } from 'react';
import {
  fetchRecoveryCustodianSummary,
  type RecoveryCustodianSummary,
} from '../services/recoveryApiService';

/** Read-only recovery vault status — no auto-seed; mutations happen in Recovery tab after re-auth. */
export function useRecoveryVaultState(params: {
  apiToken?: string | null;
  userPnIdentifier?: string | null;
  recoveryThreshold?: number;
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
      const data = await fetchRecoveryCustodianSummary(params.userPnIdentifier, params.apiToken);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [params.apiToken, params.userPnIdentifier, params.enabled]);

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
