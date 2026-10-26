import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  cancelOwnerRecoveryRequest,
  fetchOwnerRecoveryRequests,
  type OwnerRecoveryRequest,
} from '../../services/recoveryApiService';

const POLL_MS = 60_000;

/** Owner-side warning for open recovery/reset requests, with a cancel during the safety delay. */
export const OwnerRecoveryRequestsBanner: React.FC<{ apiToken: string | null }> = ({ apiToken }) => {
  const [requests, setRequests] = useState<OwnerRecoveryRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    try {
      const rows = await fetchOwnerRecoveryRequests(apiToken);
      setRequests(rows.filter((r) => r.status === 'pending' || r.status === 'ready'));
    } catch (err) {
      console.warn('[recovery] owner requests unavailable:', err instanceof Error ? err.message : err);
    }
  }, [apiToken]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const cancel = async (requestId: string) => {
    if (!apiToken) return;
    setBusyId(requestId);
    setError(null);
    try {
      await cancelOwnerRecoveryRequest(apiToken, requestId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the request');
    } finally {
      setBusyId(null);
    }
  };

  if (!requests.length) return null;

  return (
    <div className="w-full max-w-4xl bg-secondary border border-amber-500/50 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-300">Someone has asked to recover this pN</p>
          <p className="text-text-secondary">If this was not you, cancel it now.</p>
        </div>
      </div>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li
            key={r.requestId}
            className="flex items-center justify-between gap-3 text-sm border border-border rounded p-2"
          >
            <div>
              <div className="font-medium">
                {r.requestType === 'device_registry_reset' ? 'Device reset' : 'Identity recovery'}
                {r.claimantContact ? ` · ${r.claimantContact}` : ''}
              </div>
              <div className="text-xs text-text-secondary">
                {r.approvalCount}/{r.threshold} approvals · started {new Date(r.createdAt).toLocaleString()}
                {r.status === 'ready' ? ` · can finish after ${new Date(r.releaseAfter).toLocaleString()}` : ''}
              </div>
            </div>
            <button
              type="button"
              disabled={busyId === r.requestId}
              onClick={() => void cancel(r.requestId)}
              className="px-3 py-1 rounded text-xs border border-red-500/50 text-red-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
};
