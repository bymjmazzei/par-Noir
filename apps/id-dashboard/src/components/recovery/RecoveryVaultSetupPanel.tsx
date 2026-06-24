import React, { useState } from 'react';
import { useRecoveryAuth } from '../../contexts/RecoveryAuthContext';
import { seedRecoveryVaultFromMaterial } from '../../services/recoveryVaultService';
import { RecoverySharesUnavailableError } from '../../services/recoveryShareResolver';

interface RecoveryVaultSetupPanelProps {
  apiToken: string | null;
  userPnIdentifier: string | null;
  canCustodiansRead: boolean;
  pendingShareCount: number;
  onSeeded: () => void;
}

export const RecoveryVaultSetupPanel: React.FC<RecoveryVaultSetupPanelProps> = ({
  apiToken,
  userPnIdentifier,
  canCustodiansRead,
  pendingShareCount,
  onSeeded,
}) => {
  const { isAuthenticated, auth } = useRecoveryAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated || !auth) {
    return null;
  }

  const hasSealed = Boolean(auth.encryptedIdentity.recoverySharesSealed);

  if (!hasSealed) {
    return (
      <div className="mb-4 p-3 border border-yellow-600/50 rounded-lg text-sm text-text-secondary">
        This .pn file was created before durable recovery shares were added. Create a new pN to use recovery vault seeding.
      </div>
    );
  }

  if (pendingShareCount >= 5) {
    return (
      <div className="mb-4 p-3 border border-border rounded-lg text-sm text-text-secondary">
        Recovery vault already has unassigned shares on Drive. You can assign custodians below.
      </div>
    );
  }

  const handleSeed = async () => {
    if (!apiToken || !userPnIdentifier) {
      setError('Connect Google Drive under Storage and ensure you are signed in to the API.');
      return;
    }
    if (!canCustodiansRead) {
      setError('Your device session cannot manage the recovery vault yet.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await seedRecoveryVaultFromMaterial({
        encryptedIdentity: auth.encryptedIdentity,
        pnName: auth.pnName,
        passcode: auth.passcode,
        userPnIdentifier,
        authToken: apiToken,
        publicKey: auth.encryptedIdentity.publicKey,
      });
      setMessage(
        result.inserted > 0
          ? `Uploaded ${result.inserted} share(s) to your Drive vault${result.skipped ? ` (${result.skipped} already present)` : ''}.`
          : 'Shares are already on Drive.'
      );
      onSeeded();
    } catch (e) {
      if (e instanceof RecoverySharesUnavailableError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to set up recovery vault');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 p-4 bg-secondary border border-border rounded-lg space-y-3">
      <h4 className="font-medium text-text-primary">Recovery vault on Drive</h4>
      <p className="text-sm text-text-secondary">
        Upload your Shamir shares from this .pn file to your Google Drive recovery vault. You can assign custodians afterward.
      </p>
      {message && <p className="text-sm text-green-500">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="button"
        onClick={() => void handleSeed()}
        disabled={loading || !apiToken}
        className="px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
      >
        {loading ? 'Uploading…' : 'Set up recovery vault on Drive'}
      </button>
    </div>
  );
};
