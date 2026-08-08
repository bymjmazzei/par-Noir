import React, { useCallback, useEffect, useState } from 'react';
import {
  clearCloudCredentialsOnLock,
  getSessionCloudCredentials,
  setSessionCloudCredentials
} from '@par-noir/device-cloud-credentials';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { CloudReconnectPanel, PN_CLOUD_CREDENTIALS_READY_EVENT } from './CloudReconnectPanel';
import { CloudReconnectPrompt } from './CloudReconnectPrompt';
import { isOAuthCloudProvider, reconnectOAuthProvider } from './reconnectFlows';
import { useCloudReconnectGate } from './useCloudReconnectGate';
import { ensureCloudCredentialsReady } from './cloudVaultHydrate';

export interface ThirdPartyCloudReconnectHostProps {
  apiEndpoint: string;
  authToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  googleClientId?: string | null;
  /** Identity factors for vault hydrate (required for cross-app Drive without Google reconnect). */
  pnName?: string | null;
  passcode?: string | null;
}

/**
 * Post-OAuth cloud reconnect for prism / licensing / developer portals.
 * Hydrates from identity-sealed vault when pnName+passcode are available.
 */
export function ThirdPartyCloudReconnectHost({
  apiEndpoint,
  authToken,
  pnIdentifier,
  googleClientId: googleClientIdProp,
  pnName,
  passcode
}: ThirdPartyCloudReconnectHostProps) {
  const [googleClientId, setGoogleClientId] = useState<string | null>(googleClientIdProp ?? null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [vaultHydrated, setVaultHydrated] = useState(false);

  useEffect(() => {
    if (googleClientIdProp) {
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!authToken || !pnIdentifier || !pnName || !passcode) {
        setVaultHydrated(false);
        return;
      }
      if (envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier))) {
        if (!cancelled) setVaultHydrated(true);
        return;
      }
      const status = await ensureCloudCredentialsReady({
        apiEndpoint,
        authToken,
        pnIdentifier,
        pnName,
        passcode
      });
      if (!cancelled) setVaultHydrated(status === 'ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, authToken, pnIdentifier, pnName, passcode]);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier) return null;
    return getSessionCloudCredentials(pnIdentifier);
  }, [pnIdentifier]);

  const gate = useCloudReconnectGate({
    enabled: !!(authToken && pnIdentifier),
    authToken,
    pnIdentifier,
    apiEndpoint,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  useEffect(() => {
    if (vaultHydrated) {
      gate.markReady();
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
    }
  }, [vaultHydrated, gate.markReady]);

  const handleConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier) return;
      setSessionCloudCredentials(pnIdentifier, envelope);
      gate.markReady();
      setVaultHydrated(true);
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
    },
    [pnIdentifier, gate]
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

  if (!authToken || !pnIdentifier) return null;

  return (
    <>
      <CloudReconnectPrompt
        open={gate.promptOpen && !gate.panelOpen && !vaultHydrated}
        socialCloudProvider={gate.socialCloudProvider}
        onReconnect={handleReconnect}
        onDismiss={gate.dismissPrompt}
        busy={oauthBusy}
      >
        {oauthError ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: '#f87171' }} role="alert">
            {oauthError}
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
    </>
  );
}

export async function wipeThirdPartyCloudOnLock(pnIdentifier: string | null | undefined): Promise<void> {
  if (!pnIdentifier) return;
  await clearCloudCredentialsOnLock({ identityId: pnIdentifier, isKeyedSession: false });
}
