import React, { useState } from 'react';

interface RecoveryPasscodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newPasscode: string, confirmPasscode: string) => Promise<void>;
  loading?: boolean;
}

export function RecoveryPasscodeModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false
}: RecoveryPasscodeModalProps) {
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPasscode.length < 8) {
      setError('Passcode must be at least 8 characters.');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError('Passcodes do not match.');
      return;
    }
    try {
      await onSubmit(newPasscode, confirmPasscode);
      setNewPasscode('');
      setConfirmPasscode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <h2 className="text-xl font-semibold mb-2">Set new passcode</h2>
        <p className="text-sm text-text-secondary mb-4">
          Custodians approved recovery. Choose a new passcode — your cryptographic identity (same pN keys) is
          preserved. Reconnect Google Drive after unlock if tokens were lost.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            New passcode
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 bg-secondary border border-border rounded"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            Confirm passcode
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 bg-secondary border border-border rounded"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              autoComplete="new-password"
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
