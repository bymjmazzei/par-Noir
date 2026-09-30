import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearCloudCredentialsOnLock,
  getSessionCloudCredentials,
  publishCloudDriveReady,
} from '@par-noir/device-cloud-credentials';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import {
  CloudReconnectPrompt,
  DASHBOARD_CLOUD_CONNECT_MESSAGE,
  DASHBOARD_CLOUD_CONNECT_TITLE,
} from './CloudReconnectPrompt';
import { useCloudReconnectGate } from './useCloudReconnectGate';
import { ensureCloudCredentialsReady } from './cloudVaultHydrate';
import { flushPendingGrant } from '../pendingGrantPersist';

export interface ThirdPartyCloudReconnectHostProps {
  apiEndpoint: string;
  authToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  googleClientId?: string | null;
  /** Preferred: ML-KEM from OAuth messaging handoff */
  mlKemSecretKey?: string | null;
  /** Legacy identity factors for vault hydrate */
  pnName?: string | null;
  passcode?: string | null;
}

/**
 * Post-OAuth cloud reconnect for prism / licensing / developer portals.
 * Hydrates from ML-KEM-sealed vault when available (else identity factors).
 */
export function ThirdPartyCloudReconnectHost({
  apiEndpoint,
  authToken,
  pnIdentifier,
  mlKemSecretKey,
  pnName,
  passcode
}: ThirdPartyCloudReconnectHostProps) {
  const [vaultHydrated, setVaultHydrated] = useState(false);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const mintCompletedKeyRef = useRef<string | null>(null);
  const mintInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!authToken || !pnIdentifier || (!mlKemSecretKey && !(pnName && passcode))) {
        setVaultHydrated(false);
        return;
      }
      if (envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier))) {
        if (!cancelled) setVaultHydrated(true);
        return;
      }
      const status = await ensureCloudCredentialsReady({
        apiEndpoint,
        authToken,
        pnIdentifier,
        mlKemSecretKey,
        pnName,
        passcode
      });
      if (!cancelled) setVaultHydrated(status === 'ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, authToken, pnIdentifier, mlKemSecretKey, pnName, passcode]);

  const loadLocalEnvelope = useCallback(async (): Promise<StorageCredentialsEnvelope | null> => {
    if (!pnIdentifier) return null;
    const existing = getSessionCloudCredentials(pnIdentifier);
    if (envelopeHasUsableSecrets(existing)) return existing;
    if (!authToken || (!mlKemSecretKey && !(pnName && passcode))) return existing;
    const status = await ensureCloudCredentialsReady({
      apiEndpoint,
      authToken,
      pnIdentifier,
      mlKemSecretKey,
      pnName,
      passcode,
    });
    if (status !== 'ready') return existing;
    return getSessionCloudCredentials(pnIdentifier);
  }, [apiEndpoint, authToken, pnIdentifier, mlKemSecretKey, pnName, passcode]);

  const gate = useCloudReconnectGate({
    enabled: !!(authToken && pnIdentifier),
    authToken,
    pnIdentifier,
    apiEndpoint,
    loadLocalEnvelope,
    dismissStorageKey: pnIdentifier ? `pn_cloud_reconnect_dismiss:${pnIdentifier}` : undefined
  });

  const gateRef = useRef(gate);
  gateRef.current = gate;

  useEffect(() => {
    mintCompletedKeyRef.current = null;
    mintInFlightRef.current = false;
    setHydrateFailed(false);
  }, [authToken, pnIdentifier]);

  useEffect(() => {
    if (!vaultHydrated || !authToken || !pnIdentifier) return;
    const mintKey = `${pnIdentifier}|${authToken.slice(0, 12)}`;
    if (mintCompletedKeyRef.current === mintKey || mintInFlightRef.current) return;
    mintInFlightRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await gateRef.current.refresh();
        if (cancelled) return;
        const ok = await publishCloudDriveReady({
          authToken,
          pnIdentifier,
          apiEndpoint
        });
        if (cancelled) return;
        if (ok) {
          mintCompletedKeyRef.current = mintKey;
          setHydrateFailed(false);
          gateRef.current.markReady();
          await flushPendingGrant({ authToken, pnIdentifier, apiEndpoint });
        } else {
          setHydrateFailed(true);
        }
      } finally {
        mintInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultHydrated, authToken, pnIdentifier, apiEndpoint]);

  if (!authToken || !pnIdentifier) return null;

  return (
    <CloudReconnectPrompt
      open={hydrateFailed}
      socialCloudProvider={gate.socialCloudProvider}
      title={DASHBOARD_CLOUD_CONNECT_TITLE}
      message={DASHBOARD_CLOUD_CONNECT_MESSAGE}
      allowReconnect={false}
      onReconnect={() => undefined}
      onDismiss={() => {
        setHydrateFailed(false);
        gate.dismissPrompt();
      }}
    />
  );
}

export async function wipeThirdPartyCloudOnLock(pnIdentifier: string | null | undefined): Promise<void> {
  if (!pnIdentifier) return;
  await clearCloudCredentialsOnLock({ identityId: pnIdentifier, isKeyedSession: false });
}
