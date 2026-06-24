import React, { useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { useRecoveryAuth } from '../../contexts/RecoveryAuthContext';

interface RecoveryAuthGateProps {
  onAuthenticated?: () => void;
  onLocked?: () => void;
}

export const RecoveryAuthGate: React.FC<RecoveryAuthGateProps> = ({ onAuthenticated, onLocked }) => {
  const { isAuthenticated, authenticateFromFile, clearAuth, auth } = useRecoveryAuth();
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated && auth) {
    const minutesLeft = Math.max(1, Math.ceil((auth.expiresAt - Date.now()) / 60_000));
    return (
      <div className="mb-4 p-3 bg-secondary border border-primary/40 rounded-lg flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text-primary">Recovery identity confirmed</p>
            <p className="text-xs text-text-secondary mt-1">
              You can change recovery settings for about {minutesLeft} more minute{minutesLeft === 1 ? '' : 's'}.
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !pnName.trim() || !passcode) {
      setError('Upload your .pn file and enter your pN name and passcode.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authenticateFromFile(file, pnName.trim(), passcode);
      setPasscode('');
      onAuthenticated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm identity');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4 p-4 bg-secondary border border-border rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <Lock className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-text-primary">Confirm identity to manage recovery</h4>
          <p className="text-sm text-text-secondary mt-1">
            Changing recovery requires your .pn file, pN name, and passcode — even if the dashboard is already unlocked.
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-text-secondary mb-1">pN file (.pn)</label>
          <input
            type="file"
            accept=".pn,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-text-secondary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">pN name</label>
          <input
            type="text"
            value={pnName}
            onChange={(e) => setPnName(e.target.value)}
            placeholder="Enter your pN Name"
            className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md text-sm"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary mb-1">Passcode</label>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter your passcode"
            className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md text-sm"
            autoComplete="off"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
        >
          {loading ? 'Confirming…' : 'Confirm identity'}
        </button>
      </form>
    </div>
  );
};
