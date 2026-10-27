import React, { useState } from 'react';
import { SectionInfo } from '../common/SectionInfo';
import {
  KEY_1_LABEL,
  KEY_1_PLACEHOLDER,
  KEY_1_CONFIRM_PLACEHOLDER,
  KEY_1_MISMATCH,
  KEY_2_LABEL,
  KEY_2_PLACEHOLDER,
  KEY_2_CONFIRM_PLACEHOLDER,
  KEYS_HELPER,
  KEYS_MISMATCH,
  KEYS_REQUIRED,
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
  const [confirmPnName, setConfirmPnName] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPnName.trim() || !newPasscode) {
      setError(KEYS_REQUIRED);
      return;
    }
    if (newPnName.trim() !== confirmPnName.trim()) {
      setError(KEY_1_MISMATCH);
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError(KEYS_MISMATCH);
      return;
    }
    try {
      await onSubmit(newPnName.trim(), newPasscode);
      setNewPnName('');
      setConfirmPnName('');
      setNewPasscode('');
      setConfirmPasscode('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full text-text-primary">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xl font-semibold">Set new Key 1 and Key 2</h2>
          <SectionInfo title="Set new Key 1 and Key 2">
            <p>
              Choose new unlock secrets. Your cryptographic identity (same pN keys) is preserved and
              re-sealed on this device. Reconnect Google Drive after unlock if tokens were lost.
            </p>
            <p>{KEYS_HELPER}</p>
          </SectionInfo>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New {KEY_1_LABEL}</label>
            <input
              type="password"
              value={newPnName}
              onChange={(e) => setNewPnName(e.target.value)}
              placeholder={KEY_1_PLACEHOLDER}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
              required
            />
            <input
              type="password"
              value={confirmPnName}
              onChange={(e) => setConfirmPnName(e.target.value)}
              placeholder={KEY_1_CONFIRM_PLACEHOLDER}
              autoComplete="new-password"
              className="w-full px-3 py-2 mt-2 border border-input-border bg-input-bg rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New {KEY_2_LABEL}</label>
            <input
              type="password"
              value={newPasscode}
              onChange={(e) => setNewPasscode(e.target.value)}
              placeholder={KEY_2_PLACEHOLDER}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
              required
            />
          </div>
          <div>
            <input
              type="password"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              placeholder={KEY_2_CONFIRM_PLACEHOLDER}
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
              required
            />
          </div>
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
