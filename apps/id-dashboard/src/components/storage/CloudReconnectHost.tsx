import React, { useCallback, useMemo, useState } from 'react';
import {
  loadLocalCloudCredentials,
  persistCloudCredentials,
  resolveCloudPersistMode,
  getSessionCloudCredentials,
  setSessionCloudCredentials,
  type PersistCloudCredentialsMode
} from '@par-noir/device-cloud-credentials';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import {
  FirstPartyCloudReconnectHost,
  ensureCloudCredentialsReady
} from '@par-noir/oauth-ui';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../../config/api';
import { getGoogleDriveClientId } from '../../config/googleDriveClientId';
import { DevicePairFromReconnect } from '../DevicePairFromReconnect';
import { isKeyableClient } from '@par-noir/device-client';
import { APP_DOWNLOAD_URL } from '../../config/appDownload';
import { publishCloudVaultForIdentity } from '../../services/deviceCloudCredentials';
import {
  cloudDisconnectGeneration,
  discardIfCloudDisconnected,
} from '../../services/disconnectCloud';
import { ownerFetch } from '../../services/ownerApiService';
import { CloudLayoutUpdateBanner } from './CloudLayoutUpdateBanner';

export interface CloudReconnectHostProps {
  apiToken: string | null;
  pnIdentifier: string | null;
  sessionId: string | null;
  isKeyedSession: boolean;
  /** True when this pN already has at least one keyed device registered */
  hasKeyedDevices?: boolean;
  onPaired?: () => void | Promise<void>;
  /** Navigate to dashboard Storage tab (layout upgrade CTA). */
  onOpenStorage?: () => void;
}

/**
 * Thin dashboard mount: migrate/hydrate + device-pair slots over shared first-party host.
 */
