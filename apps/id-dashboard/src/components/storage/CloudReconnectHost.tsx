import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  loadLocalCloudCredentials,
  persistCloudCredentials,
  publishCloudDriveReady,
  resolveCloudPersistMode,
  getSessionCloudCredentials,
  setSessionCloudCredentials,
  type PersistCloudCredentialsMode
} from '@par-noir/device-cloud-credentials';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  isOAuthCloudProvider,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  reconnectOAuthProvider,
  useCloudReconnectGate,
  ensureCloudCredentialsReady,
  publishCloudCredentialsVault
} from '@par-noir/oauth-ui';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../../config/api';
import { getGoogleDriveClientId } from '../../config/googleDriveClientId';
import { DevicePairFromReconnect } from '../DevicePairFromReconnect';
import { isKeyableClient } from '@par-noir/device-client';
import { APP_DOWNLOAD_URL } from '../../config/appDownload';

export interface CloudReconnectHostProps {
  apiToken: string | null;
  pnIdentifier: string | null;
  sessionId: string | null;
  isKeyedSession: boolean;
  /** True when this pN already has at least one keyed device registered */
  hasKeyedDevices?: boolean;
  onPaired?: () => void | Promise<void>;
}

/**
 * Post-unlock cloud reconnect — same shape as AggregatorCloudReconnectHost.
 * Case A (no keyed devices): durable sealed local cloud.
 * Case B (keyed apps exist): session-only; wiped on lock.
 * No unlock-time bootstrap / initialize / owner-index gate.
 */
