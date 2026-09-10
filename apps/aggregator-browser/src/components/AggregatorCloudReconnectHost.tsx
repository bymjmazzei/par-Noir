import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  useCloudReconnectGate,
  ensureCloudCredentialsReady,
  publishCloudCredentialsVault,
  flushPendingGrant
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
import { markCloudUnlockComplete, resetCloudUnlockCoordinator } from '../services/cloudUnlockCoordinator';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from '../services/pnOAuthService';
import { readCachedStorageAccounts } from '../services/storageApiClient';
import { isUnlockPrefetchComplete } from '../services/unlockSessionCoordinator';
import { fetchDeviceRegistry } from '../services/deviceService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  getDmIdentity,
  isDmIdentityReady,
  retryPublishMlKemPublicKey
} from '../services/dmIdentitySession';
import { CloudLayoutUpdateBanner } from './CloudLayoutUpdateBanner';

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
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const mintCompletedKeyRef = useRef<string | null>(null);
  const mintInFlightRef = useRef(false);

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

  const preferCachedAccounts = useCallback(() => {
    if (!pnIdentifier || !isUnlockPrefetchComplete(pnIdentifier)) return null;
    const cached = readCachedStorageAccounts(pnIdentifier);
    if (!cached) return null;
    // Force network when cache has no layout signal (avoids linkedInactive → unlinked).
    if ((cached.accounts?.length ?? 0) === 0 && !cached.socialCloudProvider) return null;
    return {
      accounts: cached.accounts,
      socialCloudProvider: cached.socialCloudProvider ?? null
    };
  }, [pnIdentifier]);

  const gateEnabled =
    !!(authToken && pnIdentifier && session && PNOAuthService.isSessionValid(session)) &&
    identityReady &&
    isUnlockPrefetchComplete(pnIdentifier);

  const gate = useCloudReconnectGate({
    enabled: gateEnabled,
    authToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined,
    preferCachedAccounts
  });

  const gateRef = useRef(gate);
  gateRef.current = gate;

  // Reset mint guard when identity changes.
  useEffect(() => {
    mintCompletedKeyRef.current = null;
    mintInFlightRef.current = false;
    setHydrateFailed(false);
  }, [authToken, pnIdentifier]);

  // Banner / messaging can request the reconnect panel when the prompt never mounted.
  useEffect(() => {
    const open = () => {
      gateRef.current.openPanel();
      void gateRef.current.refreshForced();
    };
    window.addEventListener('pn_open_cloud_reconnect', open);
    return () => window.removeEventListener('pn_open_cloud_reconnect', open);
  }, []);

  // When vault hydrate succeeds, mint access token then mark ready — once per unlock.
  useEffect(() => {
    if (!vaultHydrated || !authToken || !pnIdentifier) return;
    const mintKey = `${pnIdentifier}|${authToken.slice(0, 12)}`;
    if (mintCompletedKeyRef.current === mintKey || mintInFlightRef.current) return;
    mintInFlightRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        // Secrets are in session — reassess without forcing another accounts fetch.
        await gateRef.current.refresh();
        if (cancelled) return;
        const ok = await publishCloudDriveReady({
          authToken,
          pnIdentifier,
          apiEndpoint: API_ENDPOINT
        });
        if (cancelled) return;
        markCloudUnlockComplete(pnIdentifier, ok);
        if (ok) {
          mintCompletedKeyRef.current = mintKey;
          setHydrateFailed(false);
          gateRef.current.markReady();
          void retryPublishMlKemPublicKey();
          await flushPendingGrant({
            authToken,
            pnIdentifier,
            apiEndpoint: API_ENDPOINT
          });
        } else {
          console.warn(
            '[AggregatorCloudReconnectHost] Cloud AT mint failed after vault hydrate — opening reconnect'
          );
          setHydrateFailed(true);
          try {
            window.dispatchEvent(new CustomEvent('pn_cloud_at_mint_failed'));
          } catch {
            /* non-DOM */
          }
          gateRef.current.openPanel();
        }
      } finally {
        mintInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultHydrated, authToken, pnIdentifier]);

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
      setVaultHydrated(true);
      if (authToken) {
        await gateRef.current.refreshForced();
        const ok = await publishCloudDriveReady({
          authToken,
          pnIdentifier,
          apiEndpoint: API_ENDPOINT
        });
        markCloudUnlockComplete(pnIdentifier, ok);
        if (ok) {
          mintCompletedKeyRef.current = `${pnIdentifier}|${authToken.slice(0, 12)}`;
          setHydrateFailed(false);
          gateRef.current.markReady();
          void retryPublishMlKemPublicKey();
          await flushPendingGrant({
            authToken,
            pnIdentifier,
            apiEndpoint: API_ENDPOINT
          });
        } else {
          console.warn(
            '[AggregatorCloudReconnectHost] Cloud AT mint failed after reconnect — keeping panel open'
          );
          setHydrateFailed(true);
          try {
            window.dispatchEvent(new CustomEvent('pn_cloud_at_mint_failed'));
          } catch {
            /* non-DOM */
          }
          gateRef.current.openPanel();
        }
      }
    },
    [pnIdentifier, hasKeyedDevices, authToken]
  );

  if (!authToken || !pnIdentifier) return null;

  return (
    <>
      <div className="fixed bottom-4 left-0 right-0 z-40 px-0 pointer-events-none">
        <div className="pointer-events-auto max-w-lg mx-auto">
          <CloudLayoutUpdateBanner />
        </div>
      </div>
      <CloudReconnectPrompt
        open={hydrateFailed && !gate.panelOpen}
        socialCloudProvider={gate.socialCloudProvider}
        onReconnect={gate.openPanel}
        onDismiss={() => {
          setHydrateFailed(false);
          gate.dismissPrompt();
        }}
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
  resetCloudUnlockCoordinator(pnIdentifier ?? undefined);
  if (!pnIdentifier) return;
  const hasKeyedDevices = opts?.hasKeyedDevices ?? true;
  await clearCloudCredentialsOnLock({
    identityId: pnIdentifier,
    isKeyedSession: false,
    hasKeyedDevices
  });
}
