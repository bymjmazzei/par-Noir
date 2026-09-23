import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  ConsentUnlockApp,
  SessionVaultEnrollPrompt,
  SessionVaultUnlockOverlay,
  SessionVaultIdentityPicker,
  callerCapAppResumeUrl,
  postOAuthBrokerComplete,
  type ConsentVaultEnrollMaterial,
  type ConsentVaultFactors,
  type SessionVaultPickerOption,
} from '@par-noir/oauth-ui';
import type { UnlockKeysPayload } from '@par-noir/device-session-vault';
import { searchFromUnlockUrl, subscribeUnlockDeepLinks } from './deepLinks';
import { OpenExternalApp } from './openExternalApp';
import {
  enrollUnlockSessionVault,
  hasUnlockSessionVault,
  hasUnlockVaultIdentity,
  isUnlockSessionVaultAvailable,
  unlockIdentityLabel,
  unlockSessionVaultEntries,
} from './sessionVaultNative';

/** Bundled branding — same assets as desktop; avoids CDN CORP in the Cap WebView. */
import logoUrl from '../public/branding/Par-Noir-Logo-White.png';
import backgroundUrl from '../public/branding/Par-Noir-Background-Dark.png';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

function declinedKey(identityId: string): string {
  return `pn_vault_enroll_declined_unlock:${identityId}`;
}

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

function factorsFromEntry(entry: UnlockKeysPayload): ConsentVaultFactors | null {
  if (!entry.encryptedIdentityJson?.trim() || !entry.pnName?.trim() || !entry.passcode?.trim()) {
    return null;
  }
  return {
    pnName: entry.pnName,
    passcode: entry.passcode,
    encryptedIdentityJson: entry.encryptedIdentityJson,
  };
}

