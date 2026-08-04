import { KeyRound } from 'lucide-react';
import { useAggregatorDeviceKeys } from '../hooks/useAggregatorDeviceKeys';
import { useUserState } from '../contexts/UserStateContext';
import { isKeyableClient } from '@par-noir/device-client';

const APP_DOWNLOAD_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_APP_DOWNLOAD_URL?: string } }).env
      ?.VITE_APP_DOWNLOAD_URL) ||
  'https://parnoir.com/download';

/**
 * Prompts user to key via native app when device policy requires it for messaging.
 * Web browsers never key — Download the app CTA only.
 */
export function KeyDeviceBanner() {
  const { userState } = useUserState();
  const { needsKeying, error, isKeyed } = useAggregatorDeviceKeys({
    pnIdentifier: userState.pnIdentifier,
    isUnlocked: userState.isUnlocked,
  });

  if (!userState.isUnlocked || isKeyed || !needsKeying) {
    return null;
  }

  if (isKeyableClient()) {
    return (
      <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <KeyRound className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <span className="flex-1 min-w-[12rem]">
          Key this device in the app to send and read messages. Pair from another keyed install if
          you already have one.
        </span>
        {error ? <span className="w-full text-xs text-red-300">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <KeyRound className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <span className="flex-1 min-w-[12rem]">
        Messaging prefers a keyed phone or desktop app. Download the app to key a device.
      </span>
      <a
        href={APP_DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400"
      >
        Download the app
      </a>
      {error ? <span className="w-full text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
