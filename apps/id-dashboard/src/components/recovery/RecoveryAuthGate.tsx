import React, { useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { useRecoveryAuth, type RecoveryEncryptedIdentityLoader } from '../../contexts/RecoveryAuthContext';

interface RecoveryAuthGateProps {
  expectedUser: { id: string; publicKey?: string } | null;
  loadEncryptedIdentity: RecoveryEncryptedIdentityLoader;
  onAuthenticated?: () => void;
  onLocked?: () => void;
}

export const RecoveryAuthGate: React.FC<RecoveryAuthGateProps> = ({
  expectedUser,
  loadEncryptedIdentity,
  onAuthenticated,
  onLocked,
}) => {
  const { isAuthenticated, unlockViaOAuthPopup, clearAuth, auth } = useRecoveryAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated && auth) {
    const minutesLeft = Math.max(1, Math.ceil((auth.expiresAt - Date.now()) / 60_000));
    return (
      <div className="mb-4 p-3 bg-secondary border border-primary/40 rounded-lg flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text-primary">Recovery unlocked</p>
            <p className="text-xs text-text-secondary mt-1">
              You can manage recovery keys and rotation for about {minutesLeft} more minute
              {minutesLeft === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearAuth();
            onLocked?.();
          }}
          className="text-xs text-text-secondary hover:text-text-primary underline shrink-0"
        >
          Lock recovery
        </button>
      </div>
    );
  }

  const handleUnlock = async () => {
    if (!expectedUser?.id) {
      setError('Unlock your pN on the dashboard first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await unlockViaOAuthPopup({
        expectedUser,
        loadEncryptedIdentity,
      });
      onAuthenticated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock recovery');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 p-4 bg-secondary border border-border rounded-lg">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="font-medium text-text-primary">Unlock to manage recovery</h4>
            <p className="text-sm text-text-secondary mt-1">
              Re-authenticate with Key 1 and Key 2 in the unlock popup. Then you can manage custodians,
              recovery keys, and identity rotation.
            </p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={loading || !expectedUser?.id}
            className="px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
          >
            {loading ? 'Waiting for unlock…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
};
