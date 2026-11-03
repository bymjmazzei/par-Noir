import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  ConsentUnlockApp,
  UnlockSessionVaultLayer,
  useUnlockSessionVault,
  callerCapAppResumeUrl,
  postOAuthBrokerComplete,
} from '@par-noir/oauth-ui';
import { readUnlockLaunchSearch, searchFromUnlockUrl, subscribeUnlockDeepLinks } from './deepLinks';
import { OpenExternalApp } from './openExternalApp';
import { unlockVaultAdapter } from './sessionVaultNative';

/** Bundled branding — same assets as desktop; avoids CDN CORP in the Cap WebView. */
import logoUrl from '../public/branding/Par-Noir-Logo-White.png';
import backgroundUrl from '../public/branding/Par-Noir-Background-Dark.png';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

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

export default function App(): React.ReactElement {
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const [vaultChecked, setVaultChecked] = useState(false);
  const vault = useUnlockSessionVault(unlockVaultAdapter);
  const { offerForSearch } = vault;

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
      void offerForSearch(applySearch(searchFromUnlockUrl(url)));
    });
  }, [applySearch, offerForSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) {
        setVaultChecked(true);
        return;
      }
      const launchSearch = applySearch(await readUnlockLaunchSearch());
      if (cancelled) return;
      await offerForSearch(launchSearch);
      if (!cancelled) setVaultChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySearch, offerForSearch]);

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

  if (!vaultChecked) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', display: 'grid', placeItems: 'center' }}>
        Loading…
      </div>
    );
  }

  return (
    <>
      <UnlockSessionVaultLayer vault={vault} />
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
        vaultFactors={vault.vaultFactors}
        onVaultFactorsConsumed={vault.onVaultFactorsConsumed}
        onUnlockedForVault={vault.onUnlockedForVault}
      />
    </>
  );
}
