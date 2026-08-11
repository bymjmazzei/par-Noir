import React, { useCallback, useEffect, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  useCloudReconnectGate,
  ensureCloudCredentialsReady,
  publishCloudCredentialsVault
} from '@par-noir/oauth-ui';
import {
  clearCloudCredentialsOnLock,
  loadLocalCloudCredentials,
  persistCloudCredentials,
  publishCloudDriveReady,
  resolveCloudPersistMode,
  setSessionCloudCredentials,
  getSessionCloudCredentials,
  CLOUD_VAULT_MLKEM_SESSION_ID,
  CLOUD_VAULT_SEAL_SESSION_ID
} from '@par-noir/device-cloud-credentials';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from '../services/pnOAuthService';
import { fetchDeviceRegistry } from '../services/deviceService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  getDmIdentity,
  isDmIdentityReady,
  retryPublishMlKemPublicKey
} from '../services/dmIdentitySession';

/**
 * Post-unlock cloud reconnect for aggregator browse/messaging.
 * Prefer ML-KEM-sealed vault hydrate (dashboard-published) over Google reconnect.
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

  // Hydrate from cross-app sealed vault once ML-KEM (or identity factors) are available.
  useEffect(() => {
    let cancelled = false;
    const markHydratedIfGoogleReady = (env: StorageCredentialsEnvelope | null | undefined) => {
      if (envelopeHasUsableSecrets(env, 'google_drive')) {
        if (!cancelled) setVaultHydrated(true);
        return true;
      }
      return false;
    };
    void (async () => {
      if (!authToken || !pnIdentifier || !identityReady) {
        setVaultHydrated(false);
        return;
      }
      const identity = getDmIdentity();
      const mlKemSecretKey = identity.mlKemSecretKey || null;
      const pnName = identity.pnName || null;
      const passcode = identity.passcode || null;
      if (!mlKemSecretKey && !(pnName && passcode)) {
        setVaultHydrated(false);
        return;
      }
      if (markHydratedIfGoogleReady(getSessionCloudCredentials(pnIdentifier))) {
        return;
      }
      // Try local sealed (same origin) then API vault
      try {
        if (mlKemSecretKey) {
          const localMlKem = await loadLocalCloudCredentials({
            identityId: pnIdentifier,
            session: {
              sessionId: CLOUD_VAULT_MLKEM_SESSION_ID,
              pnName: 'mlkem',
              passcode: mlKemSecretKey
            }
          });
          if (localMlKem && envelopeHasUsableSecrets(localMlKem, 'google_drive')) {
            setSessionCloudCredentials(pnIdentifier, localMlKem);
            if (!cancelled) setVaultHydrated(true);
            return;
          }
        }
        if (pnName && passcode) {
          const local = await loadLocalCloudCredentials({
            identityId: pnIdentifier,
            session: {
              sessionId: CLOUD_VAULT_SEAL_SESSION_ID,
              pnName,
              passcode
            }
          });
          if (local && envelopeHasUsableSecrets(local, 'google_drive')) {
            setSessionCloudCredentials(pnIdentifier, local);
            if (!cancelled) setVaultHydrated(true);
            return;
          }
        }
      } catch {
        /* fall through to API vault */
      }
      const status = await ensureCloudCredentialsReady({
        apiEndpoint: API_ENDPOINT,
        authToken,
        pnIdentifier,
        mlKemSecretKey: mlKemSecretKey || undefined,
        pnName: pnName || undefined,
        passcode: passcode || undefined
      });
      if (cancelled) return;
      // Only ready when unsealed session has Google secrets — leave reconnect gate open otherwise.
      if (status === 'ready' && envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier), 'google_drive')) {
        setVaultHydrated(true);
      } else {
        setVaultHydrated(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, pnIdentifier, identityReady]);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier) return null;
    const fromSession = getSessionCloudCredentials(pnIdentifier);
    if (envelopeHasUsableSecrets(fromSession, 'google_drive')) return fromSession;
    if (!isDmIdentityReady()) return null;
    const identity = getDmIdentity();
    if (identity.mlKemSecretKey) {
      const mlkem = await loadLocalCloudCredentials({
        identityId: pnIdentifier,
        session: {
          sessionId: CLOUD_VAULT_MLKEM_SESSION_ID,
          pnName: 'mlkem',
          passcode: identity.mlKemSecretKey
        }
      });
      if (mlkem && envelopeHasUsableSecrets(mlkem, 'google_drive')) return mlkem;
    }
    if (!identity.pnName || !identity.passcode) return null;
    const identitySealed = await loadLocalCloudCredentials({
      identityId: pnIdentifier,
      session: {
        sessionId: CLOUD_VAULT_SEAL_SESSION_ID,
        pnName: identity.pnName,
        passcode: identity.passcode
      }
    });
    return envelopeHasUsableSecrets(identitySealed, 'google_drive') ? identitySealed : null;
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

  // When vault hydrate succeeds, mint access token then signal Drive-ready.
  useEffect(() => {
    if (!vaultHydrated || !authToken || !pnIdentifier) return;
    gate.markReady();
    void (async () => {
      const ok = await publishCloudDriveReady({
        authToken,
        pnIdentifier,
        apiEndpoint: API_ENDPOINT
      });
      if (ok) void retryPublishMlKemPublicKey();
      // A Drive token exists now, so the consent choice held from this unlock can
      // finally be written. Without this the user re-consents on every unlock.
      const { flushPendingGrant } = await import('../services/pendingGrantPersist');
      await flushPendingGrant({ authToken, pnIdentifier });
    })();
  }, [vaultHydrated, gate.markReady, authToken, pnIdentifier]);

  const handleConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier || !isDmIdentityReady()) return;
      const identity = getDmIdentity();
      setSessionCloudCredentials(pnIdentifier, envelope);
      if (identity.mlKemSecretKey) {
        const mode = resolveCloudPersistMode({ hasKeyedDevices });
        await persistCloudCredentials({
          identityId: pnIdentifier,
          credentials: envelope,
          session: {
            sessionId: CLOUD_VAULT_MLKEM_SESSION_ID,
            pnName: 'mlkem',
            passcode: identity.mlKemSecretKey
          },
          mode
        });
        if (authToken) {
          await publishCloudCredentialsVault({
            apiEndpoint: API_ENDPOINT,
            authToken,
            pnIdentifier,
            mlKemSecretKey: identity.mlKemSecretKey,
            ...(identity.pnName && identity.passcode
              ? { pnName: identity.pnName, passcode: identity.passcode }
              : {}),
            credentials: envelope
          }).catch(() => ({ ok: false }));
        }
      } else if (identity.pnName && identity.passcode) {
        const mode = resolveCloudPersistMode({ hasKeyedDevices });
        await persistCloudCredentials({
          identityId: pnIdentifier,
          credentials: envelope,
          session: {
            sessionId: CLOUD_VAULT_SEAL_SESSION_ID,
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
      }
      gate.markReady();
      setVaultHydrated(true);
      if (authToken) {
        await publishCloudDriveReady({
          authToken,
          pnIdentifier,
          apiEndpoint: API_ENDPOINT
        });
        // Manual reconnect also gets a Drive token; flush any held consent choice.
        const { flushPendingGrant } = await import('../services/pendingGrantPersist');
        await flushPendingGrant({ authToken, pnIdentifier });
      }
      void retryPublishMlKemPublicKey();
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
