import React from 'react';
import { FolderOpen } from 'lucide-react';

import type {
  SecureVolumeIdentity,
  SecureVolumeMountState,
  SecureVolumeUnlockPayload
} from '@par-noir/desktop-ipc';

interface DesktopAuthEventPayload extends SecureVolumeIdentity {
  authToken: string;
}

interface DesktopLockEventPayload {
  pnName?: string;
  publicKey?: string;
  pnIdentifier?: string;
}

const hasWindow = typeof window !== 'undefined';
const resolveSecureVolumeApi = () => (hasWindow ? window.parNoirDesktop?.secureVolume : undefined);
const resolveNativeApi = () => (hasWindow ? window.parNoirDesktop?.native : undefined);

const browserPlatform: NodeJS.Platform =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
    ? 'win32'
    : typeof navigator !== 'undefined' && navigator.userAgent.includes('Linux')
      ? 'linux'
      : 'darwin';
const bootstrapPlatform = hasWindow ? window.parNoirDesktop?.platform ?? browserPlatform : browserPlatform;

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
  const [identity, setIdentity] = React.useState<SecureVolumeIdentity | null>(null);
  const contextRef = React.useRef<SecureVolumeUnlockPayload | null>(null);

  const resolveSecureVolume = React.useCallback(() => resolveSecureVolumeApi(), []);
  const resolveNative = React.useCallback(() => resolveNativeApi(), []);

  const refreshStatus = React.useCallback(async () => {
    const secureVolume = resolveSecureVolume();
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
  }, [resolveSecureVolume]);

  const unlockWithContext = React.useCallback(
    async (context: SecureVolumeUnlockPayload): Promise<SecureVolumeMountState | null> => {
      const secureVolume = resolveSecureVolume();
      const nativeApi = resolveNative();
      if (!secureVolume) {
        setError('Secure volume interface unavailable.');
        return null;
      }

      try {
        const status = await secureVolume.unlock(context);
        setMountState(status);
        setError(null);

        return status;
      } catch (err) {
        console.error('[DesktopSecureFolderPanel] Failed to unlock secure volume', err);
        setError('Failed to unlock secure folder. Verify your pN session credentials.');
        return null;
      }
    },
    [resolveSecureVolume, resolveNative]
  );

  const handleUnlock = React.useCallback(
    async (payload: DesktopAuthEventPayload) => {
      if (!payload.authToken || !payload.authToken.trim()) {
        setError('Secure folder unlock failed: missing authenticated user token.');
        return;
      }

      // SECURITY: Get pnName from SecureCredentialManager if not in payload (secrets)
      // The payload may come from FileStorageAggregator which includes pnName from SecureCredentialManager
      // But we should verify it's available and not store it unnecessarily
      const context: SecureVolumeUnlockPayload = {
        pnName: payload.pnName, // This comes from SecureCredentialManager via FileStorageAggregator
        publicKey: payload.publicKey,
        pnIdentifier: payload.pnIdentifier,
        authToken: payload.authToken.trim(),
      };

      contextRef.current = context;
      // SECURITY: Store minimal identity info (pnName is needed for desktop unlock)
      // Note: pnName in payload comes from SecureCredentialManager, not from session
      setIdentity({ pnName: payload.pnName, publicKey: payload.publicKey, pnIdentifier: payload.pnIdentifier });

      await unlockWithContext(context);
    },
    [unlockWithContext]
  );

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<DesktopAuthEventPayload>;
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

  React.useEffect(
    () => () => {
      const secureVolume = resolveSecureVolume();
      if (secureVolume) {
        void secureVolume.lock().catch((err: unknown) => {
          console.warn('[DesktopSecureFolderPanel] Failed to lock secure volume during cleanup', err);
        });
      }
    },
    [resolveSecureVolume]
  );

  const ensureUnlocked = React.useCallback(async (): Promise<SecureVolumeMountState | null> => {
    const secureVolume = resolveSecureVolume();
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return null;
    }

    if (mountState.mounted) {
      return mountState;
    }

    if (contextRef.current) {
      const status = await unlockWithContext(contextRef.current);
      if (status) {
        return status;
      }
    }

    if (identity) {
      try {
        const status = await secureVolume.hydrate(identity);
        setMountState(status);
        setError(null);
        return status;
      } catch (err) {
        console.warn('[DesktopSecureFolderPanel] Hydrate failed', err);
      }
    }

    setError('Secure folder locked. Unlock your pN session to continue.');
    return null;
  }, [identity, mountState, resolveSecureVolume, unlockWithContext]);

  const handleRevealInFinder = React.useCallback(async () => {
    setIsOpening(true);
    setError(null);
    try {
      const status = await ensureUnlocked();
      if (!status) {
        return;
      }

      if (status.mounted && status.mountPoint) {
        const nativeApi = resolveNative();
        if (nativeApi?.openPath) {
          try {
            await nativeApi.openPath(status.mountPoint);
          } catch (err: unknown) {
            console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
          }
        }
      } else {
        setError('Secure folder locked. Unlock your pN session to continue.');
      }
    } finally {
      setIsOpening(false);
    }
  }, [ensureUnlocked, resolveNative]);

  React.useEffect(() => {
    const handleLock = (event: Event) => {
      const secureVolume = resolveSecureVolume();
      if (!secureVolume) {
        return;
      }

      const detail = (event as CustomEvent<DesktopLockEventPayload>).detail;

      void secureVolume
        .lock()
        .then((status) => {
          setMountState(status);
          setIdentity(
            detail
              ? {
                  pnName: detail.pnName ?? '',
                  publicKey: detail.publicKey ?? '',
                  pnIdentifier: detail.pnIdentifier,
                }
              : null
          );
          contextRef.current = null;
        })
        .catch((err: unknown) => {
          console.warn('[DesktopSecureFolderPanel] Failed to lock secure volume on logout', err);
          contextRef.current = null;
          setIdentity(null);
          setMountState((prev) => ({
            ...prev,
            mounted: false,
            mountPoint: null,
          }));
        });
    };

    if (hasWindow) {
      window.addEventListener('pn-auth-locked', handleLock as EventListener);
    }

    return () => {
      if (hasWindow) {
        window.removeEventListener('pn-auth-locked', handleLock as EventListener);
      }
    };
  }, [resolveSecureVolume]);

  return (
    <section className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/40">
            <FolderOpen className="h-5 w-5 text-blue-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white">Secure Folder</h3>
            <p className="text-text-secondary text-sm max-w-xl">
              Encrypted device storage only available on this device.
            </p>
            {error && (
              <p className="text-sm text-red-400 pt-1">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
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
            className="inline-flex items-center space-x-2 rounded-xl bg-blue-600/90 hover:bg-blue-500 transition-colors px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FolderOpen className="h-4 w-4" />
            <span>{isOpening ? 'Opening…' : 'Open Secure Folder'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default DesktopSecureFolderPanel;