export const CloudReconnectHost: React.FC<CloudReconnectHostProps> = ({
  apiToken,
  pnIdentifier,
  sessionId,
  isKeyedSession,
  hasKeyedDevices = false,
  onPaired,
  onOpenStorage
}) => {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [migrateSettled, setMigrateSettled] = useState(false);

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

  React.useEffect(() => {
    if (!pnIdentifier || !sessionId || !apiToken) {
      setMigrateSettled(false);
      return;
    }
    let cancelled = false;
    setMigrateSettled(false);
    void (async () => {
      const seenDisconnect = cloudDisconnectGeneration(pnIdentifier);
      const { awaitMigrateFlushForIdentity } = await import('../../services/deviceCloudCredentials');
      const { readShellMlKem } = await import('../../services/shellMlKem');
      let warmed: StorageCredentialsEnvelope | null = null;
      const shellMlKem = readShellMlKem(pnIdentifier) || readShellMlKem(sessionId);
      if (!shellMlKem) {
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
            if (await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) break;
            warmed = env;
            setSessionCloudCredentials(pnIdentifier, env);
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }
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
        if (!mlKemSecretKey && shellMlKem) mlKemSecretKey = shellMlKem;
        const canUnseal = !!mlKemSecretKey || !!(creds?.pnName && creds?.passcode);
        if (canUnseal && !envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier))) {
          const status = await ensureCloudCredentialsReady({
            apiEndpoint: API_ENDPOINT,
            authToken: apiToken,
            pnIdentifier,
            mlKemSecretKey,
            pnName: creds?.pnName,
            passcode: creds?.passcode
          });
          if (await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) {
            warmed = null;
          } else if (status === 'ready') {
            warmed = getSessionCloudCredentials(pnIdentifier);
          }
        }
        if (
          creds &&
          !(await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) &&
          envelopeHasUsableSecrets(warmed || getSessionCloudCredentials(pnIdentifier))
        ) {
          const toPublish = warmed || getSessionCloudCredentials(pnIdentifier);
          if (toPublish) {
            try {
              const vault = await publishCloudVaultForIdentity({
                identityId: pnIdentifier,
                authToken: apiToken,
                pnName: creds.pnName,
                passcode: creds.passcode,
                credentials: toPublish,
                publicKey: sessionId,
                mlKemSecretKey
              });
              if (!vault.ok) {
                console.warn(
                  '[CloudReconnectHost] Unlock vault publish incomplete:',
                  vault.error || 'unknown'
                );
              }
            } catch (e) {
              console.warn(
                '[CloudReconnectHost] Unlock vault publish error (reconnect can retry):',
                e instanceof Error ? e.message : e
              );
            }
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
            if (await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) {
              await publishCloudVaultForIdentity({
                identityId: pnIdentifier,
                authToken: apiToken,
                pnName: creds.pnName,
                passcode: creds.passcode,
                credentials: { googleDriveAccounts: [] },
                publicKey: sessionId,
                mlKemSecretKey
              }).catch(() => undefined);
            }
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

  const persistMode: PersistCloudCredentialsMode = resolveCloudPersistMode({
    hasKeyedDevices
  });
  const effectivePersistMode: PersistCloudCredentialsMode = isKeyedSession
    ? 'sealed'
    : persistMode;

  const persistConnected = useCallback(
    async (envelope: StorageCredentialsEnvelope) => {
      if (!pnIdentifier || !sessionId) return;
      const creds = SecureCredentialManager.getCredentials(sessionId);
      if (!creds) throw new Error('Session credentials missing — unlock again.');
      const seenDisconnect = cloudDisconnectGeneration(pnIdentifier);
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
      if (await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) return;
      setSessionCloudCredentials(pnIdentifier, envelope);
      if (await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) return;
      if (apiToken) {
        const vault = await publishCloudVaultForIdentity({
          identityId: pnIdentifier,
          authToken: apiToken,
          pnName: creds.pnName,
          passcode: creds.passcode,
          credentials: envelope,
          publicKey: sessionId
        });
        if (!vault.ok) {
          throw new Error(vault.error || 'Failed to publish cloud vault for other apps');
        }
        if (await discardIfCloudDisconnected(pnIdentifier, seenDisconnect)) {
          await publishCloudVaultForIdentity({
            identityId: pnIdentifier,
            authToken: apiToken,
            pnName: creds.pnName,
            passcode: creds.passcode,
            credentials: { googleDriveAccounts: [] },
            publicKey: sessionId
          }).catch(() => undefined);
          return;
        }
        try {
          const accounts = Array.isArray(envelope.googleDriveAccounts)
            ? envelope.googleDriveAccounts
            : [];
          const layoutAccounts = accounts.map((a) => ({
            backendId: a.backendId || a.accountId,
            keyPrefix: a.keyPrefix,
            email: a.email,
            connectedAt: a.connectedAt
          }));
          await ownerFetch(
            apiToken,
            'PUT',
            `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}`,
            {
              credentials: {
                socialCloudProvider: envelope.socialCloudProvider || 'google_drive',
                socialCloudAccountId: envelope.socialCloudAccountId,
                googleDriveAccounts: layoutAccounts
              },
              cid: null
            },
            { pnIdentifier }
          );
        } catch {
          /* best-effort */
        }
      }
    },
    [pnIdentifier, sessionId, effectivePersistMode, apiToken]
  );

  const enabled = useMemo(
    () => !!(apiToken && pnIdentifier && sessionId && migrateSettled),
    [apiToken, pnIdentifier, sessionId, migrateSettled]
  );

  const showPairDevice = hasKeyedDevices && !isKeyedSession && isKeyableClient();
  const showDownloadApp = hasKeyedDevices && !isKeyedSession && !isKeyableClient();

  return (
    <FirstPartyCloudReconnectHost
      apiEndpoint={API_ENDPOINT}
      authToken={apiToken}
      pnIdentifier={pnIdentifier}
      googleClientId={googleClientId}
      enabled={enabled}
      loadLocalEnvelope={loadLocalEnvelope}
      mintStrategy="onGateReady"
      persistConnected={persistConnected}
      banner={
        apiToken && pnIdentifier ? (
          <div className="fixed bottom-4 left-4 right-4 z-40 max-w-lg mx-auto sm:left-auto sm:right-6 sm:mx-0 pointer-events-auto">
            <CloudLayoutUpdateBanner
              apiToken={apiToken}
              pnIdentifier={pnIdentifier}
              allowUpgrade={false}
              onOpenStorage={onOpenStorage}
            />
          </div>
        ) : null
      }
      showPairDevice={showPairDevice}
      onPairDevice={() => setPairOpen(true)}
      suppressPrompt={pairOpen}
      promptChildren={
        showDownloadApp ? (
          <p style={{ margin: '12px 0 0', fontSize: 13 }}>
            <a href={APP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>
              Download the app
            </a>{' '}
            to key a phone or computer.
          </p>
        ) : null
      }
      afterSlot={
        apiToken && pnIdentifier && sessionId ? (
          <DevicePairFromReconnect
            open={pairOpen}
            onClose={() => setPairOpen(false)}
            authToken={apiToken}
            pnIdentifier={pnIdentifier}
            sessionId={sessionId}
            onPaired={async () => {
              await onPaired?.();
            }}
          />
        ) : null
      }
      logTag="CloudReconnectHost"
    />
  );
};
