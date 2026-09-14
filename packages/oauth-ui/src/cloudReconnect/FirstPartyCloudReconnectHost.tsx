import React, { useCallback, useEffect, useRef, useState } from 'react';
import { publishCloudDriveReady } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { CloudReconnectPanel, PN_CLOUD_CREDENTIALS_READY_EVENT } from './CloudReconnectPanel';
import { CloudReconnectPrompt } from './CloudReconnectPrompt';
import { isOAuthCloudProvider, reconnectOAuthProvider } from './reconnectFlows';
import { useCloudReconnectGate } from './useCloudReconnectGate';
import type { CloudReconnectGateConfig } from './types';
import { flushPendingGrant } from '../pendingGrantPersist';

export interface FirstPartyCloudReconnectHostProps {
  apiEndpoint: string;
  authToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  googleClientId?: string | null;
  /** When false, host renders nothing (app owns unlock/migrate readiness). */
  enabled: boolean;
  loadLocalEnvelope: CloudReconnectGateConfig['loadLocalEnvelope'];
  preferCachedAccounts?: CloudReconnectGateConfig['preferCachedAccounts'];
  /**
   * `onVaultHydrated` — mint after app/host sets vaultHydrated (browse).
   * `onGateReady` — mint once gate reports ready without reconnect (dashboard warm).
   */
  mintStrategy?: 'onVaultHydrated' | 'onGateReady';
  /** Required when mintStrategy is onVaultHydrated. */
  vaultHydrated?: boolean;
  listenOpenEvent?: boolean;
  flushGrant?: boolean;
  persistConnected: (envelope: StorageCredentialsEnvelope) => Promise<void>;
  onAfterMintSuccess?: () => void | Promise<void>;
  banner?: React.ReactNode;
  promptChildren?: React.ReactNode;
  showPairDevice?: boolean;
  onPairDevice?: () => void;
  /** Extra UI mounted beside prompt/panel (e.g. device pair modal). */
  afterSlot?: React.ReactNode;
  /** Hide prompt while this is true (e.g. pair modal open). */
  suppressPrompt?: boolean;
  logTag?: string;
}

/**
 * Shared first-party cloud reconnect shell for dashboard + aggregator.
 * Apps supply hydrate/persist and optional slots (layout banner, device pair).
 */
