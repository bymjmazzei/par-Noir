import React, { useCallback, useEffect, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  useCloudReconnectGate,
  ensureCloudCredentialsReady,
  publishCloudCredentialsVault
} from '@par-noir/oauth-ui';
import {
  clearCloudCredentialsOnLock,
  loadLocalCloudCredentials,
  persistCloudCredentials,
  resolveCloudPersistMode,
  setSessionCloudCredentials,
  getSessionCloudCredentials
} from '@par-noir/device-cloud-credentials';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from '../services/pnOAuthService';
import { fetchDeviceRegistry } from '../services/deviceService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  getDmIdentity,
  isDmIdentityReady
} from '../services/dmIdentitySession';

/**
 * Post-unlock cloud reconnect for aggregator browse/messaging.
 * Prefer identity-sealed vault hydrate (dashboard-published) over Google reconnect.
 */
export const AggregatorCloudReconnectHost: React.FC = () => {
  const session = PNOAuthService.loadSession();
  const authToken = session?.accessToken ?? null;
  const pnIdentifier = session?.pnIdentifier ?? null;
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [hasKeyedDevices, setHasKeyedDevices] = useState(false);
  const [identityReady, setIdentityReady] = useState(() => isDmIdentityReady());
  const [vaultHydrated, setVaultHydrated] = useState(false);

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

  useEffect(() => {
    const sync = () => setIdentityReady(isDmIdentityReady());
    sync();
    window.addEventListener(DM_IDENTITY_CHANGE_EVENT, sync);
    return () => window.removeEventListener(DM_IDENTITY_CHANGE_EVENT, sync);
  }, []);

  // Hydrate from cross-app sealed vault once identity factors are available.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!authToken || !pnIdentifier || !identityReady) {
        setVaultHydrated(false);
        return;
      }
      const identity = getDmIdentity();
      if (!identity.pnName || !identity.passcode) {
        setVaultHydrated(false);
        return;
      }
      if (envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier))) {
        if (!cancelled) setVaultHydrated(true);
        return;
      }
      // Try local sealed (same origin) then API vault
      try {
        const local = await loadLocalCloudCredentials({
          identityId: pnIdentifier,
          session: {
            sessionId: 'pn-cloud-creds-v1',
            pnName: identity.pnName,
            passcode: identity.passcode
          }
        });
        if (local && envelopeHasUsableSecrets(local)) {
          setSessionCloudCredentials(pnIdentifier, local);
          if (!cancelled) setVaultHydrated(true);
          return;
        }
      } catch {
        /* fall through to API vault */
      }
      const status = await ensureCloudCredentialsReady({
        apiEndpoint: API_ENDPOINT,
        authToken,
        pnIdentifier,
        pnName: identity.pnName,
        passcode: identity.passcode
      });
      if (!cancelled) setVaultHydrated(status === 'ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, pnIdentifier, identityReady]);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier) return null;
    const fromSession = getSessionCloudCredentials(pnIdentifier);
    if (envelopeHasUsableSecrets(fromSession)) return fromSession;
    if (!isDmIdentityReady()) return null;
    const identity = getDmIdentity();
    if (!identity.pnName || !identity.passcode) return null;
    return loadLocalCloudCredentials({
      identityId: pnIdentifier,
      session: {
        sessionId: 'pn-cloud-creds-v1',
        pnName: identity.pnName,
        passcode: identity.passcode
      }
    });
  }, [pnIdentifier]);

  const gateEnabled =
    !!(authToken && pnIdentifier && session && PNOAuthService.isSessionValid(session)) &&
    identityReady;

  const gate = useCloudReconnectGate({
    enabled: gateEnabled,
    authToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  // When vault hydrate succeeds, mark gate ready (no reconnect prompt).
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
          sessionId: 'pn-cloud-creds-v1',
          pnName: identity.pnName,
          passcode: identity.passcode
        },
        mode
      });
      if (authToken) {
        await publishCloudCredentialsVault({
          apiEndpoint: API_ENDPOINT,
          authToken,
          pnIdentifier,
          pnName: identity.pnName,
          passcode: identity.passcode,
          credentials: envelope
        }).catch(() => ({ ok: false }));
      }
      gate.markReady();
      setVaultHydrated(true);
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
    },
    [pnIdentifier, gate, hasKeyedDevices, authToken]
  );

  if (!authToken || !pnIdentifier) return null;

  return (
    <>
      <CloudReconnectPrompt
        open={gate.promptOpen && !gate.panelOpen && !vaultHydrated}
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
