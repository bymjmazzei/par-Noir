import React, { useEffect, useState } from 'react';
import { useRecoveryAuth } from '../../contexts/RecoveryAuthContext';
import { fetchRecoveryFailsafeStatus } from '../../services/recoveryApiService';

export interface RecoveryKeyFailsafeSectionProps {
  apiToken: string | null;
  userPnIdentifier: string | null;
  recoveryKeysCount: number;
  canCreate: boolean;
  onCreate: () => void;
  disabledReason?: string;
}

export const RecoveryKeyFailsafeSection: React.FC<RecoveryKeyFailsafeSectionProps> = ({
  apiToken,
  userPnIdentifier,
  recoveryKeysCount,
  canCreate,
  onCreate,
  disabledReason,
}) => {
  const { isAuthenticated } = useRecoveryAuth();
  const [status, setStatus] = useState<{ hasKey: boolean; hasEnvelope: boolean }>({
    hasKey: false,
    hasEnvelope: false,
  });

  useEffect(() => {
    if (!apiToken || !userPnIdentifier) return;
    let cancelled = false;
    void fetchRecoveryFailsafeStatus(userPnIdentifier, apiToken).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [apiToken, userPnIdentifier, recoveryKeysCount]);

  const registered = status.hasKey || recoveryKeysCount > 0;

  return (
    <div className="bg-secondary p-4 rounded-lg space-y-3">
      <h4 className="font-medium text-text-primary">Recovery key failsafe</h4>
      <p className="text-xs text-text-secondary">
        Store offline. Starts custodian recovery without Key 1 or Key 2 — including if you lose
        your .pn file or recovery contact. Does not unlock by itself.
      </p>
      {registered ? (
        <p className="text-sm text-green-400">
          Failsafe key registered
          {status.hasEnvelope ? ' (envelope on file)' : ''}. Create another only if you need to rotate
          it.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">No failsafe key registered yet.</p>
      )}
      {!isAuthenticated && (
        <p className="text-xs text-yellow-500">Unlock recovery above before creating a key.</p>
      )}
      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate || !isAuthenticated}
        title={disabledReason}
        className="w-full px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
      >
        {registered ? 'Create and download new recovery key' : 'Create recovery key'}
      </button>
    </div>
  );
};