export function FirstPartyCloudReconnectHost({
  apiEndpoint,
  authToken,
  pnIdentifier,
  googleClientId: googleClientIdProp,
  enabled,
  loadLocalEnvelope,
  preferCachedAccounts,
  mintStrategy = 'onVaultHydrated',
  vaultHydrated = false,
  listenOpenEvent = false,
  flushGrant = false,
  persistConnected,
  onAfterMintSuccess,
  banner,
  promptChildren,
  showPairDevice,
  onPairDevice,
  afterSlot,
  suppressPrompt = false,
  logTag = 'FirstPartyCloudReconnectHost'
}: FirstPartyCloudReconnectHostProps) {
  const [googleClientId, setGoogleClientId] = useState<string | null>(googleClientIdProp ?? null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const mintCompletedKeyRef = useRef<string | null>(null);
  const mintInFlightRef = useRef(false);
  const warmedReadyRef = useRef(false);

  useEffect(() => {
    if (googleClientIdProp !== undefined) {
      setGoogleClientId(googleClientIdProp);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiEndpoint.replace(/\/$/, '')}/api/public-config`);
        if (!res.ok) return;
        const data = (await res.json()) as { googleDriveClientId?: string };
        if (!cancelled) setGoogleClientId(data.googleDriveClientId ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, googleClientIdProp]);

  const gate = useCloudReconnectGate({
    enabled: enabled && !!(authToken && pnIdentifier),
    authToken,
    pnIdentifier,
    apiEndpoint,
    loadLocalEnvelope,
    preferCachedAccounts,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  const gateRef = useRef(gate);
  gateRef.current = gate;

  useEffect(() => {
    mintCompletedKeyRef.current = null;
    mintInFlightRef.current = false;
    warmedReadyRef.current = false;
    setHydrateFailed(false);
  }, [authToken, pnIdentifier]);

  useEffect(() => {
    if (!listenOpenEvent) return;
    const open = () => {
      gateRef.current.openPanel();
      void gateRef.current.refreshForced();
    };
    window.addEventListener('pn_open_cloud_reconnect', open);
    return () => window.removeEventListener('pn_open_cloud_reconnect', open);
  }, [listenOpenEvent]);

  // Dashboard migrate / Storage connect may publish secrets after the first gate check.
  useEffect(() => {
    if (!enabled || mintStrategy !== 'onGateReady') return;
    const onReady = () => {
      void gateRef.current.refresh();
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    return () => window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
  }, [enabled, mintStrategy]);

  const runMint = useCallback(async (): Promise<boolean> => {
    if (!authToken || !pnIdentifier) return false;
    const ok = await publishCloudDriveReady({
      authToken,
      pnIdentifier,
      apiEndpoint
    });
    if (ok) {
      mintCompletedKeyRef.current = `${pnIdentifier}|${authToken.slice(0, 12)}`;
      setHydrateFailed(false);
      gateRef.current.markReady();
      await onAfterMintSuccess?.();
      if (flushGrant) {
        await flushPendingGrant({ authToken, pnIdentifier, apiEndpoint });
      }
      return true;
    }
    console.warn(`[${logTag}] Cloud AT mint failed — opening reconnect`);
    setHydrateFailed(true);
    try {
      window.dispatchEvent(new CustomEvent('pn_cloud_at_mint_failed'));
    } catch {
      /* non-DOM */
    }
    gateRef.current.openPanel();
    return false;
  }, [authToken, pnIdentifier, apiEndpoint, flushGrant, onAfterMintSuccess, logTag]);

  // Browse path: mint after vault hydrate.
  useEffect(() => {
    if (mintStrategy !== 'onVaultHydrated') return;
    if (!vaultHydrated || !authToken || !pnIdentifier || !enabled) return;
    const mintKey = `${pnIdentifier}|${authToken.slice(0, 12)}`;
    if (mintCompletedKeyRef.current === mintKey || mintInFlightRef.current) return;
    mintInFlightRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await gateRef.current.refresh();
        if (cancelled) return;
        await runMint();
      } finally {
        mintInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mintStrategy, vaultHydrated, authToken, pnIdentifier, enabled, runMint]);

  // Dashboard warm path: mint once gate is ready.
  useEffect(() => {
    if (mintStrategy !== 'onGateReady') return;
    if (gate.readiness !== 'ready') {
      warmedReadyRef.current = false;
      return;
    }
    if (warmedReadyRef.current || !authToken || !pnIdentifier || !enabled) return;
    warmedReadyRef.current = true;
    void publishCloudDriveReady({
      authToken,
      pnIdentifier,
      apiEndpoint
    });
  }, [mintStrategy, gate.readiness, authToken, pnIdentifier, enabled, apiEndpoint]);

  const handleConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier || !authToken) return;
      setOauthError(null);
      await persistConnected(envelope);
      await gateRef.current.refreshForced();
      if (mintStrategy === 'onVaultHydrated') {
        await runMint();
      } else {
        gateRef.current.markReady();
        await publishCloudDriveReady({
          authToken,
          pnIdentifier,
          apiEndpoint
        });
        await onAfterMintSuccess?.();
      }
    },
    [
      pnIdentifier,
      authToken,
      persistConnected,
      mintStrategy,
      runMint,
      apiEndpoint,
      onAfterMintSuccess
    ]
  );

  const handleReconnect = useCallback(() => {
    const provider = gate.socialCloudProvider;
    if (isOAuthCloudProvider(provider) && authToken && pnIdentifier) {
      setOauthBusy(true);
      setOauthError(null);
      const pending = reconnectOAuthProvider({
        provider,
        pnIdentifier,
        authToken,
        apiEndpoint,
        googleClientId
      });
      void pending
        .then((envelope) => handleConnected(envelope))
        .catch((err) => {
          setOauthError(err instanceof Error ? err.message : 'Reconnect failed');
        })
        .finally(() => setOauthBusy(false));
      return;
    }
    gate.openPanel();
  }, [
    gate.socialCloudProvider,
    gate.openPanel,
    authToken,
    pnIdentifier,
    apiEndpoint,
    googleClientId,
    handleConnected
  ]);

  if (!enabled || !authToken || !pnIdentifier) return null;

  const promptOpen =
    mintStrategy === 'onVaultHydrated'
      ? hydrateFailed && !gate.panelOpen && !suppressPrompt
      : gate.promptOpen && !gate.panelOpen && !suppressPrompt;

  return (
    <>
      {banner}
      <CloudReconnectPrompt
        open={promptOpen}
        socialCloudProvider={gate.socialCloudProvider}
        onReconnect={handleReconnect}
        onDismiss={() => {
          setHydrateFailed(false);
          gate.dismissPrompt();
        }}
        showPairDevice={showPairDevice}
        onPairDevice={onPairDevice}
        busy={oauthBusy}
      >
        {promptChildren}
        {oauthError || gate.error ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: '#f87171' }} role="alert">
            {oauthError || gate.error}
          </p>
        ) : null}
      </CloudReconnectPrompt>
      <CloudReconnectPanel
        open={gate.panelOpen}
        onClose={gate.closePanel}
        pnIdentifier={pnIdentifier}
        authToken={authToken}
        apiEndpoint={apiEndpoint}
        googleClientId={googleClientId}
        preferredProvider={gate.socialCloudProvider}
        onConnected={handleConnected}
      />
      {afterSlot}
    </>
  );
}
