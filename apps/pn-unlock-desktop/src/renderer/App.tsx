import React, { useCallback, useEffect, useState } from 'react';
import {
  ConsentUnlockApp,
  UnlockSessionVaultLayer,
  useUnlockSessionVault,
  searchFromUnlockUrl,
  postOAuthBrokerComplete,
  postBrokerLaunched,
  AGENT_VAULT_REQUIRED_MESSAGE,
  type AgentVaultEntry,
} from '@par-noir/oauth-ui';
import type { UnlockDesktopApi } from '../preload/preload';
import {
  enrollUnlockSessionVault,
  isUnlockSessionVaultAvailable,
  unlockVaultAdapter,
} from './sessionVaultDesktop';
import { startAgentBridge } from './agentBridge';

/** Bundled branding — never load from the network (Electron file:// + CDN CORP blocks HTTPS). */
import logoUrl from '../../../pn-unlock/public/branding/Par-Noir-Logo-White.png';
import backgroundUrl from '../../../pn-unlock/public/branding/Par-Noir-Background-Dark.png';

const API_DEFAULT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_ENDPOINT?: string } }).env?.VITE_API_ENDPOINT) ||
  'https://api.parnoir.com';

function desktopApi(): UnlockDesktopApi | null {
  return (window as Window & { pnUnlockDesktop?: UnlockDesktopApi }).pnUnlockDesktop ?? null;
}

export default function App(): React.ReactElement {
  const [search, setSearch] = useState(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const [vaultChecked, setVaultChecked] = useState(false);
  const vault = useUnlockSessionVault(unlockVaultAdapter);
  const { offerForSearch, refresh: refreshVault } = vault;

  const applyUrl = useCallback(
    (url: string) => {
      const s = searchFromUnlockUrl(url);
      if (s == null) return;
      const q = s.startsWith('?') ? s : `?${s.replace(/^\?/, '')}`;
      setSearch(q);
      try {
        window.history.replaceState({}, '', `/oauth/consent${q}`);
      } catch {
        /* ignore */
      }
      try {
        const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
        const state = params.get('state') || '';
        const clientId = params.get('client_id') || '';
        const apiBase = (params.get('api_endpoint') || API_DEFAULT).replace(/\/$/, '');
        if (state.length >= 8 && clientId) {
          void postBrokerLaunched(apiBase, { state, client_id: clientId }).catch(() => undefined);
        }
      } catch {
        /* claim is best-effort; auth still runs */
      }
      // Prefer-app reuses a running Unlock window — re-offer Touch ID vault each OAuth.
      void offerForSearch(q);
    },
    [offerForSearch]
  );

  const openShellReturn = useCallback(async (url: string) => {
    const api = desktopApi();
    if (api) {
      await api.openExternal(url);
      return;
    }
    window.location.assign(url);
  }, []);

  useEffect(() => startAgentBridge(API_DEFAULT.replace(/\/$/, '')), []);

  useEffect(() => {
    let cancelled = false;
    let unsub: () => void = () => undefined;
    void (async () => {
      for (let i = 0; i < 8 && !cancelled; i++) {
        if (desktopApi()) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled) return;
      const api = desktopApi();
      let appliedLaunch = false;
      if (api) {
        unsub = api.onDeepLink(applyUrl);
        try {
          const pending = await api.getPendingDeepLink();
          if (!cancelled && pending) {
            applyUrl(pending);
            appliedLaunch = true;
          }
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      if (!appliedLaunch) await offerForSearch(window.location.search);
      if (!cancelled) setVaultChecked(true);
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [applyUrl, offerForSearch]);

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

  const saveAgentIdentity = useCallback(
    async (entry: AgentVaultEntry) => {
      if (!(await isUnlockSessionVaultAvailable())) {
        throw new Error(AGENT_VAULT_REQUIRED_MESSAGE);
      }
      await enrollUnlockSessionVault({ kind: 'unlock_keys', ...entry });
      await refreshVault();
    },
    [refreshVault]
  );

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
        openShellReturn={openShellReturn}
        onBrokerHandoffComplete={onBrokerHandoffComplete}
        logoUrl={logoUrl}
        backgroundUrl={backgroundUrl}
        layout="broker"
        vaultFactors={vault.vaultFactors}
        onVaultFactorsConsumed={vault.onVaultFactorsConsumed}
        onUnlockedForVault={vault.onUnlockedForVault}
        saveAgentIdentity={saveAgentIdentity}
      />
    </>
  );
}
