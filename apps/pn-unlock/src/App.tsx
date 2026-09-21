import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  ConsentUnlockApp,
  SessionVaultEnrollPrompt,
  SessionVaultUnlockOverlay,
  callerCapAppResumeUrl,
  postOAuthBrokerComplete,
  type ConsentVaultEnrollMaterial,
  type ConsentVaultFactors,
} from '@par-noir/oauth-ui';
import type { UnlockKeysPayload } from '@par-noir/device-session-vault';
import { searchFromUnlockUrl, subscribeUnlockDeepLinks } from './deepLinks';
import { OpenExternalApp } from './openExternalApp';
import {
  clearUnlockSessionVault,
  enrollUnlockSessionVault,
  hasUnlockSessionVault,
  isUnlockSessionVaultAvailable,
  unlockSessionVault,
} from './sessionVaultNative';

/** Bundled branding — same assets as desktop; avoids CDN CORP in the Cap WebView. */
import logoUrl from '../public/branding/Par-Noir-Logo-White.png';
import backgroundUrl from '../public/branding/Par-Noir-Background-Dark.png';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

const DECLINED_KEY = 'pn_vault_enroll_declined_unlock';

function resumeUrlFromSearch(search: string): string | null {
  try {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return callerCapAppResumeUrl({
      clientId: q.get('client_id'),
      redirectUri: q.get('redirect_uri'),
    });
  } catch {
    return null;
  }
}

/**
 * Cap `@capacitor/app` has no `openUrl` on iOS. Prefer-app opened Unlock via custom
 * scheme; return with native UIApplication.open (+ `<a>` fallback).
 */
function openCallerViaCustomScheme(resumeUrl: string): void {
  void OpenExternalApp.open({ url: resumeUrl }).catch(() => {
    try {
      const a = document.createElement('a');
      a.href = resumeUrl;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* ignore */
    }
  });
}

