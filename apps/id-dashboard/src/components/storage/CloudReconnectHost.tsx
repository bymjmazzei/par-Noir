import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  isOAuthCloudProvider,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  reconnectOAuthProvider,
  useCloudReconnectGate
} from '@par-noir/oauth-ui';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import {
  loadLocalCloudCredentials,
  persistCloudCredentials,
  resolveCloudPersistMode,
  type PersistCloudCredentialsMode
} from '@par-noir/device-cloud-credentials';
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

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier || !sessionId) return null;
    const creds = SecureCredentialManager.getCredentials(sessionId);
    if (!creds) return null;
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
    enabled: !!(apiToken && pnIdentifier && sessionId),
    authToken: apiToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  // Case A warm: gate becomes ready without reconnect — fire READY so Privacy/Storage hydrate.
  React.useEffect(() => {
    if (gate.readiness !== 'ready') {
      warmedReadyRef.current = false;
      return;
    }
    if (warmedReadyRef.current) return;
    warmedReadyRef.current = true;
    try {
      window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
    } catch {
      /* non-DOM */
    }
  }, [gate.readiness]);

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
          sessionId,
          pnName: creds.pnName,
          passcode: creds.passcode
        },
        mode: effectivePersistMode
      });
      if (isKeyedSession) {
        try {
          const { sealAndStoreCloudCredentials } = await import('../../services/deviceCloudCredentials');
          await sealAndStoreCloudCredentials({
            identityId: pnIdentifier,
            credentials: envelope,
            session: {
              sessionId,
              pnName: creds.pnName,
              passcode: creds.passcode
            }
          });
        } catch {
          /* best-effort */
        }
      }

      markReady();
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
    },
    [pnIdentifier, sessionId, effectivePersistMode, isKeyedSession, markReady]
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
    () => !!(apiToken && pnIdentifier && sessionId),
    [apiToken, pnIdentifier, sessionId]
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
