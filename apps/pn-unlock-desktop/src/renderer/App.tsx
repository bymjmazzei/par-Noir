import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConsentUnlockApp,
  SessionVaultEnrollPrompt,
  SessionVaultUnlockOverlay,
  searchFromUnlockUrl,
  type ConsentVaultEnrollMaterial,
  type ConsentVaultFactors,
} from '@par-noir/oauth-ui';
import type { UnlockKeysPayload } from '@par-noir/device-session-vault';
import type { UnlockDesktopApi } from '../preload/preload';
import {
  clearUnlockSessionVault,
  enrollUnlockSessionVault,
  hasUnlockSessionVault,
  isUnlockSessionVaultAvailable,
  unlockSessionVault,
} from './sessionVaultDesktop';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

const DECLINED_KEY = 'pn_vault_enroll_declined_unlock';

function desktopApi(): UnlockDesktopApi | null {
  return (window as Window & { pnUnlockDesktop?: UnlockDesktopApi }).pnUnlockDesktop ?? null;
}

/** Hosted branding (Electron file:// cannot reliably load asar-relative CSS backgrounds). */
const DESKTOP_BRANDING_BASE = 'https://browse.parnoir.com';

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

  const openExternal = async (url: string) => {
    const api = desktopApi();
    if (api) {
      await api.openExternal(url);
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
      setVaultError(e instanceof Error ? e.message : 'Device unlock failed');
    } finally {
      setVaultBusy(false);
    }
  };

  const onUnlockedForVault = useCallback(async (material: ConsentVaultEnrollMaterial) => {
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
      const payload: UnlockKeysPayload = {
        kind: 'unlock_keys',
        identityId: pendingEnroll.identityId,
        publicKey: pendingEnroll.publicKey,
        pnName: pendingEnroll.pnName,
        passcode: pendingEnroll.passcode,
        encryptedIdentityJson: pendingEnroll.encryptedIdentityJson,
      };
      await enrollUnlockSessionVault(payload);
      localStorage.removeItem(DECLINED_KEY);
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
    localStorage.setItem(DECLINED_KEY, '1');
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
        body="Confirm with this device to continue without re-entering your keys."
        unlockLabel="Unlock on this device"
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
        title="Save unlock on this computer?"
        body="Next time you can unlock without re-entering Key 1, Key 2, and your identity file. Only on this personal device."
        busy={vaultBusy}
        error={vaultError}
        onConfirm={() => void handleEnrollConfirm()}
        onDecline={handleEnrollDecline}
      />
      <ConsentUnlockApp
        search={search}
        apiEndpointDefault={API_DEFAULT.replace(/\/$/, '')}
        openExternal={openExternal}
        assetBase={DESKTOP_BRANDING_BASE}
        layout="broker"
        vaultFactors={vaultFactors}
        onVaultFactorsConsumed={() => setVaultFactors(null)}
        onUnlockedForVault={onUnlockedForVault}
      />
    </>
  );
}