export default function App(): React.ReactElement {
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const [vaultChecked, setVaultChecked] = useState(false);
  const [showVaultUnlock, setShowVaultUnlock] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultFactors, setVaultFactors] = useState<ConsentVaultFactors | null>(null);
  const [pendingEnroll, setPendingEnroll] = useState<ConsentVaultEnrollMaterial | null>(null);
  const enrollWaiters = useRef<Array<() => void>>([]);

  const resolveEnrollWaiters = useCallback(() => {
    const waiters = enrollWaiters.current;
    enrollWaiters.current = [];
    for (const w of waiters) w();
  }, []);

  useEffect(() => {
    return subscribeUnlockDeepLinks((url) => {
      const s = searchFromUnlockUrl(url);
      if (s != null) {
        const q = s.startsWith('?') ? s : `?${s.replace(/^\?/, '')}`;
        setSearch(q);
        try {
          window.history.replaceState({}, '', `/oauth/consent${q}`);
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) {
        setVaultChecked(true);
        return;
      }
      const available = await isUnlockSessionVaultAvailable();
      const has = available && (await hasUnlockSessionVault());
      if (!cancelled && has) setShowVaultUnlock(true);
      if (!cancelled) setVaultChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Prefer-app handoff for Cap / native: same API broker as desktop.
   * Do not Browser.open(oauth-callback) — that is a separate SFSafariViewController
   * and never reaches the Safari/Chrome tab that is polling broker-pending.
   */
  const deliverLocalBroker = async (payload: Record<string, unknown>) => {
    let apiBase = API_DEFAULT.replace(/\/$/, '');
    try {
      const q = search.startsWith('?') ? search.slice(1) : search;
      const fromQ = new URLSearchParams(q).get('api_endpoint')?.replace(/\/$/, '');
      if (fromQ) apiBase = fromQ;
    } catch {
      /* keep default */
    }
    await postOAuthBrokerComplete(apiBase, payload);
  };

  const onBrokerHandoffComplete = useCallback(() => {
    // Prefer-app opens Unlock via custom scheme — Cap Browser was never opened, so
    // Browser.close is a no-op. Cap App also has no openUrl on iOS — navigate via
    // the caller's custom scheme so OS brings Messages/Browse forward to poll.
    void Browser.close().catch(() => {
      /* none open */
    });
    const resume = resumeUrlFromSearch(search);
    if (!resume || !Capacitor.isNativePlatform()) return;
    window.setTimeout(() => {
      openCallerViaCustomScheme(resume);
    }, 200);
  }, [search]);

  /**
   * Deny / non-broker fallback only — success path uses deliverLocalBroker.
   */
  const openExternal = async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
      return;
    }
    window.location.href = url;
  };

  const onVaultUnlock = async () => {
    setVaultError(null);
    setVaultBusy(true);
    try {
      const payload = await unlockSessionVault();
      if (!payload || payload.kind !== 'unlock_keys') {
        setVaultError('No sealed unlock session');
        return;
      }
      if (!payload.encryptedIdentityJson) {
        setVaultError('Saved unlock is incomplete — use full unlock once');
        await clearUnlockSessionVault();
        setShowVaultUnlock(false);
        return;
      }
      setVaultFactors({
        pnName: payload.pnName,
        passcode: payload.passcode,
        encryptedIdentityJson: payload.encryptedIdentityJson,
      });
      setShowVaultUnlock(false);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Biometric unlock failed');
    } finally {
      setVaultBusy(false);
    }
  };

  const onUnlockedForVault = useCallback(
    async (material: ConsentVaultEnrollMaterial) => {
      if (!Capacitor.isNativePlatform()) return;
      if (!(await isUnlockSessionVaultAvailable())) return;
      if (await hasUnlockSessionVault()) return;
      if (typeof localStorage !== 'undefined' && localStorage.getItem(DECLINED_KEY) === '1') {
        return;
      }
      setPendingEnroll(material);
      setShowEnroll(true);
      await new Promise<void>((resolve) => {
        enrollWaiters.current.push(resolve);
      });
    },
    []
  );

  const handleEnrollConfirm = async () => {
    if (!pendingEnroll) {
      setShowEnroll(false);
      resolveEnrollWaiters();
      return;
    }
    setVaultBusy(true);
    setVaultError(null);
    try {
      const payload: UnlockKeysPayload = {
        kind: 'unlock_keys',
        identityId: pendingEnroll.identityId,
        publicKey: pendingEnroll.publicKey,
        pnName: pendingEnroll.pnName,
        passcode: pendingEnroll.passcode,
        encryptedIdentityJson: pendingEnroll.encryptedIdentityJson,
      };
      await enrollUnlockSessionVault(payload);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(DECLINED_KEY);
      setPendingEnroll(null);
      setShowEnroll(false);
      resolveEnrollWaiters();
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Could not enable device unlock');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleEnrollDecline = () => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DECLINED_KEY, '1');
    setPendingEnroll(null);
    setShowEnroll(false);
    setVaultError(null);
    resolveEnrollWaiters();
  };

  if (!vaultChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'grid', placeItems: 'center' }}>
        Loading…
      </div>
    );
  }

  return (
    <>
      <SessionVaultUnlockOverlay
        open={showVaultUnlock && !vaultFactors}
        title="Unlock pN"
        error={vaultError}
        busy={vaultBusy}
        onUnlock={() => void onVaultUnlock()}
        onUseFullUnlock={() => {
          void clearUnlockSessionVault();
          setShowVaultUnlock(false);
          setVaultError(null);
        }}
      />
      <SessionVaultEnrollPrompt
        open={showEnroll}
        title="Save unlock on this device?"
        body="Next time you can unlock with biometrics instead of re-entering Key 1, Key 2, and your identity file. Only on this personal device."
        busy={vaultBusy}
        error={vaultError}
        onConfirm={() => void handleEnrollConfirm()}
        onDecline={handleEnrollDecline}
      />
      <ConsentUnlockApp
        search={search}
        apiEndpointDefault={API_DEFAULT.replace(/\/$/, '')}
        deliverLocalBroker={deliverLocalBroker}
        onBrokerHandoffComplete={onBrokerHandoffComplete}
        openExternal={openExternal}
        logoUrl={logoUrl}
        backgroundUrl={backgroundUrl}
        layout="broker"
        vaultFactors={vaultFactors}
        onVaultFactorsConsumed={() => setVaultFactors(null)}
        onUnlockedForVault={onUnlockedForVault}
      />
    </>
  );
}
