/**
 * Unlock ML-KEM identity for client-side E2E messaging.
 */

import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { unlockDmIdentity } from '../services/dmIdentitySession';

interface DmCryptoUnlockModalProps {
  pnName: string;
  onUnlocked: () => void;
  onCancel?: () => void;
}

export function DmCryptoUnlockModal({ pnName, onUnlocked, onCancel }: DmCryptoUnlockModalProps) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockDmIdentity(pnName, passcode);
      setPasscode('');
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2 text-white">
          <Lock className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Unlock messaging</h2>
        </div>
        <p className="mb-4 text-sm text-neutral-400">
          Enter your passcode to decrypt messages on this device. Your passcode never leaves the browser.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            autoComplete="off"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none"
            disabled={loading}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                disabled={loading}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !passcode}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {loading ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
