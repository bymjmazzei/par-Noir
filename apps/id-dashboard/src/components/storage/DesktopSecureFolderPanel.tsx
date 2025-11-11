import React from 'react';
import { FolderOpen, Lock } from 'lucide-react';

import type { SecureVolumeIdentity, SecureVolumeMountState, SecureVolumeUnlockPayload } from '../../desktop-dashboard/src/shared/ipcChannels';

interface DesktopAuthEventPayload extends SecureVolumeIdentity {
  passcode?: string;
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
  const [unlockContext, setUnlockContext] = React.useState<SecureVolumeUnlockPayload | null>(null);
  const [identity, setIdentity] = React.useState<SecureVolumeIdentity | null>(null);
  const identityRef = React.useRef<SecureVolumeIdentity | null>(null);
  const [isPasscodePromptOpen, setIsPasscodePromptOpen] = React.useState(false);
  const [manualPasscode, setManualPasscode] = React.useState('');
  const [manualPasscodeError, setManualPasscodeError] = React.useState<string | null>(null);
  const [isSubmittingPasscode, setIsSubmittingPasscode] = React.useState(false);

  const resolveSecureVolume = React.useCallback(() => resolveSecureVolumeApi(), []);
  const resolveNative = React.useCallback(() => resolveNativeApi(), []);

