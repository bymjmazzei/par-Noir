/**
 * Messaging keys are unwrapped in par Noir Unlock and returned without Key 1 or Key 2.
 */

import { Lock } from 'lucide-react';
import { HostedShellLaunch } from '@par-noir/oauth-ui';
import { applyDmSessionHandoff } from '../services/dmIdentitySession';

interface DmCryptoUnlockModalProps {
  pnName?: string;
  onUnlocked: () => void;
  onCancel?: () => void;
}

export function DmCryptoUnlockModal({ onUnlocked, onCancel }: DmCryptoUnlockModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2 text-white">
          <Lock className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Restore messaging</h2>
        </div>
        <HostedShellLaunch
          op="dm"
          label="Continue in par Noir Unlock"
          onSession={(session) => {
            const secret = session.result?.mlKemSecretKey;
            if (!secret) return;
            applyDmSessionHandoff({
              mlKemSecretKey: secret,
              mlKemPublicKey: session.result?.mlKemPublicKey,
            });
            onUnlocked();
          }}
        />
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
