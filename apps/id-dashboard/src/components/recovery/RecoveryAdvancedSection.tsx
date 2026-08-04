import React from 'react';
import { API_ENDPOINT } from '../../config/api';
import { IdentityRotationWizard } from '../identity/IdentityRotationWizard';

export interface RecoveryAdvancedSectionProps {
  authenticatedUser: { id: string; publicKey?: string } | null;
  apiToken: string | null;
  canRotateIdentity: boolean;
  hasKeyedDevices: boolean;
}

/** Re-key ledger: only renders when a successor is registered. */
const RekeyLedger: React.FC<{ predecessorPn: string }> = ({ predecessorPn }) => {
  const [successor, setSuccessor] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(
      `${API_ENDPOINT}/api/v1/identity/successor?pn_identifier=${encodeURIComponent(predecessorPn)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { successorPnIdentifier?: string } | null) => {
        if (cancelled) return;
        const s = data?.successorPnIdentifier;
        setSuccessor(s && s.trim() ? s : null);
      })
      .catch(() => {
        if (!cancelled) setSuccessor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [predecessorPn]);

  if (!successor) return null;

  return (
    <div className="bg-secondary rounded-lg p-4 space-y-2">
      <h5 className="font-medium text-text-primary text-sm">Network re-key record</h5>
      <p className="text-xs text-text-secondary">
        After identity rotation, the network retires the old pn and points to the new one.
      </p>
      <p className="text-sm text-text-primary font-mono text-xs break-all">
        {predecessorPn} → {successor}
      </p>
    </div>
  );
};

export const RecoveryAdvancedSection: React.FC<RecoveryAdvancedSectionProps> = ({
  authenticatedUser,
  apiToken,
  canRotateIdentity,
  hasKeyedDevices,
}) => {
  if (!authenticatedUser) return null;
  const predecessorPn = authenticatedUser.id.startsWith('pn-')
    ? authenticatedUser.id
    : `pn-${authenticatedUser.id}`;

  return (
    <details className="bg-secondary rounded-lg p-4">
      <summary className="cursor-pointer font-medium text-text-primary">Advanced</summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-text-secondary">
          Identity rotation creates new keys and registers a network re-key. Distinct from Shamir
          Key 1 / Key 2 recovery.
        </p>
        {canRotateIdentity && apiToken ? (
          <IdentityRotationWizard
            authToken={apiToken}
            identityKey={authenticatedUser.publicKey || authenticatedUser.id}
            currentDid={authenticatedUser.id}
          />
        ) : hasKeyedDevices ? (
          <p className="text-xs text-text-secondary">Identity rotation requires a keyed device session.</p>
        ) : null}
        <RekeyLedger predecessorPn={predecessorPn} />
      </div>
    </details>
  );
};
