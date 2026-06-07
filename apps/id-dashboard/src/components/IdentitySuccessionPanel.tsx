import React, { useEffect, useState } from 'react';
import { API_ENDPOINT } from '../config/api';

interface IdentitySuccessionPanelProps {
  predecessorPnIdentifier: string;
  authToken?: string;
}

export const IdentitySuccessionPanel: React.FC<IdentitySuccessionPanelProps> = ({
  predecessorPnIdentifier,
  authToken
}) => {
  const [successorPn, setSuccessorPn] = useState('');
  const [publicInfo, setPublicInfo] = useState<{ revoked?: boolean; successorPnIdentifier?: string } | null>(
    null
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`${API_ENDPOINT}/api/v1/identity/successor?pn_identifier=${encodeURIComponent(predecessorPnIdentifier)}`)
      .then((r) => r.json())
      .then(setPublicInfo)
      .catch(() => setPublicInfo(null));
  }, [predecessorPnIdentifier]);

  const registerSuccessor = async () => {
    if (!authToken || !successorPn.trim()) return;
    setMessage('');
    const res = await fetch(`${API_ENDPOINT}/api/admin/identity/succession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        predecessorPnIdentifier,
        successorPnIdentifier: successorPn.trim()
      })
    });
    setMessage(res.ok ? 'Successor registered (admin endpoint).' : 'Registration requires admin API key.');
  };

  return (
    <div className="bg-secondary rounded-lg p-6 space-y-3">
      <h4 className="font-medium text-text-primary">Identity succession</h4>
      <p className="text-xs text-text-secondary">
        Designate a successor pN identifier for estate planning. Public status:{' '}
        {publicInfo?.successorPnIdentifier || 'none'}
      </p>
      <input
        type="text"
        value={successorPn}
        onChange={(e) => setSuccessorPn(e.target.value)}
        placeholder="Successor pn identifier"
        className="w-full px-3 py-2 bg-modal-bg border border-border rounded text-sm"
      />
      <button
        type="button"
        onClick={registerSuccessor}
        className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
      >
        Register successor
      </button>
      {message ? <p className="text-xs text-text-secondary">{message}</p> : null}
    </div>
  );
};
