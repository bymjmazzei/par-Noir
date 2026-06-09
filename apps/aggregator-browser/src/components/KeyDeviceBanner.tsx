import { KeyRound, Loader2 } from 'lucide-react';
import { useAggregatorDeviceKeys } from '../hooks/useAggregatorDeviceKeys';
import { useUserState } from '../contexts/UserStateContext';

/**
 * Prompts user to key this browser when device policy requires it for messaging.
 */
export function KeyDeviceBanner() {
  const { userState } = useUserState();
  const { needsKeying, keying, error, keyDevice, isKeyed } = useAggregatorDeviceKeys({
    pnIdentifier: userState.pnIdentifier,
    isUnlocked: userState.isUnlocked,
  });

  if (!userState.isUnlocked || isKeyed || !needsKeying) {
    return null;
  }

  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <KeyRound className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <span className="flex-1 min-w-[12rem]">
        Key this device to send and read messages. Manage policy in the dashboard.
      </span>
      <button
        type="button"
        onClick={() => void keyDevice()}
        disabled={keying}
        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-60"
      >
        {keying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Key this device
      </button>
      {error ? <span className="w-full text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
