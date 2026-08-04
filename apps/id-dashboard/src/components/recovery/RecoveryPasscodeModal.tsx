import React, { useState } from 'react';
import {
  KEY_1_LABEL,
  KEY_2_LABEL,
  KEY_2_CONFIRM_PLACEHOLDER,
  KEYS_HELPER,
  KEYS_MISMATCH,
  keyStrengthErrors,
} from '../../constants/credentialLabels';

interface RecoveryPasscodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** newPnName = Key 1, newPasscode = Key 2 */
  onSubmit: (newPnName: string, newPasscode: string) => Promise<void>;
  loading?: boolean;
}

export function RecoveryPasscodeModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false
}: RecoveryPasscodeModalProps) {
  const [newPnName, setNewPnName] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const key1Errors = keyStrengthErrors(newPnName.trim(), KEY_1_LABEL);
    if (key1Errors.length) {
      setError(key1Errors[0]);
      return;
    }
    const key2Errors = keyStrengthErrors(newPasscode, KEY_2_LABEL);
    if (key2Errors.length) {
      setError(key2Errors[0]);
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError(KEYS_MISMATCH);
      return;
    }
    try {
      await onSubmit(newPnName.trim(), newPasscode);
      setNewPnName('');
      setNewPasscode('');
      setConfirmPasscode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <h2 className="text-xl font-semibold mb-2">Set new Key 1 and Key 2</h2>
        <p className="text-sm text-text-secondary mb-4">
          Custodians approved recovery. Choose new unlock secrets — your cryptographic identity (same pN keys)
          is preserved. Reconnect Google Drive after unlock if tokens were lost.
        </p>
        <p className="text-xs text-text-secondary mb-4">{KEYS_HELPER}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            New {KEY_1_LABEL}
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 bg-secondary border border-border rounded"
              value={newPnName}
              onChange={(e) => setNewPnName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            New {KEY_2_LABEL}
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 bg-secondary border border-border rounded"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            Confirm {KEY_2_LABEL}
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 bg-secondary border border-border rounded"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              autoComplete="new-password"
              placeholder={KEY_2_CONFIRM_PLACEHOLDER}
            />
          </label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-border rounded">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-bg-primary rounded disabled:opacity-50"
            >
              {loading ? 'Recovering…' : 'Complete recovery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
