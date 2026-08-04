import React, { useEffect, useState } from 'react';
import { API_ENDPOINT } from '../config/api';

interface IdentitySuccessionPanelProps {
  predecessorPnIdentifier: string;
}

/** Read-only public successor status (estate planning ≠ custodian Shamir recovery). */
export const IdentitySuccessionPanel: React.FC<IdentitySuccessionPanelProps> = ({
  predecessorPnIdentifier
}) => {
  const [publicInfo, setPublicInfo] = useState<{ revoked?: boolean; successorPnIdentifier?: string } | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    fetch(`${API_ENDPOINT}/api/v1/identity/successor?pn_identifier=${encodeURIComponent(predecessorPnIdentifier)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load succession status');
        return r.json();
      })
      .then(setPublicInfo)
      .catch(() => {
        setPublicInfo(null);
        setLoadError('Succession status unavailable');
      });
  }, [predecessorPnIdentifier]);

  return (
    <div className="bg-secondary rounded-lg p-6 space-y-3">
      <h4 className="font-medium text-text-primary">Identity succession</h4>
      <p className="text-xs text-text-secondary">
        Public estate-planning successor (registered by par Noir admin automation). This is separate from
        custodian Shamir recovery, which preserves the same cryptographic pN with a new Key 2.
      </p>
      <p className="text-sm text-text-primary">
        Successor:{' '}
        <span className="font-mono text-xs">
          {publicInfo?.successorPnIdentifier || 'none registered'}
        </span>
      </p>
      {publicInfo?.revoked ? (
        <p className="text-xs text-amber-600">Predecessor identifier marked revoked on the network.</p>
      ) : null}
      {loadError ? <p className="text-xs text-text-secondary">{loadError}</p> : null}
    </div>
  );
};