export const CloudReconnectHost: React.FC<CloudReconnectHostProps> = ({
  apiToken,
  pnIdentifier,
  sessionId,
  isKeyedSession,
  hasKeyedDevices = false,
  onPaired
}) => {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [migrateSettled, setMigrateSettled] = useState(false);
  const warmedReadyRef = useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await getGoogleDriveClientId();
        if (!cancelled) setGoogleClientId(id || null);
      } catch {
        if (!cancelled) setGoogleClientId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Wait for unlock migrate; hydrate from vault; publish vault if local secrets exist.
  React.useEffect(() => {
    if (!pnIdentifier || !sessionId || !apiToken) {
      setMigrateSettled(false);
      return;
    }
    let cancelled = false;
    setMigrateSettled(false);
    void (async () => {
      const { awaitMigrateFlushForIdentity } = await import('../../services/deviceCloudCredentials');
      let warmed: StorageCredentialsEnvelope | null = null;
      for (let i = 0; i < 25 && !cancelled; i++) {
        await awaitMigrateFlushForIdentity(pnIdentifier);
        const creds = SecureCredentialManager.getCredentials(sessionId);
        if (creds) {
          const env =
            (await loadLocalCloudCredentials({
              identityId: pnIdentifier,
              session: {
                sessionId: 'pn-cloud-creds-v1',
                pnName: creds.pnName,
                passcode: creds.passcode
              }
            })) ||
            (await loadLocalCloudCredentials({
              identityId: pnIdentifier,
              session: {
                sessionId,
                pnName: creds.pnName,
                passcode: creds.passcode
              }
            }));
          if (env && envelopeHasUsableSecrets(env)) {
            warmed = env;
            setSessionCloudCredentials(pnIdentifier, env);
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) {
        try {
          await awaitMigrateFlushForIdentity(pnIdentifier);
        } catch {
          /* best-effort */
        }
        const creds = SecureCredentialManager.getCredentials(sessionId);
        let mlKemSecretKey: string | null = null;
        if (creds) {
          try {
            const { resolveIdentityMlKemSecret } = await import('../../services/resolveIdentityMlKem');
            mlKemSecretKey = await resolveIdentityMlKemSecret({
              identityId: pnIdentifier,
              publicKey: sessionId,
              pnName: creds.pnName,
              passcode: creds.passcode
            });
          } catch {
            mlKemSecretKey = null;
          }
        }
        if (creds && !envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier))) {
          const status = await ensureCloudCredentialsReady({
            apiEndpoint: API_ENDPOINT,
            authToken: apiToken,
            pnIdentifier,
            mlKemSecretKey,
            pnName: creds.pnName,
            passcode: creds.passcode
          });
          if (status === 'ready') {
            warmed = getSessionCloudCredentials(pnIdentifier);
          }
        }
        // Migrate / re-seal: publish ML-KEM vault so browse OAuth unlock can hydrate
        if (creds && envelopeHasUsableSecrets(warmed || getSessionCloudCredentials(pnIdentifier))) {
          const toPublish = warmed || getSessionCloudCredentials(pnIdentifier);
          if (toPublish) {
            await publishCloudCredentialsVault({
              apiEndpoint: API_ENDPOINT,
              authToken: apiToken,
              pnIdentifier,
              mlKemSecretKey,
              pnName: creds.pnName,
              passcode: creds.passcode,
              credentials: toPublish
            }).catch(() => ({ ok: false }));
            // Also re-seal locally under canonical session id for this origin
            await persistCloudCredentials({
              identityId: pnIdentifier,
              credentials: toPublish,
              session: {
                sessionId: 'pn-cloud-creds-v1',
                pnName: creds.pnName,
                passcode: creds.passcode
              },
              mode: 'sealed'
            }).catch(() => null);
          }
        }
        setMigrateSettled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pnIdentifier, sessionId, apiToken]);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier || !sessionId) return null;
    const fromSession = getSessionCloudCredentials(pnIdentifier);
    if (envelopeHasUsableSecrets(fromSession)) return fromSession;
    const creds = SecureCredentialManager.getCredentials(sessionId);
    if (!creds) return null;
    const canonical = await loadLocalCloudCredentials({
      identityId: pnIdentifier,
      session: {
        sessionId: 'pn-cloud-creds-v1',
        pnName: creds.pnName,
        passcode: creds.passcode
      }
    });
    if (canonical) return canonical;
    return loadLocalCloudCredentials({
      identityId: pnIdentifier,
      session: {
        sessionId,
        pnName: creds.pnName,
        passcode: creds.passcode
      }
    });
  }, [pnIdentifier, sessionId]);

  const gate = useCloudReconnectGate({
    enabled: !!(apiToken && pnIdentifier && sessionId && migrateSettled),
    authToken: apiToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  // Case A warm: gate becomes ready without reconnect — mint access token then fire READY.
  React.useEffect(() => {
    if (gate.readiness !== 'ready') {
      warmedReadyRef.current = false;
      return;
    }
    if (warmedReadyRef.current) return;
    if (!apiToken || !pnIdentifier) return;
    warmedReadyRef.current = true;
    void publishCloudDriveReady({
      authToken: apiToken,
      pnIdentifier,
      apiEndpoint: API_ENDPOINT
    });
  }, [gate.readiness, apiToken, pnIdentifier]);

  // Migrate / Storage connect may publish secrets after the first gate check.
  React.useEffect(() => {
    if (!migrateSettled) return;
    const onReady = () => {
      void gate.refresh();
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    return () => window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
  }, [migrateSettled, gate.refresh]);

  const persistMode: PersistCloudCredentialsMode = resolveCloudPersistMode({
    hasKeyedDevices
  });
  const effectivePersistMode: PersistCloudCredentialsMode = isKeyedSession
    ? 'sealed'
    : persistMode;

  const markReady = gate.markReady;
  const handleConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier || !sessionId) return;
      const creds = SecureCredentialManager.getCredentials(sessionId);
      if (!creds) throw new Error('Session credentials missing — unlock again.');
      await persistCloudCredentials({
        identityId: pnIdentifier,
        credentials: envelope,
        session: {
          sessionId: 'pn-cloud-creds-v1',
          pnName: creds.pnName,
          passcode: creds.passcode
        },
        mode: effectivePersistMode
      });
      if (apiToken) {
        await publishCloudCredentialsVault({
          apiEndpoint: API_ENDPOINT,
          authToken: apiToken,
          pnIdentifier,
          pnName: creds.pnName,
          passcode: creds.passcode,
          credentials: envelope
        }).catch(() => ({ ok: false }));
      }

      markReady();
      if (apiToken) {
        await publishCloudDriveReady({
          authToken: apiToken,
          pnIdentifier,
          apiEndpoint: API_ENDPOINT
        });
      }
    },
    [pnIdentifier, sessionId, effectivePersistMode, markReady, apiToken]
  );

  const handleReconnect = useCallback(() => {
    const provider = gate.socialCloudProvider;
    if (isOAuthCloudProvider(provider) && apiToken && pnIdentifier) {
      setOauthBusy(true);
      setOauthError(null);
      const pending = reconnectOAuthProvider({
        provider,
        pnIdentifier,
        authToken: apiToken,
        apiEndpoint: API_ENDPOINT,
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
    apiToken,
    pnIdentifier,
    googleClientId,
    handleConnected
  ]);

  const show = useMemo(
    () => !!(apiToken && pnIdentifier && sessionId && migrateSettled),
    [apiToken, pnIdentifier, sessionId, migrateSettled]
  );

  const showPairDevice = hasKeyedDevices && !isKeyedSession && isKeyableClient();
  const showDownloadApp = hasKeyedDevices && !isKeyedSession && !isKeyableClient();

  if (!show) return null;

  return (
    <>
      <CloudReconnectPrompt
        open={gate.promptOpen && !gate.panelOpen && !pairOpen}
        socialCloudProvider={gate.socialCloudProvider}
        onReconnect={handleReconnect}
        onDismiss={gate.dismissPrompt}
        showPairDevice={showPairDevice}
        onPairDevice={() => setPairOpen(true)}
        busy={oauthBusy}
      >
        {showDownloadApp ? (
          <p style={{ margin: '12px 0 0', fontSize: 13 }}>
            <a href={APP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>
              Download the app
            </a>{' '}
            to key a phone or computer.
          </p>
        ) : null}
        {gate.error || oauthError ? (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: '#f87171' }} role="alert">
            {oauthError || gate.error}
          </p>
        ) : null}
      </CloudReconnectPrompt>
      <CloudReconnectPanel
        open={gate.panelOpen}
        onClose={gate.closePanel}
        pnIdentifier={pnIdentifier!}
        authToken={apiToken!}
        apiEndpoint={API_ENDPOINT}
        googleClientId={googleClientId}
        preferredProvider={gate.socialCloudProvider}
        onConnected={handleConnected}
      />
      <DevicePairFromReconnect
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        authToken={apiToken!}
        pnIdentifier={pnIdentifier!}
        sessionId={sessionId!}
        onPaired={async () => {
          await onPaired?.();
        }}
      />
    </>
  );
};
