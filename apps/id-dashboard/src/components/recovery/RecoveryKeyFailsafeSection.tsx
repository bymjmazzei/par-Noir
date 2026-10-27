import React, { useEffect, useState } from 'react';
import { SectionInfo } from '../common/SectionInfo';
import { useRecoveryAuth } from '../../contexts/RecoveryAuthContext';
import { fetchRecoveryFailsafeStatus, type RecoveryFailsafeMode } from '../../services/recoveryApiService';

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
  const [status, setStatus] = useState<{ hasKey: boolean; hasEnvelope: boolean; mode?: RecoveryFailsafeMode | null }>({
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

  if (!isAuthenticated) return null;

  return (
    <div className="bg-secondary p-4 rounded-lg space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="font-medium text-text-primary">Recovery key failsafe</h4>
        <SectionInfo title="Recovery key failsafe">
          <p>
            Store offline. Recovers your pN without Key 1, Key 2 or your .pn file. Without custodians,
            recovery needs this key, the Google account that holds your pN, and a 24-hour wait your
            signed-in devices can cancel (a keyed device can approve it sooner). With custodians, the
            key only asks them to approve.
          </p>
        </SectionInfo>
      </div>
      {registered ? (
        <p className="text-sm text-green-400">
          {status.mode === 'custodians'
            ? 'Recovery key registered. It starts custodian approval.'
            : 'Recovery key registered. It recovers with your Google account after a 24-hour wait, once.'}{' '}
          Create another only if you need to rotate it.
        </p>
      ) : (
        <p className="text-sm text-text-secondary">No recovery key registered yet.</p>
      )}
      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate}
        title={disabledReason}
        className="w-full px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
      >
        {registered ? 'Create and download new recovery key' : 'Create recovery key'}
      </button>
      {!canCreate && disabledReason && (
        <p className="text-xs text-text-secondary">{disabledReason}</p>
      )}
    </div>
  );
};
