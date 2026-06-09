import React, { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINT } from '../../config/api';

export interface RemoteRecoveryRequest {
  requestId: string;
  publicKey: string;
  status: string;
  threshold: number;
  sharesJson: string;
  claimantName: string;
  createdAt: string;
}

interface RecoveryCustodianPendingPanelProps {
  authenticatedUser: { id: string; accessToken?: string; authToken?: string; publicKey?: string };
  custodianships: Array<{
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    identityPublicKey?: string;
    canApprove: boolean;
  }>;
  onApprove: (requestId: string, custodianshipId: string, identityPublicKey: string) => void;
}

export const RecoveryCustodianPendingPanel: React.FC<RecoveryCustodianPendingPanelProps> = ({
  authenticatedUser,
  custodianships,
  onApprove
}) => {
  const [requests, setRequests] = useState<Array<RemoteRecoveryRequest & { identityPublicKey: string }>>([]);
  const [loading, setLoading] = useState(false);
  const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;

  const load = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const all: Array<RemoteRecoveryRequest & { identityPublicKey: string }> = [];
      for (const cs of custodianships.filter((c) => c.canApprove && c.identityPublicKey)) {
        const pnId = cs.identityPublicKey!;
        const res = await fetch(`${API_ENDPOINT}/api/recovery/${encodeURIComponent(pnId)}/requests`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          const pending = (data.requests || []).filter(
            (r: RemoteRecoveryRequest) => r.status === 'pending' || r.status === 'ready'
          );
          for (const r of pending) {
            all.push({ ...r, identityPublicKey: pnId });
          }
        }
      }
      setRequests(all);
    } finally {
      setLoading(false);
    }
  }, [authToken, custodianships]);

  useEffect(() => {
    load();
  }, [load]);

  if (!custodianships.length) return null;

  return (
    <div className="bg-secondary rounded-lg p-4 mb-4">
      <h3 className="font-medium text-text-primary mb-2">Pending recovery requests</h3>
      {loading && <p className="text-sm text-text-secondary">Loading…</p>}
      {!loading && requests.length === 0 && (
        <p className="text-sm text-text-secondary">No pending recovery requests for your custodianships.</p>
      )}
      <ul className="space-y-2">
        {requests.map((r) => {
          const cs = custodianships.find((c) => c.identityPublicKey === r.identityPublicKey);
          const approvals = JSON.parse(r.sharesJson || '[]') as unknown[];
          return (
            <li key={`${r.identityPublicKey}-${r.requestId}`} className="flex items-center justify-between text-sm border border-border rounded p-2">
              <div>
                <div className="font-medium">{r.claimantName || 'Recovery request'}</div>
                <div className="text-text-secondary text-xs">
                  {cs?.identityName} · {approvals.length}/{r.threshold} approvals
                </div>
              </div>
              {r.status === 'pending' && cs && (
                <button
                  type="button"
                  className="px-3 py-1 modal-button rounded text-xs"
                  onClick={() => onApprove(r.requestId, cs.id, r.identityPublicKey)}
                >
                  Review
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
