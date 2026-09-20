import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { ConsentUnlockApp, SessionVaultEnrollPrompt, SessionVaultUnlockOverlay } from '@par-noir/oauth-ui';
import { searchFromUnlockUrl, subscribeUnlockDeepLinks } from './deepLinks';
import {
  clearUnlockSessionVault,
  hasUnlockSessionVault,
  isUnlockSessionVaultAvailable,
  unlockSessionVault,
} from './sessionVaultNative';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

export default function App(): React.ReactElement {
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const [vaultChecked, setVaultChecked] = useState(false);
  const [showVaultUnlock, setShowVaultUnlock] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

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
      setShowVaultUnlock(false);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Biometric unlock failed');
    } finally {
      setVaultBusy(false);
    }
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
        open={showVaultUnlock}
        error={vaultError}
        busy={vaultBusy}
        onUnlock={() => void onVaultUnlock()}
        onUseFullUnlock={() => {
          void clearUnlockSessionVault();
          setShowVaultUnlock(false);
        }}
      />
      <SessionVaultEnrollPrompt
        open={false}
        onConfirm={() => undefined}
        onDecline={() => undefined}
      />
      <ConsentUnlockApp
        search={search}
        apiEndpointDefault={API_DEFAULT.replace(/\/$/, '')}
        openExternal={openExternal}
      />
    </>
  );
}
