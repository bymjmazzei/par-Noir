/**
 * Banner when owner cloud layout version is behind required migrations.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT } from '@par-noir/device-cloud-credentials';
import { PN_CLOUD_CREDENTIALS_READY_EVENT } from '@par-noir/oauth-ui';
import {
  fetchCloudLayoutStatus,
  upgradeCloudLayout,
  type CloudLayoutStatus,
} from '../../services/cloudLayoutService';

export function layoutUpdateDismissStorageKey(pnIdentifier: string): string {
  return `pn_layout_update_dismiss:${pnIdentifier}`;
}

export function isLayoutUpdateDismissed(pnIdentifier: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(layoutUpdateDismissStorageKey(pnIdentifier)) === '1';
  } catch {
    return false;
  }
}

function clearLayoutUpdateDismiss(pnIdentifier: string): void {
  try {
    sessionStorage.removeItem(layoutUpdateDismissStorageKey(pnIdentifier));
  } catch {
    /* ignore */
  }
}

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
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!pnIdentifier) {
      setDismissed(false);
      return;
    }
    setDismissed(isLayoutUpdateDismissed(pnIdentifier));
  }, [pnIdentifier, refreshKey]);

  const refresh = useCallback(async () => {
    if (!apiToken || !pnIdentifier) {
      setStatus(null);
      return;
    }
    try {
      const next = await fetchCloudLayoutStatus(apiToken, pnIdentifier);
      setStatus(next);
      setError(null);
      if (next?.complete) {
        clearLayoutUpdateDismiss(pnIdentifier);
        setDismissed(false);
      }
    } catch {
      setStatus(null);
    }
  }, [apiToken, pnIdentifier]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !pnIdentifier) return;
    const onCloudChanged = (event: Event) => {
      const eventPn = (event as CustomEvent<{ pnIdentifier?: string }>).detail?.pnIdentifier;
      if (eventPn && eventPn !== pnIdentifier) return;
      void refresh();
    };
    window.addEventListener(SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT, onCloudChanged);
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudChanged);
    return () => {
      window.removeEventListener(SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT, onCloudChanged);
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onCloudChanged);
    };
  }, [pnIdentifier, refresh]);

  const onUpgrade = async () => {
    if (!apiToken || !pnIdentifier) return;
    setBusy(true);
    setError(null);
    try {
      const next = await upgradeCloudLayout(apiToken, pnIdentifier);
      setStatus(next);
      if (next.complete && pnIdentifier) {
        clearLayoutUpdateDismiss(pnIdentifier);
        setDismissed(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cloud layout update failed');
    } finally {
      setBusy(false);
    }
  };

  if (!status || status.complete || dismissed) return null;

  const onDismiss = () => {
    if (!pnIdentifier) return;
    try {
      sessionStorage.setItem(layoutUpdateDismissStorageKey(pnIdentifier), '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const pendingLabels = status.pending.map((p) => p.description).filter(Boolean);

  return (
    <div
      className={`rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 ${className}`}
      role="status"
    >
      <p className="font-medium text-amber-600">Cloud layout update required</p>
      <p className="mt-1 text-text-secondary">
        Your secure cloud needs a one-time update
        {pendingLabels.length > 0 ? ` (${pendingLabels.join('; ')})` : ''}. Complete this in Storage
        under Secure Cloud.
      </p>
      {error && <p className="mt-2 text-red-500 text-xs">{error}</p>}
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/60 text-amber-600 hover:bg-amber-500/10 text-sm"
          >
            Open Storage
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-transparent text-text-secondary hover:text-text-primary hover:bg-amber-500/10 text-sm"
        >
          Remind me later
        </button>
      </div>
    </div>
  );
};
