import React, { useCallback, useEffect, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  useCloudReconnectGate
} from '@par-noir/oauth-ui';
import {
  clearCloudCredentialsOnLock,
  getSessionCloudCredentials,
  setSessionCloudCredentials
} from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from '../services/pnOAuthService';

/**
 * Post-unlock cloud reconnect for aggregator browse/messaging.
 * Credentials stay in session memory for this origin and are wiped on lock.
 */
export const AggregatorCloudReconnectHost: React.FC = () => {
  const session = PNOAuthService.loadSession();
  const authToken = session?.accessToken ?? null;
  const pnIdentifier = session?.pnIdentifier ?? null;
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_ENDPOINT.replace(/\/$/, '')}/api/public-config`);
        if (!res.ok) return;
        const data = (await res.json()) as { googleDriveClientId?: string };
        if (!cancelled) setGoogleClientId(data.googleDriveClientId ?? null);
      } catch {
        if (!cancelled) setGoogleClientId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier) return null;
    return getSessionCloudCredentials(pnIdentifier);
  }, [pnIdentifier]);

  const gate = useCloudReconnectGate({
    enabled: !!(authToken && pnIdentifier && session && PNOAuthService.isSessionValid(session)),
    authToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  const handleConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier) return;
      setSessionCloudCredentials(pnIdentifier, envelope);
      gate.markReady();
    },
    [pnIdentifier, gate]
  );

  if (!authToken || !pnIdentifier) return null;

  return (
    <>
      <CloudReconnectPrompt
        open={gate.promptOpen && !gate.panelOpen}
        socialCloudProvider={gate.socialCloudProvider}
        onReconnect={gate.openPanel}
        onDismiss={gate.dismissPrompt}
      />
      <CloudReconnectPanel
        open={gate.panelOpen}
        onClose={gate.closePanel}
        pnIdentifier={pnIdentifier}
        authToken={authToken}
        apiEndpoint={API_ENDPOINT}
        googleClientId={googleClientId}
        preferredProvider={gate.socialCloudProvider}
        onConnected={handleConnected}
      />
    </>
  );
};

/** Call from lock path to wipe session cloud credentials. */
export async function wipeAggregatorCloudOnLock(
  pnIdentifier: string | null | undefined
): Promise<void> {
  if (!pnIdentifier) return;
  await clearCloudCredentialsOnLock({ identityId: pnIdentifier, isKeyedSession: false });
}
