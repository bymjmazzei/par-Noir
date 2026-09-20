/**
 * Native session vault UI + restore/enroll for browse / messaging.
 */

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SessionVaultEnrollPrompt, SessionVaultUnlockOverlay } from '@par-noir/oauth-ui';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  applyDmSessionHandoff,
  getDmIdentity,
  isDmIdentityReady,
} from '../services/dmIdentitySession';
import { MESSAGING_ONLY } from '../config/buildFlags';
import {
  clearBrowserSessionVault,
  enrollBrowserOauthVault,
  hasBrowserSessionVault,
  isBrowserSessionVaultAvailable,
  unlockBrowserSessionVault,
  updateMessagingVaultDmSession,
} from '../services/sessionVaultNative';

const DECLINED_KEY = MESSAGING_ONLY
  ? 'pn_vault_enroll_declined_messaging'
  : 'pn_vault_enroll_declined_browse';

interface BrowserSessionVaultHostProps {
  /** Called after OAuth session restored from vault (so UI can refresh). */
  onSessionRestored?: () => void;
}

export function BrowserSessionVaultHost({ onSessionRestored }: BrowserSessionVaultHostProps) {
  const [showUnlock, setShowUnlock] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(() => !!PNOAuthService.loadSession());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void (async () => {
      if (!(await isBrowserSessionVaultAvailable())) return;
      const session = PNOAuthService.loadSession();
      if (session) {
        if (!cancelled) setHasSession(true);
        return;
      }
      if (await hasBrowserSessionVault()) {
        if (!cancelled) setShowUnlock(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || hasSession) return;
    let cancelled = false;
    void (async () => {
      if (await hasBrowserSessionVault()) {
        if (!cancelled) setShowUnlock(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !hasSession) return;
    let cancelled = false;
    void (async () => {
      if (!(await isBrowserSessionVaultAvailable())) return;
      if (await hasBrowserSessionVault()) return;
      if (localStorage.getItem(DECLINED_KEY) === '1') return;
      if (!cancelled) setShowEnroll(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  // Keep messaging vault DM material fresh while unlocked
  useEffect(() => {
    if (!MESSAGING_ONLY || !Capacitor.isNativePlatform() || !hasSession) return;
    if (!isDmIdentityReady()) return;
    void (async () => {
      const session = PNOAuthService.loadSession();
      if (!session || !(await hasBrowserSessionVault())) return;
      try {
        const dm = getDmIdentity();
        await updateMessagingVaultDmSession(
          JSON.stringify(session),
          dm?.mlKemSecretKey
            ? JSON.stringify({
                mlKemSecretKey: dm.mlKemSecretKey,
                mlKemPublicKey: dm.mlKemPublicKey,
              })
            : null
        );
      } catch {
        /* ignore */
      }
    })();
  }, [hasSession]);

  const handleBiometricUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await unlockBrowserSessionVault();
      if (!payload) {
        setError('No saved session');
        return;
      }
      if (payload.kind === 'browse_oauth' || payload.kind === 'messaging_session') {
        const session = JSON.parse(payload.oauthSessionJson);
        PNOAuthService.saveSession(session);
        if (
          payload.kind === 'messaging_session' &&
          payload.dmSessionJson
        ) {
          try {
            const dm = JSON.parse(payload.dmSessionJson) as {
              mlKemSecretKey?: string;
              mlKemPublicKey?: string;
            };
            if (dm.mlKemSecretKey) {
              applyDmSessionHandoff({
                mlKemSecretKey: dm.mlKemSecretKey,
                mlKemPublicKey: dm.mlKemPublicKey,
              });
            }
          } catch {
            /* DM optional */
          }
        }
        setHasSession(true);
        setShowUnlock(false);
        onSessionRestored?.();
      }
    } catch (e: any) {
      setError(e?.message || 'Biometric unlock failed');
    } finally {
      setBusy(false);
    }
  }, [onSessionRestored]);

  const handleEnroll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const session = PNOAuthService.loadSession();
      if (!session) {
        setError('No session to save');
        return;
      }
      await enrollBrowserOauthVault(JSON.stringify(session));
      if (MESSAGING_ONLY && isDmIdentityReady()) {
        const dm = getDmIdentity();
        await updateMessagingVaultDmSession(
          JSON.stringify(session),
          dm?.mlKemSecretKey
            ? JSON.stringify({
                mlKemSecretKey: dm.mlKemSecretKey,
                mlKemPublicKey: dm.mlKemPublicKey,
              })
            : null
        );
      }
      localStorage.removeItem(DECLINED_KEY);
      setShowEnroll(false);
    } catch (e: any) {
      setError(e?.message || 'Could not enable device unlock');
    } finally {
      setBusy(false);
    }
  }, []);

  // Detect OAuth session appearing (after unlock popup)
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = !!PNOAuthService.loadSession();
      setHasSession(s);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  if (!Capacitor.isNativePlatform()) return null;

  return (
    <>
      <SessionVaultUnlockOverlay
        open={showUnlock && !hasSession}
        title={MESSAGING_ONLY ? 'Unlock messaging' : 'Unlock browse'}
        busy={busy}
        error={error}
        onUnlock={handleBiometricUnlock}
        onUseFullUnlock={() => {
          setShowUnlock(false);
          setError(null);
        }}
      />
      <SessionVaultEnrollPrompt
        open={showEnroll && hasSession}
        busy={busy}
        error={error}
        onConfirm={handleEnroll}
        onDecline={() => {
          localStorage.setItem(DECLINED_KEY, '1');
          setShowEnroll(false);
        }}
      />
    </>
  );
}

export async function wipeBrowserSessionVaultOnLogout(): Promise<void> {
  try {
    await clearBrowserSessionVault();
  } catch {
    /* ignore */
  }
}
