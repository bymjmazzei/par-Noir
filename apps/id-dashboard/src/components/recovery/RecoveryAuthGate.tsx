import React, { useRef, useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { useRecoveryAuth } from '../../contexts/RecoveryAuthContext';
import {
  KEY_1_LABEL,
  KEY_1_PLACEHOLDER,
  KEY_2_LABEL,
  KEY_2_PLACEHOLDER,
} from '../../constants/credentialLabels';

interface RecoveryAuthGateProps {
  expectedUser: { id: string; publicKey?: string } | null;
}

const INPUT_CLASS =
  'w-full px-3 py-2 bg-input-bg border border-border rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

export const RecoveryAuthGate: React.FC<RecoveryAuthGateProps> = ({
  expectedUser,
}) => {
  const { isAuthenticated, startSession, clearAuth, auth } = useRecoveryAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          onClick={clearAuth}
          className="text-xs text-text-secondary hover:text-text-primary underline shrink-0"
        >
          Lock recovery
        </button>
      </div>
    );
  }

  const resetForm = () => {
    setFile(null);
    setPnName('');
    setPasscode('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedUser?.publicKey) {
      setError('Unlock your pN on the dashboard first.');
      return;
    }
    if (!file) {
      setError('Choose your .pn file.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { unlockRecoveryLocally } = await import('../../services/recoveryLocalUnlock');
      const session = await unlockRecoveryLocally({
        file,
        pnName,
        passcode,
        expectedPublicKey: expectedUser.publicKey,
      });
      startSession(session);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock recovery');
    } finally {
      resetForm();
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
              Choose your .pn file and enter {KEY_1_LABEL} and {KEY_2_LABEL}. They are checked on this
              device and kept only while recovery is unlocked (15 minutes).
            </p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {open ? (
            <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pn,.json"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-text-secondary"
                disabled={loading}
              />
              <input
                type="password"
                autoComplete="off"
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                className={INPUT_CLASS}
                placeholder={KEY_1_PLACEHOLDER}
                aria-label={KEY_1_LABEL}
                disabled={loading}
              />
              <input
                type="password"
                autoComplete="off"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className={INPUT_CLASS}
                placeholder={KEY_2_PLACEHOLDER}
                aria-label={KEY_2_LABEL}
                disabled={loading}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || !file || !pnName || !passcode}
                  className="px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
                >
                  {loading ? 'Unlocking…' : 'Unlock recovery'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setError(null);
                    setOpen(false);
                  }}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={!expectedUser?.publicKey}
              className="px-4 py-2 modal-button rounded-md text-sm disabled:opacity-50"
            >
              Unlock
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
