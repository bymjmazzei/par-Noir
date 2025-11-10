import React from 'react';

interface SecureVolumeMountState {
  mounted: boolean;
  mountPoint: string | null;
  lastMountedAt?: string;
  platform: NodeJS.Platform;
  driver: string;
  bundleExists: boolean;
}

interface SecureVolumeUnlockPayload {
  pnName: string;
  publicKey: string;
  passcode: string;
}

type MountAction = 'mount' | 'unmount';

const hasWindow = typeof window !== 'undefined';
const getSecureVolumeApi = () => (hasWindow ? window.parNoirDesktop?.secureVolume : undefined);

const bootstrapPlatform = hasWindow ? window.parNoirDesktop?.platform ?? 'unknown' : 'unknown';

const initialState: SecureVolumeMountState = {
  mounted: false,
  mountPoint: null,
  platform: bootstrapPlatform,
  driver: 'unknown',
  bundleExists: false
};

export const DesktopSecureFolderPanel: React.FC = () => {
  const [mountState, setMountState] = React.useState<SecureVolumeMountState>(initialState);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unlockContext, setUnlockContext] = React.useState<SecureVolumeUnlockPayload | null>(null);
  const [hasUnlockContext, setHasUnlockContext] = React.useState(false);

  const secureVolume = React.useMemo(getSecureVolumeApi, []);
  const openPath = window.parNoirDesktop?.native?.openPath;
  const mountedRef = React.useRef<boolean>(false);

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

  const mountVolume = React.useCallback(async () => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextState = await secureVolume.mount();
      setMountState(nextState);
      return nextState;
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to mount secure folder', err);
      setError('Failed to mount secure folder.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [secureVolume]);

  const unmountVolume = React.useCallback(async () => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextState = await secureVolume.unmount();
      setMountState(nextState);
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to unmount secure folder', err);
      setError('Failed to unmount secure folder.');
    } finally {
      setIsLoading(false);
    }
  }, [secureVolume]);

  const handleUnlock = React.useCallback(async (payload: SecureVolumeUnlockPayload) => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    setUnlockContext(payload);

    try {
      setIsLoading(true);
      const status = await secureVolume.unlock(payload);
      setMountState(status);
      setError(null);
      setHasUnlockContext(true);

      if (status.bundleExists && !status.mounted) {
        void mountVolume();
      }
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to unlock secure volume', err);
      setError('Failed to unlock secure folder. Verify your pN session credentials.');
      setHasUnlockContext(false);
    } finally {
      setIsLoading(false);
    }
  }, [secureVolume, mountVolume]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<SecureVolumeUnlockPayload>;
      if (custom.detail?.pnName && custom.detail.publicKey && custom.detail.passcode) {
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
    setHasUnlockContext(false);
    setUnlockContext(null);
  }, [secureVolume]);

  React.useEffect(() => {
    if (mountState.mounted && !mountedRef.current && mountState.mountPoint && openPath) {
      void openPath(mountState.mountPoint).catch((err: unknown) => {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
      });
    }
    mountedRef.current = mountState.mounted;
  }, [mountState.mounted, mountState.mountPoint, openPath]);

  const handlePrimaryAction = () => {
    if (!hasUnlockContext) {
      setError('Unlock your pN with the correct passcode before mounting the secure folder.');
      return;
    }
    if (mountState.mounted) {
      void unmountVolume();
      return;
    }

    void mountVolume();
  };

  const creationMode = !mountState.bundleExists;
  const primaryLabel = mountState.mounted
    ? 'DISMOUNT SECURE FOLDER'
    : creationMode
      ? 'CREATE SECURE VOLUME'
      : 'OPEN SECURE FOLDER';

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
            onClick={handlePrimaryAction}
            disabled={isLoading}
            className="uppercase inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold tracking-wide hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'WORKING…' : primaryLabel}
          </button>

          {mountState.mountPoint && !creationMode && (
            <button
              type="button"
              disabled={isLoading || !openPath}
              onClick={() => {
                if (mountState.mountPoint && openPath) {
                  void openPath(mountState.mountPoint).catch((err: unknown) => {
                    console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
                  });
                }
              }}
              className="uppercase inline-flex items-center justify-center px-4 py-2 rounded-lg border border-neutral-600 text-text-secondary text-sm font-semibold tracking-wide hover:text-white hover:border-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              REVEAL IN FINDER
            </button>
          )}

          <button
            type="button"
            disabled={isLoading}
            onClick={() => refreshStatus()}
            className="uppercase inline-flex items-center justify-center px-4 py-2 rounded-lg border border-neutral-600 text-text-secondary text-sm font-semibold tracking-wide hover:text-white hover:border-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            REFRESH STATUS
          </button>
        </div>

        <p className="text-xs text-text-secondary pt-2">
          {creationMode
            ? 'Create the encrypted container once per device. You can then move files in and out directly from Finder.'
            : 'The secure volume is encrypted when unmounted and has no cloud backup. Use Finder to manage files and dismount before ending your session.'}
        </p>
      </div>
    </section>
  );
};

export default DesktopSecureFolderPanel;
