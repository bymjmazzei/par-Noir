import React from 'react';
import { FolderOpen } from 'lucide-react';

import type { SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../desktop-dashboard/src/shared/ipcChannels';

const hasWindow = typeof window !== 'undefined';
const getSecureVolumeApi = () => (hasWindow ? window.parNoirDesktop?.secureVolume : undefined);
const getNativeApi = () => (hasWindow ? window.parNoirDesktop?.native : undefined);

const bootstrapPlatform = hasWindow ? window.parNoirDesktop?.platform ?? 'unknown' : 'unknown';

const initialState: SecureVolumeMountState = {
  mounted: false,
  mountPoint: null,
  lastMountedAt: undefined,
  platform: bootstrapPlatform,
  driver: 'unknown',
  bundleExists: false,
};

export const DesktopSecureFolderPanel: React.FC = () => {
  const [mountState, setMountState] = React.useState<SecureVolumeMountState>(initialState);
  const [isOpening, setIsOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unlockContext, setUnlockContext] = React.useState<SecureVolumeUnlockPayload | null>(null);

  const secureVolume = React.useMemo(getSecureVolumeApi, []);
  const nativeApi = React.useMemo(getNativeApi, []);

  const refreshStatus = React.useCallback(async () => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    try {
      const status = await secureVolume.status();
      setMountState(status);
      setError(null);
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to fetch status', err);
      setError('Unable to read secure folder status.');
    }
  }, [secureVolume]);

  const handleUnlock = React.useCallback(async (payload: SecureVolumeUnlockPayload) => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    if (!payload.passcode?.trim()) {
      setError('Unlock failed: missing pN passcode. Re-authenticate to continue.');
      setUnlockContext(null);
      return;
    }

    setUnlockContext(payload);

    try {
      const status = await secureVolume.unlock(payload);
      setMountState(status);
      setError(null);

      if (status.mounted && status.mountPoint && nativeApi?.openPath) {
        await nativeApi.openPath(status.mountPoint);
      }
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to unlock secure volume', err);
      setError('Failed to unlock secure folder. Verify your pN session credentials.');
      setUnlockContext(null);
    }
  }, [secureVolume, nativeApi]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<SecureVolumeUnlockPayload>;
      if (custom.detail?.pnName && custom.detail.publicKey) {
        void handleUnlock(custom.detail);
      }
    };

    if (hasWindow) {
      window.addEventListener('pn-auth-session', listener as EventListener);
    }
    return () => {
      if (hasWindow) {
        window.removeEventListener('pn-auth-session', listener as EventListener);
      }
    };
  }, [handleUnlock]);

  React.useEffect(() => () => {
    if (secureVolume) {
      void secureVolume.lock().catch((err: unknown) => {
        console.warn('[DesktopSecureFolderPanel] Failed to lock secure volume during cleanup', err);
      });
    }
  }, [secureVolume]);

  const handleRevealInFinder = React.useCallback(async () => {
    if (mountState.mounted && mountState.mountPoint && nativeApi?.openPath) {
      try {
        await nativeApi.openPath(mountState.mountPoint);
      } catch (err: unknown) {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
      }
    } else if (secureVolume && unlockContext) {
      try {
        const status = await secureVolume.mount();
        setMountState(status);
        if (status.mounted && status.mountPoint && nativeApi?.openPath) {
          await nativeApi.openPath(status.mountPoint);
        } else {
          setError('Secure folder locked. Re-authenticate to continue.');
        }
      } catch (err: unknown) {
        console.error('[DesktopSecureFolderPanel] Failed to mount on demand', err);
        setError('Unable to open secure folder. Re-authenticate and try again.');
      }
    } else {
      setError('Secure folder locked. Re-authenticate to continue.');
    }
  }, [mountState.mounted, mountState.mountPoint, nativeApi, secureVolume, unlockContext]);

  return (
    <section className="bg-neutral-900/80 border border-neutral-700 rounded-2xl p-6 shadow-xl flex flex-col space-y-4">
      <button
        type="button"
        onClick={() => {
          setIsOpening(true);
          setError(null);
          void (async () => {
            try {
              await handleRevealInFinder();
            } finally {
              setIsOpening(false);
            }
          })();
        }}
        disabled={isOpening}
        className="uppercase inline-flex items-center justify-center px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold tracking-wide hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <FolderOpen className="h-4 w-4 mr-2" />
        {isOpening ? 'OPENING…' : 'OPEN SECURE FOLDER'}
      </button>

      <p className="text-xs text-text-secondary">
        Unlock your pN session to access the encrypted folder on this device. Files stay local and mount automatically when your session is active.
      </p>

      {mountState.mounted && mountState.mountPoint && (
        <p className="text-xs text-text-secondary">
          Mounted at <span className="text-white font-medium">{mountState.mountPoint}</span>
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
};

export default DesktopSecureFolderPanel;
