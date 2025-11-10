import React from 'react';
import { FolderOpen } from 'lucide-react';

import type { SecureVolumeIdentity, SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../desktop-dashboard/src/shared/ipcChannels';

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
  const [identity, setIdentity] = React.useState<SecureVolumeIdentity | null>(null);
  const identityRef = React.useRef<SecureVolumeIdentity | null>(null);

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

  const getSessionPasscode = React.useCallback((): string | null => {
    if (!hasWindow) {
      return null;
    }
    try {
      const value = window.sessionStorage.getItem('pn_session_passcode');
      return value && value.trim().length > 0 ? value.trim() : null;
    } catch (err) {
      console.warn('[DesktopSecureFolderPanel] Unable to read session passcode', err);
      return null;
    }
  }, []);

  const applyUnlockContext = React.useCallback(async (payload: SecureVolumeUnlockPayload) => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return null;
    }

    try {
      const status = await secureVolume.unlock(payload);
      setMountState(status);
      setError(null);
      setUnlockContext(payload);
      identityRef.current = { pnName: payload.pnName, publicKey: payload.publicKey };
      setIdentity(identityRef.current);

      if (hasWindow) {
        try {
          window.sessionStorage.setItem('pn_session_passcode', payload.passcode);
        } catch (storageErr) {
          console.warn('[DesktopSecureFolderPanel] Unable to persist session passcode', storageErr);
        }
      }
      return status;
    } catch (err) {
      console.error('[DesktopSecureFolderPanel] Failed to unlock secure volume', err);
      setError('Failed to unlock secure folder. Verify your pN session credentials.');
      return null;
    }
  }, [secureVolume]);

  const handleUnlock = React.useCallback(async (payload: SecureVolumeUnlockPayload) => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    identityRef.current = { pnName: payload.pnName, publicKey: payload.publicKey };
    setIdentity(identityRef.current);

    let resolvedPasscode = payload.passcode?.trim() ?? null;
    if (!resolvedPasscode) {
      resolvedPasscode = getSessionPasscode();
    }

    if (!resolvedPasscode) {
      setError('Unlock failed: missing pN passcode. Re-authenticate to continue.');
      return;
    }

    const unlockPayload: SecureVolumeUnlockPayload = {
      pnName: payload.pnName,
      publicKey: payload.publicKey,
      passcode: resolvedPasscode,
    };

    const status = await applyUnlockContext(unlockPayload);
    if (status?.mounted && status.mountPoint && nativeApi?.openPath) {
      try {
        await nativeApi.openPath(status.mountPoint);
      } catch (err) {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder after unlock', err);
      }
    }
  }, [secureVolume, nativeApi, applyUnlockContext, getSessionPasscode]);

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

  const ensureUnlocked = React.useCallback(async (): Promise<SecureVolumeMountState | null> => {
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return null;
    }

    if (mountState.mounted) {
      return mountState;
    }

    const existingContext = unlockContext;
    if (existingContext) {
      try {
        const status = await secureVolume.mount();
        setMountState(status);
        return status;
      } catch (err) {
        console.warn('[DesktopSecureFolderPanel] Mount failed, retrying unlock', err);
        const refreshed = await applyUnlockContext(existingContext);
        return refreshed;
      }
    }

    const identityCandidate = identityRef.current ?? identity;
    const sessionPasscode = getSessionPasscode();
    if (identityCandidate && sessionPasscode) {
      const payload: SecureVolumeUnlockPayload = {
        pnName: identityCandidate.pnName,
        publicKey: identityCandidate.publicKey,
        passcode: sessionPasscode,
      };
      const status = await applyUnlockContext(payload);
      return status;
    }

    if (identityCandidate && secureVolume?.hydrate) {
      try {
        const status = await secureVolume.hydrate(identityCandidate);
        setMountState(status);
        setError(null);
        return status;
      } catch (err) {
        console.warn('[DesktopSecureFolderPanel] Failed to hydrate secure volume from keychain', err);
      }
    }

    setError('Secure folder locked. Re-authenticate to continue.');
    return null;
  }, [applyUnlockContext, getSessionPasscode, mountState, secureVolume, unlockContext, identity]);

  const handleRevealInFinder = React.useCallback(async () => {
    const status = await ensureUnlocked();
    if (!status) {
      return;
    }

    if (status.mounted && status.mountPoint && nativeApi?.openPath) {
      try {
        await nativeApi.openPath(status.mountPoint);
      } catch (err: unknown) {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
      }
    } else {
      setError('Secure folder locked. Re-authenticate to continue.');
    }
  }, [ensureUnlocked, nativeApi]);

  React.useEffect(() => {
    if (!identity) {
      return;
    }

    if (unlockContext) {
      return;
    }

    const passcode = getSessionPasscode();
    if (passcode) {
      const payload: SecureVolumeUnlockPayload = {
        pnName: identity.pnName,
        publicKey: identity.publicKey,
        passcode,
      };
      void applyUnlockContext(payload);
      return;
    }

    if (secureVolume?.hydrate) {
      void secureVolume
        .hydrate(identity)
        .then((status) => {
          setMountState(status);
          setError(null);
        })
        .catch((err) => {
          console.warn('[DesktopSecureFolderPanel] Unable to hydrate secure volume via keychain', err);
        });
    }
  }, [applyUnlockContext, getSessionPasscode, identity, secureVolume, unlockContext]);

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
