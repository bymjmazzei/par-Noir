import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  ConsentUnlockApp,
  SessionVaultEnrollPrompt,
  SessionVaultUnlockOverlay,
  SessionVaultIdentityPicker,
  callerCapAppResumeUrl,
  consentSearchUsesSavedPn,
  postOAuthBrokerComplete,
  type ConsentVaultEnrollMaterial,
  type ConsentVaultFactors,
  type SessionVaultPickerOption,
} from '@par-noir/oauth-ui';
import type { UnlockKeysPayload } from '@par-noir/device-session-vault';
import { readUnlockLaunchSearch, searchFromUnlockUrl, subscribeUnlockDeepLinks } from './deepLinks';
import { OpenExternalApp } from './openExternalApp';
import {
  enrollUnlockSessionVault,
  hasUnlockSessionVault,
  hasUnlockVaultIdentity,
  isUnlockSessionVaultAvailable,
  unlockIdentityLabel,
  unlockSessionVaultEntries,
  removeUnlockVaultIdentity,
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
  if (!entry.encryptedIdentityJson?.trim() || !entry.key1?.trim() || !entry.key2?.trim()) {
    return null;
  }
  return {
    key1: entry.key1,
    key2: entry.key2,
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
  const [managingVault, setManagingVault] = useState(false);
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

  const dismissVaultOffer = useCallback(() => {
    vaultOfferGen.current += 1;
    setManagingVault(false);
    setVaultFactors(null);
    setShowVaultUnlock(false);
    setShowPicker(false);
    setPendingEntries([]);
    setPickerOptions([]);
    setVaultError(null);
  }, []);

  /** Saved-pN biometric offer for the request in `search`; create requests never get one. */
  const offerVaultUnlockIfNeeded = useCallback(async (search: string) => {
    if (!Capacitor.isNativePlatform()) return false;
    if (!consentSearchUsesSavedPn(search)) {
      dismissVaultOffer();
      return false;
    }
    const offer = ++vaultOfferGen.current;
    const available = await isUnlockSessionVaultAvailable();
    const has = available && (await hasUnlockSessionVault());
    if (!has || offer !== vaultOfferGen.current) return false;
    setVaultFactors(null);
    setShowPicker(false);
    setPendingEntries([]);
    setPickerOptions([]);
    setVaultError(null);
    setShowVaultUnlock(true);
    return true;
  }, [dismissVaultOffer]);

  /** Returns the applied search, or the current location search when `raw` is null. */
  const applySearch = useCallback((raw: string | null): string => {
    if (raw == null) return window.location.search;
    const q = raw.startsWith('?') ? raw : `?${raw.replace(/^\?/, '')}`;
    setSearch(q);
    try {
      window.history.replaceState({}, '', `/oauth/consent${q}`);
    } catch {
      /* ignore */
    }
    return q;
  }, []);

  useEffect(() => {
    return subscribeUnlockDeepLinks((url) => {
      void offerVaultUnlockIfNeeded(applySearch(searchFromUnlockUrl(url)));
    });
  }, [applySearch, offerVaultUnlockIfNeeded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) {
        setVaultChecked(true);
        return;
      }
      const launchSearch = applySearch(await readUnlockLaunchSearch());
      if (cancelled) return;
      await offerVaultUnlockIfNeeded(launchSearch);
      if (!cancelled) setVaultChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySearch, offerVaultUnlockIfNeeded]);

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

  const openShellReturn = async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      await OpenExternalApp.open({ url });
      return;
    }
    window.location.assign(url);
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

  const showSavedPns = useCallback((entries: UnlockKeysPayload[]) => {
    setPendingEntries(entries);
    setPickerOptions(entries.map((e) => ({ identityId: e.identityId, label: unlockIdentityLabel(e) })));
    setShowVaultUnlock(false);
    setShowPicker(true);
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
      setManagingVault(false);
      showSavedPns(entries);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Biometric unlock failed');
    } finally {
      setVaultBusy(false);
    }
  }, [applyEntry, showSavedPns]);

  const onManageVault = useCallback(async () => {
    setVaultError(null);
    setVaultBusy(true);
    try {
      const entries = await unlockSessionVaultEntries();
      if (entries.length === 0) {
        setVaultError('No saved pNs on this device');
        return;
      }
      setManagingVault(true);
      showSavedPns(entries);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Biometric unlock failed');
    } finally {
      setVaultBusy(false);
    }
  }, [showSavedPns]);

  const onRemoveIdentity = useCallback(
    async (identityId: string) => {
      setVaultError(null);
      setVaultBusy(true);
      try {
        await removeUnlockVaultIdentity(identityId);
        const remaining = pendingEntries.filter((e) => e.identityId !== identityId);
        if (remaining.length === 0) {
          dismissVaultOffer();
          return;
        }
        showSavedPns(remaining);
      } catch (e) {
        setVaultError(e instanceof Error ? e.message : 'Could not remove this pN');
      } finally {
        setVaultBusy(false);
      }
    },
    [pendingEntries, dismissVaultOffer, showSavedPns]
  );

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
      const key1 = pendingEnroll.key1?.trim() ?? '';
      const key2 = pendingEnroll.key2?.trim() ?? '';
      const encryptedIdentityJson = pendingEnroll.encryptedIdentityJson?.trim() ?? '';
      if (!key1 || !key2 || !encryptedIdentityJson) {
        setVaultError('Vault enroll requires identity file, Key 1, and Key 2');
        return;
      }
      const payload: UnlockKeysPayload = {
        kind: 'unlock_keys',
        identityId: pendingEnroll.identityId,
        publicKey: pendingEnroll.publicKey,
        key1,
        key2,
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
        onManage={() => void onManageVault()}
      />
      <SessionVaultIdentityPicker
        open={showPicker && !vaultFactors}
        title={managingVault ? 'Saved pNs' : undefined}
        body={managingVault ? 'Remove pNs you no longer use on this device. Their files and keys elsewhere are not touched.' : undefined}
        options={pickerOptions}
        busy={vaultBusy}
        error={vaultError}
        onSelect={managingVault ? () => undefined : onPickIdentity}
        onRemove={onRemoveIdentity}
        cancelLabel={managingVault ? 'Done' : undefined}
        onCancel={() => {
          setShowPicker(false);
          setPendingEntries([]);
          setPickerOptions([]);
          setVaultError(null);
          if (managingVault) {
            setManagingVault(false);
            setShowVaultUnlock(true);
          }
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
        openShellReturn={openShellReturn}
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