export default function App(): React.ReactElement {
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const [vaultChecked, setVaultChecked] = useState(false);
  const [showVaultUnlock, setShowVaultUnlock] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerOptions, setPickerOptions] = useState<SessionVaultPickerOption[]>([]);
  const [pendingEntries, setPendingEntries] = useState<UnlockKeysPayload[]>([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultFactors, setVaultFactors] = useState<ConsentVaultFactors | null>(null);
  const [pendingEnroll, setPendingEnroll] = useState<ConsentVaultEnrollMaterial | null>(null);
  const enrollWaiters = useRef<Array<() => void>>([]);
  const autoTouchIdForOffer = useRef(0);
  const vaultOfferGen = useRef(0);

  const resolveEnrollWaiters = useCallback(() => {
    const waiters = enrollWaiters.current;
    enrollWaiters.current = [];
    for (const w of waiters) w();
  }, []);

  const offerVaultUnlockIfNeeded = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return false;
    const available = await isUnlockSessionVaultAvailable();
    const has = available && (await hasUnlockSessionVault());
    if (!has) return false;
    vaultOfferGen.current += 1;
    setVaultFactors(null);
    setShowPicker(false);
    setPendingEntries([]);
    setPickerOptions([]);
    setVaultError(null);
    setShowVaultUnlock(true);
    return true;
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
        void offerVaultUnlockIfNeeded();
      }
    });
  }, [offerVaultUnlockIfNeeded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) {
        setVaultChecked(true);
        return;
      }
      await offerVaultUnlockIfNeeded();
      if (!cancelled) setVaultChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [offerVaultUnlockIfNeeded]);

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
    void Browser.close().catch(() => {
      /* none open */
    });
    const resume = resumeUrlFromSearch(search);
    if (!resume || !Capacitor.isNativePlatform()) return;
    window.setTimeout(() => {
      openCallerViaCustomScheme(resume);
    }, 200);
  }, [search]);

  const openExternal = async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
      return;
    }
    window.location.href = url;
  };

  const applyEntry = useCallback((entry: UnlockKeysPayload) => {
    const factors = factorsFromEntry(entry);
    if (!factors) {
      setVaultError('Saved unlock is incomplete — use full unlock once');
      setShowPicker(false);
      setShowVaultUnlock(false);
      setPendingEntries([]);
      return;
    }
    setVaultFactors(factors);
    setShowPicker(false);
    setShowVaultUnlock(false);
    setPendingEntries([]);
    setVaultError(null);
  }, []);

  const onVaultUnlock = useCallback(async () => {
    setVaultError(null);
    setVaultBusy(true);
    try {
      const entries = await unlockSessionVaultEntries();
      if (entries.length === 0) {
        setVaultError('No sealed unlock session');
        return;
      }
      if (entries.length === 1) {
        applyEntry(entries[0]);
        return;
      }
      setPendingEntries(entries);
      setPickerOptions(
        entries.map((e) => ({
          identityId: e.identityId,
          label: unlockIdentityLabel(e),
        }))
      );
      setShowVaultUnlock(false);
      setShowPicker(true);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Biometric unlock failed');
    } finally {
      setVaultBusy(false);
    }
  }, [applyEntry]);

  useEffect(() => {
    if (!showVaultUnlock || vaultFactors || showPicker || vaultBusy) return;
    const offer = vaultOfferGen.current;
    if (autoTouchIdForOffer.current === offer) return;
    autoTouchIdForOffer.current = offer;
    void onVaultUnlock();
  }, [showVaultUnlock, vaultFactors, showPicker, vaultBusy, onVaultUnlock]);

  const onPickIdentity = (identityId: string) => {
    const entry = pendingEntries.find((e) => e.identityId === identityId);
    if (!entry) {
      setVaultError('Selected identity not found');
      return;
    }
    applyEntry(entry);
  };

  const onUnlockedForVault = useCallback(async (material: ConsentVaultEnrollMaterial) => {
    if (!Capacitor.isNativePlatform()) return;
    if (!(await isUnlockSessionVaultAvailable())) return;
    if (await hasUnlockVaultIdentity(material.identityId)) return;
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(declinedKey(material.identityId)) === '1'
    ) {
      return;
    }
    setPendingEnroll(material);
    setShowEnroll(true);
    await new Promise<void>((resolve) => {
      enrollWaiters.current.push(resolve);
    });
  }, []);

  const handleEnrollConfirm = async () => {
    if (!pendingEnroll) {
      setShowEnroll(false);
      resolveEnrollWaiters();
      return;
    }
    setVaultBusy(true);
    setVaultError(null);
    try {
      const pnName = pendingEnroll.pnName?.trim() ?? '';
      const passcode = pendingEnroll.passcode?.trim() ?? '';
      const encryptedIdentityJson = pendingEnroll.encryptedIdentityJson?.trim() ?? '';
      if (!pnName || !passcode || !encryptedIdentityJson) {
        setVaultError('Vault enroll requires identity file, Key 1, and Key 2');
        return;
      }
      const payload: UnlockKeysPayload = {
        kind: 'unlock_keys',
        identityId: pendingEnroll.identityId,
        publicKey: pendingEnroll.publicKey,
        pnName,
        passcode,
        encryptedIdentityJson,
      };
      await enrollUnlockSessionVault(payload);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(declinedKey(pendingEnroll.identityId));
      }
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
    if (pendingEnroll && typeof localStorage !== 'undefined') {
      localStorage.setItem(declinedKey(pendingEnroll.identityId), '1');
    }
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
        open={showVaultUnlock && !vaultFactors && !showPicker}
        title="Unlock pN"
        body="Confirm with biometrics to continue with a saved pN."
        error={vaultError}
        busy={vaultBusy}
        onUnlock={() => void onVaultUnlock()}
        onUseFullUnlock={() => {
          setShowVaultUnlock(false);
          setVaultError(null);
        }}
      />
      <SessionVaultIdentityPicker
        open={showPicker && !vaultFactors}
        options={pickerOptions}
        busy={vaultBusy}
        error={vaultError}
        onSelect={onPickIdentity}
        onCancel={() => {
          setShowPicker(false);
          setPendingEntries([]);
          setPickerOptions([]);
          setVaultError(null);
        }}
      />
      <SessionVaultEnrollPrompt
        open={showEnroll}
        title="Save unlock on this device?"
        body="Next time use biometrics, then pick this pN — without re-entering Key 1, Key 2, and your identity file. Only on this personal device."
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
