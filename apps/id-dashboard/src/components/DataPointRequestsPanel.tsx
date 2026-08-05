import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ownerFetch, ownerGet } from '../services/ownerApiService';

export interface DataPointRequest {
  requestId: string;
  clientId: string;
  toolName: string;
  dataPoints: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
}

interface DataPointRequestsPanelProps {
  authenticatedUser: { id: string; publicKey?: string };
  apiToken?: string | null;
  onResponded?: () => void;
}

export const DataPointRequestsPanel: React.FC<DataPointRequestsPanelProps> = ({
  authenticatedUser,
  apiToken = null,
  onResponded
}) => {
  const [requests, setRequests] = useState<DataPointRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pnIdentifier, setPnIdentifier] = useState<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  const authToken = apiToken;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { SecureCredentialManager } = await import('@par-noir/identity-crypto');
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials?.pnName || !credentials?.passcode || !authenticatedUser.publicKey) return;
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const id = await VolumeIdGenerator.generateVolumeId({
          pnName: credentials.pnName,
          passcode: credentials.passcode,
          publicKey: authenticatedUser.publicKey
        });
        if (!cancelled) setPnIdentifier(id);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser.id, authenticatedUser.publicKey]);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!pnIdentifier || !authToken) return;
    const key = `${pnIdentifier}:${authToken.slice(0, 12)}`;
    if (!opts?.force && loadedKeyRef.current === key) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await ownerGet(
        authToken,
        `/api/users/${pnIdentifier}/data-point-requests?status=pending`,
        { pnIdentifier }
      );
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
        loadedKeyRef.current = key;
      } else {
        setLoadError('Could not load requests');
        setRequests([]);
      }
    } catch {
      setLoadError('Could not load requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [pnIdentifier, authToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (requestId: string, action: 'approve' | 'decline') => {
    if (!pnIdentifier || !authToken) return;
    setBusyId(requestId);
    try {
      const res = await ownerFetch(
        authToken,
        'POST',
        `/api/users/${pnIdentifier}/data-point-requests/${requestId}/respond`,
        { action },
        { pnIdentifier }
      );
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
        onResponded?.();
        await load({ force: true });
      } else {
        setLoadError('Failed to submit response');
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!pnIdentifier || !authToken) {
    return null;
  }

  if (loading) {
    return <p className="text-xs text-text-secondary">Loading data sharing requests…</p>;
  }

  if (loadError && requests.length === 0) {
    return (
      <div className="mb-6">
        <p className="text-xs text-red-500">{loadError}</p>
        <button type="button" className="text-xs text-primary mt-2 underline" onClick={() => void load({ force: true })}>
          Retry
        </button>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <p className="text-xs text-text-secondary mb-6">No pending data sharing requests.</p>
    );
  }

  return (
    <div className="mb-6 space-y-3">
      <h5 className="text-sm font-medium text-text-primary">Pending data sharing requests</h5>
      {requests.map((req) => (
        <div key={req.requestId} className="p-3 border border-border rounded-lg bg-secondary/30">
          <div className="text-sm font-medium text-text-primary">{req.toolName}</div>
          <div className="text-xs text-text-secondary mt-1">
            Requested: {req.dataPoints.split(',').join(', ')}
          </div>
          {req.reason ? (
            <div className="text-xs text-text-secondary mt-1">{req.reason}</div>
          ) : null}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={busyId === req.requestId}
              className="px-3 py-1.5 text-xs rounded bg-primary text-bg-primary disabled:opacity-50"
              onClick={() => void respond(req.requestId, 'approve')}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === req.requestId}
              className="px-3 py-1.5 text-xs rounded border border-border disabled:opacity-50"
              onClick={() => void respond(req.requestId, 'decline')}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
