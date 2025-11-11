import React from 'react';
import { FolderOpen } from 'lucide-react';

import type { SecureVolumeIdentity, SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../desktop-dashboard/src/shared/ipcChannels';

interface DesktopAuthEventPayload extends SecureVolumeIdentity {
  authToken: string;
}

const hasWindow = typeof window !== 'undefined';
const resolveSecureVolumeApi = () => (hasWindow ? window.parNoirDesktop?.secureVolume : undefined);
const resolveNativeApi = () => (hasWindow ? window.parNoirDesktop?.native : undefined);

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

        if (status.mounted && status.mountPoint && nativeApi?.openPath) {
          try {
            await nativeApi.openPath(status.mountPoint);
          } catch (err) {
            console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder after unlock', err);
          }
        }

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

      const context: SecureVolumeUnlockPayload = {
        pnName: payload.pnName,
        publicKey: payload.publicKey,
        authToken: payload.authToken.trim(),
      };

      contextRef.current = context;
      setIdentity({ pnName: payload.pnName, publicKey: payload.publicKey });

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
        Unlock your pN session to access the encrypted volume on this device. The folder mounts automatically when your session is active.
      </p>

      {identity && (
        <p className="text-xs text-text-secondary">
          Volume identity <span className="text-white font-medium">par Noir - {identity.pnName}</span>
        </p>
      )}

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
