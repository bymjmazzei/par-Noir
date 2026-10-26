import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchCustodianRecoveryRequests,
  type CustodianRecoveryRequest,
} from '../../services/recoveryApiService';
import { syncCustodianCustody } from '../../services/recoveryRelayFlows';

const POLL_MS = 60_000;

interface RecoveryCustodianPendingPanelProps {
  apiToken: string | null;
  /** This custodian's own pN id (Drive folder for held shares). */
  custodianPn: string | null;
  custodianIdentityId: string | null;
  custodianPublicKey?: string | null;
  onReview: (request: CustodianRecoveryRequest) => void;
}

/**
 * Custodian side of the relay: stores newly delivered shares on this pN's Drive and lists
 * recovery requests from pNs this identity protects.
 */
export const RecoveryCustodianPendingPanel: React.FC<RecoveryCustodianPendingPanelProps> = ({
  apiToken,
  custodianPn,
  custodianIdentityId,
  custodianPublicKey,
  onReview,
}) => {
  const [requests, setRequests] = useState<CustodianRecoveryRequest[]>([]);
  const [custodyError, setCustodyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    if (custodianPn && custodianIdentityId) {
      try {
        await syncCustodianCustody({
          authToken: apiToken,
          custodianPn,
          custodianIdentityId,
          custodianPublicKey,
        });
        setCustodyError(null);
      } catch (err) {
        setCustodyError(err instanceof Error ? err.message : 'Could not store recovery shares you protect.');
      }
    }
    try {
      const rows = await fetchCustodianRecoveryRequests(apiToken);
      setRequests(rows.filter((r) => r.status === 'pending' || r.status === 'ready'));
    } catch (err) {
      console.warn('[recovery] custodian requests unavailable:', err instanceof Error ? err.message : err);
    }
  }, [apiToken, custodianPn, custodianIdentityId, custodianPublicKey]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (!requests.length && !custodyError) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">Acting as custodian</h3>
      {custodyError && (
        <p className="text-sm text-yellow-400 bg-secondary rounded-lg p-3">{custodyError}</p>
      )}
      {requests.length > 0 && (
        <div className="bg-secondary rounded-lg p-4">
          <h4 className="font-medium text-text-primary mb-2">Recovery requests waiting for you</h4>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={`${r.requestId}-${r.custodianId}`}
                className="flex items-center justify-between text-sm border border-border rounded p-2"
              >
                <div>
                  <div className="font-medium">
                    {r.requestType === 'device_registry_reset' ? 'Device reset' : 'Identity recovery'}
                    {r.claimantContact ? ` · ${r.claimantContact}` : ''}
                  </div>
                  <div className="text-text-secondary text-xs">
                    {r.approvalCount}/{r.threshold} approvals · expires {new Date(r.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="px-3 py-1 modal-button rounded text-xs"
                  onClick={() => onReview(r)}
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