  const deriveAuthToken = React.useCallback(async (pnName: string, publicKey: string, passcode: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${pnName}::${publicKey}::${passcode}`);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }, []);

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
    const secureVolume = resolveSecureVolume();
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return null;
    }

    try {
      const status = await secureVolume.unlock(payload);
      setMountState(status);
      setError(null);
      setUnlockContext(payload);
      identityRef.current = { pnName: payload.pnName, publicKey: payload.publicKey, authToken: payload.authToken };
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
  }, [resolveSecureVolume]);

  const handleUnlock = React.useCallback(async (payload: DesktopAuthEventPayload) => {
    const secureVolume = resolveSecureVolume();
    const nativeApi = resolveNative();
    if (!secureVolume) {
      setError('Secure volume interface unavailable.');
      return;
    }

    console.log('[DesktopSecureFolderPanel] pn-auth-session payload received', {
      pnName: payload.pnName,
      publicKeyPreview: payload.publicKey?.slice(0, 16),
      hasPasscode: Boolean(payload.passcode),
      hasAuthToken: Boolean(payload.authToken),
    });

    console.debug('[DesktopSecureFolderPanel] secureVolume API snapshot', {
      hasSecureVolume: Boolean(secureVolume),
      hasHydrate: typeof secureVolume?.hydrate,
      hasUnlock: typeof secureVolume?.unlock,
      availableKeys: secureVolume ? Object.keys(secureVolume as Record<string, unknown>) : [],
    });

    identityRef.current = { pnName: payload.pnName, publicKey: payload.publicKey, authToken: payload.authToken };
    setIdentity(identityRef.current);

    let resolvedPasscode = payload.passcode?.trim() ?? null;
    if (!resolvedPasscode) {
      resolvedPasscode = getSessionPasscode();
    }

    if (!resolvedPasscode && identityRef.current && secureVolume?.getPasscode) {
      try {
        const cachedPasscode = await secureVolume.getPasscode(identityRef.current);
        if (cachedPasscode) {
          resolvedPasscode = cachedPasscode;
          console.log('[DesktopSecureFolderPanel] Retrieved passcode from Keychain via getPasscode');
        }
      } catch (keychainErr) {
        console.warn('[DesktopSecureFolderPanel] Failed to retrieve passcode from Keychain via getPasscode', keychainErr);
      }
    }

    if (!resolvedPasscode) {
      if (identityRef.current?.authToken) {
        try {
          const status = await secureVolume.hydrate(identityRef.current);
          setMountState(status);
          setError(null);

          if (status?.mounted && status.mountPoint && nativeApi?.openPath) {
            try {
              await nativeApi.openPath(status.mountPoint);
            } catch (err) {
              console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder after hydrate', err);
            }
          }

          try {
            const cachedAfterHydrate = await secureVolume.getPasscode?.(identityRef.current);
            if (cachedAfterHydrate) {
              sessionStorage.setItem('pn_session_passcode', cachedAfterHydrate);
              const unlockPayload: SecureVolumeUnlockPayload = {
                pnName: identityRef.current.pnName,
                publicKey: identityRef.current.publicKey,
                passcode: cachedAfterHydrate,
                authToken: identityRef.current.authToken,
              };
              setUnlockContext(unlockPayload);
            }
          } catch (persistErr) {
            console.warn('[DesktopSecureFolderPanel] Unable to persist passcode after hydrate', persistErr);
          }
          return;
        } catch (hydrateErr) {
          console.warn('[DesktopSecureFolderPanel] Hydrate via authToken failed', hydrateErr);
        }
      }

      setError('Unlock failed: missing pN passcode. Re-authenticate to continue.');
      return;
    }

    try {
      sessionStorage.setItem('pn_session_passcode', resolvedPasscode);
      console.log('[DesktopSecureFolderPanel] Stored passcode from pn-auth-session payload');
    } catch (storageError) {
      console.warn('[DesktopSecureFolderPanel] Unable to persist passcode from pn-auth-session payload', storageError);
    }

    const authToken = payload.authToken ?? (await deriveAuthToken(payload.pnName, payload.publicKey, resolvedPasscode));

    const unlockPayload: SecureVolumeUnlockPayload = {
      pnName: payload.pnName,
      publicKey: payload.publicKey,
      passcode: resolvedPasscode,
      authToken,
    };

    const status = await applyUnlockContext(unlockPayload);
    if (status?.mounted && status.mountPoint && nativeApi?.openPath) {
      try {
        await nativeApi.openPath(status.mountPoint);
      } catch (err) {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder after unlock', err);
      }
    }
  }, [resolveSecureVolume, resolveNative, applyUnlockContext, getSessionPasscode, deriveAuthToken]);

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

  React.useEffect(() => () => {
    const secureVolume = resolveSecureVolume();
    if (secureVolume) {
      void secureVolume.lock().catch((err: unknown) => {
        console.warn('[DesktopSecureFolderPanel] Failed to lock secure volume during cleanup', err);
      });
    }
  }, [resolveSecureVolume]);

  const ensureUnlocked = React.useCallback(async (): Promise<SecureVolumeMountState | null> => {
    const secureVolume = resolveSecureVolume();
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
    console.log('[DesktopSecureFolderPanel] ensureUnlocked state', {
      hasIdentity: Boolean(identityCandidate?.pnName && identityCandidate?.publicKey),
      hasSessionPasscode: Boolean(sessionPasscode),
      hasUnlockContext: Boolean(unlockContext?.passcode),
      hasAuthToken: Boolean(identityCandidate?.authToken || unlockContext?.authToken),
    });

    if (identityCandidate && secureVolume?.hydrate) {
      try {
        const status = await secureVolume.hydrate(identityCandidate);
        setMountState(status);
        setError(null);
        return status;
      } catch (err) {
        console.warn('[DesktopSecureFolderPanel] Hydrate failed, falling back to session context', err);
      }
    }

    if (identityCandidate && sessionPasscode) {
      const payload: SecureVolumeUnlockPayload = {
        pnName: identityCandidate.pnName,
        publicKey: identityCandidate.publicKey,
        passcode: sessionPasscode,
        authToken: identityCandidate.authToken ?? (await deriveAuthToken(identityCandidate.pnName, identityCandidate.publicKey, sessionPasscode)),
      };
      const status = await applyUnlockContext(payload);
      return status;
    }

    if (identityCandidate) {
      setManualPasscode('');
      setManualPasscodeError(null);
      setIsPasscodePromptOpen(true);
      setError('Enter your pN passcode to open the secure folder.');
      return null;
    }

    setError('Secure folder locked. Re-authenticate to continue.');
    return null;
  }, [applyUnlockContext, getSessionPasscode, mountState, secureVolume, unlockContext, identity, deriveAuthToken]);

  const handleRevealInFinder = React.useCallback(async () => {
    const status = await ensureUnlocked();
    if (!status) {
      return;
    }

    const nativeApi = resolveNative();
    if (status.mounted && status.mountPoint && nativeApi?.openPath) {
      try {
        await nativeApi.openPath(status.mountPoint);
      } catch (err: unknown) {
        console.warn('[DesktopSecureFolderPanel] Failed to reveal secure folder', err);
      }
    } else {
      setError('Secure folder locked. Re-authenticate to continue.');
    }
  }, [ensureUnlocked, resolveNative]);

  React.useEffect(() => {
    if (!identity) {
      return;
    }

    if (unlockContext) {
      return;
    }

    const passcode = getSessionPasscode();
    if (passcode) {
      void (async () => {
        const payload: SecureVolumeUnlockPayload = {
          pnName: identity.pnName,
          publicKey: identity.publicKey,
          passcode,
          authToken: identity.authToken ?? (await deriveAuthToken(identity.pnName, identity.publicKey, passcode)),
        };
        void applyUnlockContext(payload);
      })();
      return;
    }

    const secureVolume = resolveSecureVolume();
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
  }, [applyUnlockContext, getSessionPasscode, identity, resolveSecureVolume]);

  return (
    <>
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

      {isPasscodePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="h-5 w-5 text-blue-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">Secure Folder Passcode Required</h3>
                <p className="text-xs text-text-secondary">Enter your pN passcode to mount the encrypted volume on this device.</p>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  if (!identityRef.current) {
                    setManualPasscodeError('pN identity unavailable. Unlock your session first.');
                    return;
                  }
                  if (!manualPasscode.trim()) {
                    setManualPasscodeError('Passcode is required.');
                    return;
                  }

                  setIsSubmittingPasscode(true);
                  setManualPasscodeError(null);
                  try {
                    const authToken = identityRef.current.authToken ?? (await deriveAuthToken(identityRef.current.pnName, identityRef.current.publicKey, manualPasscode.trim()));
                    const payload: SecureVolumeUnlockPayload = {
                      pnName: identityRef.current.pnName,
                      publicKey: identityRef.current.publicKey,
                      passcode: manualPasscode.trim(),
                      authToken,
                    };
                    const status = await applyUnlockContext(payload);
                    if (!status) {
                      setManualPasscodeError('Unable to unlock with the provided passcode.');
                      return;
                    }
                    try {
                      sessionStorage.setItem('pn_session_passcode', manualPasscode.trim());
                    } catch (storageErr) {
                      console.warn('[DesktopSecureFolderPanel] Unable to persist manual passcode', storageErr);
                    }
                    setIsPasscodePromptOpen(false);
                    setManualPasscode('');
                    setManualPasscodeError(null);
                    const nativeApi = resolveNative();
                    if (status.mounted && status.mountPoint && nativeApi?.openPath) {
                      await nativeApi.openPath(status.mountPoint);
                    }
                  } catch (manualErr) {
                    console.error('[DesktopSecureFolderPanel] Manual passcode submission failed', manualErr);
                    setManualPasscodeError('Unexpected error while unlocking.');
                  } finally {
                    setIsSubmittingPasscode(false);
                  }
                })();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs uppercase tracking-wide text-text-secondary mb-1">
                  Passcode
                </label>
                <input
                  type="password"
                  value={manualPasscode}
                  onChange={(event) => setManualPasscode(event.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {manualPasscodeError && (
                <p className="text-sm text-red-400">{manualPasscodeError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasscodePromptOpen(false);
                    setManualPasscode('');
                    setManualPasscodeError(null);
                  }}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-text-secondary hover:border-neutral-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPasscode}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {isSubmittingPasscode ? 'Unlocking…' : 'Unlock & Mount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default DesktopSecureFolderPanel;
