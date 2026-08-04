import React, { useCallback, useEffect, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  useCloudReconnectGate
} from '@par-noir/oauth-ui';
import {
  clearCloudCredentialsOnLock,
  loadLocalCloudCredentials,
  persistCloudCredentials,
  resolveCloudPersistMode,
  setSessionCloudCredentials
} from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from '../services/pnOAuthService';
import { fetchDeviceRegistry } from '../services/deviceService';
import { getDmIdentity, isDmIdentityReady } from '../services/dmIdentitySession';

/**
 * Post-unlock cloud reconnect for aggregator browse/messaging.
 * Case A (no keyed devices): durable sealed local cloud.
 * Case B (keyed apps exist): session-only; wiped on lock.
 */
export const AggregatorCloudReconnectHost: React.FC = () => {
  const session = PNOAuthService.loadSession();
  const authToken = session?.accessToken ?? null;
  const pnIdentifier = session?.pnIdentifier ?? null;
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [hasKeyedDevices, setHasKeyedDevices] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!authToken || !pnIdentifier) {
        setHasKeyedDevices(false);
        return;
      }
      const reg = await fetchDeviceRegistry(pnIdentifier, authToken);
      if (!cancelled) {
        setHasKeyedDevices(Boolean(reg?.hasKeyedDevices || reg?.policy?.firstDeviceKeyedAt));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, pnIdentifier]);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier || !isDmIdentityReady()) return null;
    const identity = getDmIdentity();
    if (!identity.pnName || !identity.passcode) return null;
    return loadLocalCloudCredentials({
      identityId: pnIdentifier,
      session: {
        sessionId: `agg:${pnIdentifier}`,
        pnName: identity.pnName,
        passcode: identity.passcode
      }
    });
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
      if (!pnIdentifier || !isDmIdentityReady()) return;
      const identity = getDmIdentity();
      if (!identity.pnName || !identity.passcode) {
        setSessionCloudCredentials(pnIdentifier, envelope);
        gate.markReady();
        return;
      }
      const mode = resolveCloudPersistMode({ hasKeyedDevices });
      await persistCloudCredentials({
        identityId: pnIdentifier,
        credentials: envelope,
        session: {
          sessionId: `agg:${pnIdentifier}`,
          pnName: identity.pnName,
          passcode: identity.passcode
        },
        mode
      });
      gate.markReady();
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
    },
    [pnIdentifier, gate, hasKeyedDevices]
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
  pnIdentifier: string | null | undefined,
  opts?: { hasKeyedDevices?: boolean }
): Promise<void> {
  if (!pnIdentifier) return;
  const hasKeyedDevices = opts?.hasKeyedDevices ?? true;
  await clearCloudCredentialsOnLock({
    identityId: pnIdentifier,
    isKeyedSession: false,
    hasKeyedDevices
  });
}
