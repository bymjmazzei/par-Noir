/**
 * Banner when owner cloud layout version is behind required migrations.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  fetchCloudLayoutStatus,
  upgradeCloudLayout,
  type CloudLayoutStatus,
} from '../../services/cloudLayoutService';

export interface CloudLayoutUpdateBannerProps {
  apiToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  /** When true, show Complete update; when false, only CTA to open Storage. */
  allowUpgrade?: boolean;
  onOpenStorage?: () => void;
  /** Re-check when this changes (e.g. after connect). */
  refreshKey?: string | number;
  className?: string;
}

export const CloudLayoutUpdateBanner: React.FC<CloudLayoutUpdateBannerProps> = ({
  apiToken,
  pnIdentifier,
  allowUpgrade = true,
  onOpenStorage,
  refreshKey,
  className = '',
}) => {
  const [status, setStatus] = useState<CloudLayoutStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!apiToken || !pnIdentifier) {
      setStatus(null);
      return;
    }
    try {
      const next = await fetchCloudLayoutStatus(apiToken, pnIdentifier);
      setStatus(next);
      setError(null);
    } catch {
      setStatus(null);
    }
  }, [apiToken, pnIdentifier]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const onUpgrade = async () => {
    if (!apiToken || !pnIdentifier) return;
    setBusy(true);
    setError(null);
    try {
      const next = await upgradeCloudLayout(apiToken, pnIdentifier);
      setStatus(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cloud layout update failed');
    } finally {
      setBusy(false);
    }
  };

  if (!status || status.complete) return null;

  const pendingLabels = status.pending.map((p) => p.description).filter(Boolean);

  return (
    <div
      className={`rounded-xl border border-amber-600/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100 ${className}`}
      role="status"
    >
      <p className="font-medium text-amber-50">Cloud layout update required</p>
      <p className="mt-1 text-amber-200/90">
        Your secure cloud needs a one-time update
        {pendingLabels.length > 0 ? ` (${pendingLabels.join('; ')})` : ''}. Complete this in Storage
        under Secure Cloud.
      </p>
      {error && <p className="mt-2 text-red-300 text-xs">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {allowUpgrade ? (
          <button
            type="button"
            disabled={busy || !apiToken || !pnIdentifier}
            onClick={() => void onUpgrade()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Complete update
          </button>
        ) : null}
        {onOpenStorage ? (
          <button
            type="button"
            onClick={onOpenStorage}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/60 text-amber-100 hover:bg-amber-900/40 text-sm"
          >
            Open Storage
          </button>
        ) : null}
      </div>
    </div>
  );
};
