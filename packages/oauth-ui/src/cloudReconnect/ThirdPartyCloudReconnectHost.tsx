import React, { useCallback, useEffect, useState } from 'react';
import {
  clearCloudCredentialsOnLock,
  getSessionCloudCredentials,
  setSessionCloudCredentials
} from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { CloudReconnectPanel, PN_CLOUD_CREDENTIALS_READY_EVENT } from './CloudReconnectPanel';
import { CloudReconnectPrompt } from './CloudReconnectPrompt';
import { useCloudReconnectGate } from './useCloudReconnectGate';

export interface ThirdPartyCloudReconnectHostProps {
  apiEndpoint: string;
  authToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  googleClientId?: string | null;
}

/**
 * Post-OAuth cloud reconnect for prism / licensing / developer portals.
 */
export function ThirdPartyCloudReconnectHost({
  apiEndpoint,
  authToken,
  pnIdentifier,
  googleClientId: googleClientIdProp
}: ThirdPartyCloudReconnectHostProps) {
  const [googleClientId, setGoogleClientId] = useState<string | null>(googleClientIdProp ?? null);

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

  const handleConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier) return;
      setSessionCloudCredentials(pnIdentifier, envelope);
      gate.markReady();
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
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
