import React, { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINT } from '../config/api';

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
  authenticatedUser: { id: string; accessToken?: string; authToken?: string; publicKey?: string };
  onResponded?: () => void;
}

export const DataPointRequestsPanel: React.FC<DataPointRequestsPanelProps> = ({
  authenticatedUser,
  onResponded
}) => {
  const [requests, setRequests] = useState<DataPointRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pnIdentifier, setPnIdentifier] = useState<string | null>(null);

  const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { SecureCredentialManager } = await import('../utils/secureCredentialManager');
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials || !authToken) return;
        const { VolumeIdGenerator } = await import('../utils/crypto/volumeIdGenerator');
        const id = authenticatedUser.publicKey
          ? await VolumeIdGenerator.generateCanonicalVolumeId(authenticatedUser.publicKey)
          : await VolumeIdGenerator.generateVolumeId({
              pnName: credentials.pnName,
              passcode: credentials.passcode,
              publicKey: authenticatedUser.publicKey || ''
            });
        if (!cancelled) setPnIdentifier(id);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser.id, authenticatedUser.publicKey, authToken]);

  const load = useCallback(async () => {
    if (!pnIdentifier || !authToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `${API_ENDPOINT}/api/users/${pnIdentifier}/data-point-requests?status=pending`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
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
    load();
  }, [load]);

  const respond = async (requestId: string, action: 'approve' | 'decline') => {
    if (!pnIdentifier || !authToken) return;
    setBusyId(requestId);
    try {
      const res = await fetch(
        `${API_ENDPOINT}/api/users/${pnIdentifier}/data-point-requests/${requestId}/respond`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action })
        }
      );
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.requestId !== requestId));
        onResponded?.();
        await load();
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
        <button type="button" className="text-xs text-primary mt-2 underline" onClick={() => load()}>
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
              className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
              onClick={() => respond(req.requestId, 'approve')}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === req.requestId}
              className="px-3 py-1.5 text-xs rounded border border-border disabled:opacity-50"
              onClick={() => respond(req.requestId, 'decline')}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
