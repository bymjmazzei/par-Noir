import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConsentUnlockApp,
  SessionVaultEnrollPrompt,
  SessionVaultUnlockOverlay,
  SessionVaultIdentityPicker,
  searchFromUnlockUrl,
  postOAuthBrokerComplete,
  type ConsentVaultEnrollMaterial,
  type ConsentVaultFactors,
  type SessionVaultPickerOption,
} from '@par-noir/oauth-ui';
import type { UnlockKeysPayload } from '@par-noir/device-session-vault';
import type { UnlockDesktopApi } from '../preload/preload';
import {
  enrollUnlockSessionVault,
  hasUnlockSessionVault,
  hasUnlockVaultIdentity,
  isUnlockSessionVaultAvailable,
  unlockIdentityLabel,
  unlockSessionVaultEntries,
} from './sessionVaultDesktop';

/** Bundled branding — never load from the network (Electron file:// + CDN CORP blocks HTTPS). */
import logoUrl from '../../../pn-unlock/public/branding/Par-Noir-Logo-White.png';
import backgroundUrl from '../../../pn-unlock/public/branding/Par-Noir-Background-Dark.png';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

function declinedKey(identityId: string): string {
  return `pn_vault_enroll_declined_unlock:${identityId}`;
}

function desktopApi(): UnlockDesktopApi | null {
  return (window as Window & { pnUnlockDesktop?: UnlockDesktopApi }).pnUnlockDesktop ?? null;
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

  const applyUrl = useCallback((url: string) => {
    const s = searchFromUnlockUrl(url);
    if (s == null) return;
    const q = s.startsWith('?') ? s : `?${s.replace(/^\?/, '')}`;
    setSearch(q);
    try {
      window.history.replaceState({}, '', `/oauth/consent${q}`);
    } catch {
      /* ignore */
    }
  }, []);

  const resolveEnrollWaiters = useCallback(() => {
    const waiters = enrollWaiters.current;
    enrollWaiters.current = [];
    for (const w of waiters) w();
  }, []);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    let cancelled = false;
    void (async () => {
      try {
        const pending = await api.getPendingDeepLink();
        if (!cancelled && pending) applyUrl(pending);
      } catch {
        /* ignore */
      }
    })();
    const unsub = api.onDeepLink(applyUrl);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [applyUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await isUnlockSessionVaultAvailable();
      const has = available && (await hasUnlockSessionVault());
      if (!cancelled && has) setShowVaultUnlock(true);
      if (!cancelled) setVaultChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const api = desktopApi();
    if (!api) return;
    window.setTimeout(() => {
      void api.yieldToBrowser();
    }, 350);
  }, []);

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

  const onVaultUnlock = async () => {
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
      setVaultError(e instanceof Error ? e.message : 'Device unlock failed');
    } finally {
      setVaultBusy(false);
    }
  };

  const onPickIdentity = (identityId: string) => {
    const entry = pendingEntries.find((e) => e.identityId === identityId);
    if (!entry) {
      setVaultError('Selected identity not found');
      return;
    }
    applyEntry(entry);
  };

  const onUnlockedForVault = useCallback(async (material: ConsentVaultEnrollMaterial) => {
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
      localStorage.removeItem(declinedKey(pendingEnroll.identityId));
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
    if (pendingEnroll) {
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
        body="Use Touch ID, then choose which saved pN to continue with."
        unlockLabel="Unlock with Touch ID"
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
        title="Save unlock on this computer?"
        body="Next time use Touch ID, then pick this pN — without re-entering Key 1, Key 2, and your identity file. Only on this personal Mac."
        confirmLabel="Enable with Touch ID"
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
