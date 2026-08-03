import React, { useCallback, useMemo, useState } from 'react';
import {
  CloudReconnectPanel,
  CloudReconnectPrompt,
  useCloudReconnectGate
} from '@par-noir/oauth-ui';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import {
  loadLocalCloudCredentials,
  persistCloudCredentials,
  type PersistCloudCredentialsMode
} from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../../config/api';
import { getGoogleDriveClientId } from '../../config/googleDriveClientId';

export interface CloudReconnectHostProps {
  apiToken: string | null;
  pnIdentifier: string | null;
  sessionId: string | null;
  isKeyedSession: boolean;
  onKeyDevice?: () => void;
  onCloudReady?: () => void;
}

/**
 * Post-unlock gate: prompt when API layout exists but this device has no usable secrets.
 */
export const CloudReconnectHost: React.FC<CloudReconnectHostProps> = ({
  apiToken,
  pnIdentifier,
  sessionId,
  isKeyedSession,
  onKeyDevice,
  onCloudReady
}) => {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

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
    enabled: !!(apiToken && pnIdentifier),
    authToken: apiToken,
    pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  const persistMode: PersistCloudCredentialsMode = isKeyedSession ? 'sealed' : 'session';

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
        mode: persistMode
      });
      // Also seal via dashboard helper for native / grace wipe alignment when keyed
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
      gate.markReady();
      onCloudReady?.();
    },
    [pnIdentifier, sessionId, persistMode, isKeyedSession, gate, onCloudReady]
  );

  const show = useMemo(
    () => !!(apiToken && pnIdentifier && sessionId),
    [apiToken, pnIdentifier, sessionId]
  );

  if (!show) return null;

  return (
    <>
      <CloudReconnectPrompt
        open={gate.promptOpen && !gate.panelOpen}
        socialCloudProvider={gate.socialCloudProvider}
        onReconnect={gate.openPanel}
        onDismiss={gate.dismissPrompt}
        showKeyDevice={!isKeyedSession && !!onKeyDevice}
        onKeyDevice={onKeyDevice}
      />
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
    </>
  );
};
