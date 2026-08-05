import React, { useCallback, useMemo, useState } from 'react';
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
  onCloudReady?: (result?: { status: string; error?: string }) => void;
}

/**
 * Post-unlock gate: prompt when API layout exists but this device has no usable secrets.
 */
export const CloudReconnectHost: React.FC<CloudReconnectHostProps> = ({
  apiToken,
  pnIdentifier,
  sessionId,
  isKeyedSession,
  hasKeyedDevices = false,
  onPaired,
  onCloudReady
}) => {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const onCloudReadyRef = React.useRef(onCloudReady);
  onCloudReadyRef.current = onCloudReady;

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

  // Unlock-time: warm sealed secrets into session, then full cloud session bootstrap
  // (backends + layout + owner-index) so Storage is not required for Drive capability.
  React.useEffect(() => {
    if (!pnIdentifier || !sessionId || !apiToken) return;
    let cancelled = false;
    void (async () => {
      try {
        await loadLocalEnvelope();
      } catch {
        /* best-effort warm */
      }
      if (cancelled) return;
      try {
        const { bootstrapCloudSession } = await import('../../services/storage/cloudSessionBootstrap');
        const result = await bootstrapCloudSession({
          apiToken,
          pnIdentifier,
          sessionId
        });
        if (cancelled) return;
        if (result.status === 'ready') {
          try {
            window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
          } catch {
            /* non-DOM */
          }
        }
        onCloudReadyRef.current?.(result);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pnIdentifier, sessionId, apiToken, loadLocalEnvelope]);

  const gate = useCloudReconnectGate({
    enabled: !!(apiToken && pnIdentifier),
    authToken: apiToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  const persistMode: PersistCloudCredentialsMode = resolveCloudPersistMode({
    hasKeyedDevices,
  });
  // Keyed native session still seals even in Case B
  const effectivePersistMode: PersistCloudCredentialsMode =
    isKeyedSession ? 'sealed' : persistMode;

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

      // Under device custody the API has no Google secrets — rebuild/verify Drive index
      // with the ephemeral token so device register can write devices.xlsx.
      const googleTok =
        envelope.googleDriveAccounts?.[0]?.accessToken ||
        (envelope.googleDriveAccounts?.[0] as { access_token?: string } | undefined)?.access_token;
      if (apiToken && typeof googleTok === 'string' && googleTok.trim()) {
        try {
          const initRes = await fetch(
            `${API_ENDPOINT.replace(/\/$/, '')}/api/storage/initialize/${encodeURIComponent(pnIdentifier)}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiToken}`,
                'X-PN-Cloud-Access-Token': googleTok.trim(),
                'Content-Type': 'application/json'
              }
            }
          );
          if (!initRes.ok) {
            const text = await initRes.text().catch(() => '');
            throw new Error(
              `Drive layout init failed (${initRes.status})${text ? `: ${text.slice(0, 160)}` : ''}`
            );
          }
        } catch (err) {
          setOauthError(
            err instanceof Error ? err.message : 'Drive layout setup failed after reconnect'
          );
          return;
        }
      }

      markReady();
      try {
        window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
      } catch {
        /* non-DOM */
      }
      try {
        const { bootstrapCloudSession, clearCloudSessionBootstrap } = await import(
          '../../services/storage/cloudSessionBootstrap'
        );
        clearCloudSessionBootstrap(pnIdentifier);
        const result = await bootstrapCloudSession({
          apiToken: apiToken || '',
          pnIdentifier,
          sessionId
        });
        onCloudReadyRef.current?.(result);
      } catch {
        onCloudReadyRef.current?.({ status: 'ready' });
      }
    },
    [pnIdentifier, sessionId, effectivePersistMode, isKeyedSession, markReady, apiToken]
  );

  const handleReconnect = useCallback(() => {
    const provider = gate.socialCloudProvider;
    // Known OAuth provider: open popup from this click (avoid redundant picker + popup blockers).
    if (isOAuthCloudProvider(provider) && apiToken && pnIdentifier) {
      setOauthBusy(true);
      setOauthError(null);
      // Call sync so window.open stays in the user-gesture stack.
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
