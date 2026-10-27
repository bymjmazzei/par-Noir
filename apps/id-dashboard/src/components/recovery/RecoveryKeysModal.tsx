import React, { useState } from 'react';
import { secretKeyInputProps } from '@par-noir/oauth-ui';
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

interface RecoveryKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** newKey1 = Key 1, newKey2 = Key 2 */
  onSubmit: (newKey1: string, newKey2: string) => Promise<void>;
  loading?: boolean;
}

export function RecoveryKeysModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false
}: RecoveryKeysModalProps) {
  const [newKey1, setNewKey1] = useState('');
  const [confirmKey1, setConfirmKey1] = useState('');
  const [newKey2, setNewKey2] = useState('');
  const [confirmKey2, setConfirmKey2] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newKey1.trim() || !newKey2) {
      setError(KEYS_REQUIRED);
      return;
    }
    if (newKey1.trim() !== confirmKey1.trim()) {
      setError(KEY_1_MISMATCH);
      return;
    }
    if (newKey2 !== confirmKey2) {
      setError(KEYS_MISMATCH);
      return;
    }
    try {
      await onSubmit(newKey1.trim(), newKey2);
      setNewKey1('');
      setConfirmKey1('');
      setNewKey2('');
      setConfirmKey2('');
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
              {...secretKeyInputProps('key1', 'create')}
              value={newKey1}
              onChange={(e) => setNewKey1(e.target.value)}
              placeholder={KEY_1_PLACEHOLDER}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
              required
            />
            <input
              {...secretKeyInputProps('key1', 'create')}
              value={confirmKey1}
              onChange={(e) => setConfirmKey1(e.target.value)}
              placeholder={KEY_1_CONFIRM_PLACEHOLDER}
              className="w-full px-3 py-2 mt-2 border border-input-border bg-input-bg rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">New {KEY_2_LABEL}</label>
            <input
              {...secretKeyInputProps('key2', 'create')}
              value={newKey2}
              onChange={(e) => setNewKey2(e.target.value)}
              placeholder={KEY_2_PLACEHOLDER}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md"
              required
            />
          </div>
          <div>
            <input
              {...secretKeyInputProps('key2', 'create')}
              value={confirmKey2}
              onChange={(e) => setConfirmKey2(e.target.value)}
              placeholder={KEY_2_CONFIRM_PLACEHOLDER}
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
