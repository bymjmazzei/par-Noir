import React from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';

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
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unlockContext, setUnlockContext] = React.useState<SecureVolumeUnlockPayload | null>(null);
  const [hasUnlockContext, setHasUnlockContext] = React.useState(false);
  const hasRequestedMountRef = React.useRef(false);

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

  const attemptMount = React.useCallback(async () => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return null;
    }

    try {
      const nextState = await secureVolume.mount();
      setMountState(nextState);
      return nextState;
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to mount secure volume', err);
      setError('Failed to mount secure folder. Confirm your pN passcode, then try again.');
      return null;
    }
  }, [secureVolume]);

  const handleUnlock = React.useCallback(async (payload: SecureVolumeUnlockPayload) => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    if (!payload.passcode?.trim()) {
      setError('Unlock failed: missing pN passcode. Re-authenticate to continue.');
      setHasUnlockContext(false);
      return;
    }

    setUnlockContext(payload);

    try {
      setIsLoading(true);
      setHasUnlockContext(true);
      const status = await secureVolume.unlock(payload);
      setMountState(status);
      setError(null);

      const finalState = status.mounted ? status : await attemptMount();

      if (finalState?.mounted && finalState.mountPoint && nativeApi?.openPath) {
        try {
          await nativeApi.openPath(finalState.mountPoint);
        } catch (openErr) {
          console.error('[DesktopSecureFolderPanel] Failed to open secure folder after unlock', openErr);
        }
      }
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to unlock secure volume', err);
      setError('Failed to unlock secure folder. Verify your pN session credentials.');
      setHasUnlockContext(false);
    } finally {
      setIsLoading(false);
    }
  }, [secureVolume, nativeApi, attemptMount]);

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

  React.useEffect(() => {
    if (!hasUnlockContext || mountState.mounted || isLoading) {
      return;
    }

    if (hasRequestedMountRef.current) {
      return;
    }

    hasRequestedMountRef.current = true;
    setIsLoading(true);
    void attemptMount()
      .then(async (state) => {
        if (state?.mounted && state.mountPoint && nativeApi?.openPath) {
          try {
            await nativeApi.openPath(state.mountPoint);
          } catch (openErr) {
            console.error('[DesktopSecureFolderPanel] Failed to open secure folder after auto mount', openErr);
          }
        }
      })
      .finally(() => {
        hasRequestedMountRef.current = false;
        setIsLoading(false);
      });
  }, [attemptMount, hasUnlockContext, mountState.mounted, isLoading, nativeApi]);

  React.useEffect(() => {
    if (!mountState.mounted) {
      hasRequestedMountRef.current = false;
    }
  }, [mountState.mounted]);

  const handleRevealInFinder = React.useCallback(async () => {
    if (mountState.mounted && mountState.mountPoint && nativeApi?.openPath) {
      try {
        await nativeApi.openPath(mountState.mountPoint);
      } catch (err: unknown) {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
      }
    }
  }, [mountState.mounted, mountState.mountPoint, nativeApi]);

  return (
    <section className="bg-neutral-900/80 border border-neutral-700 rounded-2xl p-6 shadow-xl">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold text-white">Secure Folder</h2>
        <p className="text-text-secondary text-sm">
          Unlock your pN session to access the encrypted volume on this device. Files remain local and private.
        </p>
      </header>

      <div className="space-y-3">
        <div className="bg-neutral-800/60 border border-neutral-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary uppercase tracking-wide">Status</p>
            <p className="text-base text-white font-medium">{mountState.mounted ? 'Mounted' : 'Locked'}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-secondary uppercase tracking-wide">Mount Point</p>
            <p className="text-base text-white font-medium">{mountState.mountPoint ?? 'Not available'}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-neutral-800/40 border border-neutral-700 rounded-xl p-3">
            <p className="text-xs text-text-secondary uppercase tracking-wide">Platform</p>
            <p className="text-sm text-white font-medium">{mountState.platform}</p>
          </div>
          <div className="bg-neutral-800/40 border border-neutral-700 rounded-xl p-3">
            <p className="text-xs text-text-secondary uppercase tracking-wide">Driver</p>
            <p className="text-sm text-white font-medium">{mountState.driver}</p>
          </div>
        </div>

        {mountState.lastMountedAt && (
          <p className="text-xs text-text-secondary">
            Last mounted at: {new Date(mountState.lastMountedAt).toLocaleString()}
          </p>
        )}

        {unlockContext && (
          <p className="text-xs text-text-secondary">Session: {unlockContext.pnName}</p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center space-x-3 pt-2">
          <button
            type="button"
            onClick={handleRevealInFinder}
            disabled={isLoading || !mountState.mounted || !mountState.mountPoint}
            className="uppercase inline-flex items-center justify-center px-4 py-2 rounded-lg border border-neutral-600 text-text-secondary text-sm font-semibold tracking-wide hover:text-white hover:border-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            OPEN SECURE FOLDER
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => refreshStatus()}
            className="uppercase inline-flex items-center justify-center px-4 py-2 rounded-lg border border-neutral-600 text-text-secondary text-sm font-semibold tracking-wide hover:text-white hover:border-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            REFRESH
          </button>
        </div>

        <p className="text-xs text-text-secondary pt-2">
          The secure volume mounts automatically when your pN session unlocks. Files stay local to this device and are encrypted whenever the volume is locked.
        </p>
      </div>
    </section>
  );
};

export default DesktopSecureFolderPanel;
