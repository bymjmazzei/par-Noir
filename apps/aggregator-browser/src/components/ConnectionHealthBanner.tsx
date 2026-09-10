import React, { useCallback, useEffect, useState } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  isDmIdentityReady,
} from '../services/dmIdentitySession';
import { restoreMessagingAfterOAuth } from '../services/messagingOAuthHandoff';
import { requestMessagingReconnect } from '../services/messagingReconnect';
import { fetchStorageAccounts } from '../services/storageApiClient';
import { isUnlockPrefetchComplete } from '../services/unlockSessionCoordinator';
import {
  getSessionCloudCredentials,
  PN_CLOUD_CREDENTIALS_READY_EVENT
} from '@par-noir/device-cloud-credentials';
import { assessCloudSessionReadiness } from '@par-noir/user-owned-storage';

/**
 * Connection health for messaging/settings. Cloud reconnect is handled by
 * AggregatorCloudReconnectHost (in-app), not a dashboard-only link.
 */
export const ConnectionHealthBanner: React.FC = () => {
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [linkedInactive, setLinkedInactive] = useState(false);
  const [mintFailed, setMintFailed] = useState(false);
  const [messagingOk, setMessagingOk] = useState(() => isDmIdentityReady());
  const session = PNOAuthService.loadSession();
  const oauthOk = !!(session?.accessToken && PNOAuthService.isSessionValid(session));

  const refreshMessagingState = useCallback(() => {
    restoreMessagingAfterOAuth();
    setMessagingOk(isDmIdentityReady());
  }, []);

  const refreshStorageState = useCallback(async () => {
    const pnIdentifier = session?.pnIdentifier;
    if (!session?.accessToken || !pnIdentifier) {
      setStorageOk(false);
      setLinkedInactive(false);
      return;
    }
    if (!isUnlockPrefetchComplete(pnIdentifier)) {
      return;
    }
    try {
      const { connected, accounts, socialCloudProvider } = await fetchStorageAccounts(
        session.accessToken,
        pnIdentifier
      );
      const local = getSessionCloudCredentials(pnIdentifier);
      const readiness = assessCloudSessionReadiness({
        apiAccounts: accounts ?? [],
        socialCloudProvider: socialCloudProvider ?? null,
        localEnvelope: local
      });
      setLinkedInactive(readiness === 'linkedInactive');
      setStorageOk(readiness === 'ready' || (connected && readiness !== 'linkedInactive'));
    } catch {
      setStorageOk(false);
      setLinkedInactive(false);
    }
  }, [session?.accessToken, session?.pnIdentifier]);

  useEffect(() => {
    refreshMessagingState();
    const onChange = () => {
      if (isDmIdentityReady()) {
        setMessagingOk(true);
        return;
      }
      refreshMessagingState();
    };
    window.addEventListener(DM_IDENTITY_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(DM_IDENTITY_CHANGE_EVENT, onChange);
  }, [refreshMessagingState]);

  useEffect(() => {
    void refreshStorageState();
    const onPrefetch = () => {
      void refreshStorageState();
    };
    const onMintFailed = () => setMintFailed(true);
    const onReady = () => {
      setMintFailed(false);
      void refreshStorageState();
    };
    window.addEventListener('pn_unlock_prefetch_complete', onPrefetch);
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    window.addEventListener('pn_cloud_at_mint_failed', onMintFailed);
    return () => {
      window.removeEventListener('pn_unlock_prefetch_complete', onPrefetch);
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
      window.removeEventListener('pn_cloud_at_mint_failed', onMintFailed);
    };
  }, [refreshStorageState]);

  const openCloudReconnect = useCallback(() => {
    window.dispatchEvent(new CustomEvent('pn_open_cloud_reconnect'));
  }, []);

  if (oauthOk && storageOk && messagingOk && !linkedInactive && !mintFailed) return null;

  return (
    <div className="mx-3 mb-3 p-3 rounded-lg bg-amber-950/50 border border-amber-800/60 text-amber-100 text-xs space-y-2">
      <p className="font-medium">Connection status</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {!oauthOk && <li>Not connected — use the lock icon to unlock with pN OAuth</li>}
        {oauthOk && mintFailed && !linkedInactive && (
          <li>
            Cloud secrets are on this device but Drive sign-in failed —{' '}
            <button
              type="button"
              className="underline text-amber-50 hover:text-white"
              onClick={openCloudReconnect}
            >
              reconnect cloud storage
            </button>
          </li>
        )}
        {oauthOk && linkedInactive && (
          <li>
            Cloud storage is linked but not signed in on this device —{' '}
            <button
              type="button"
              className="underline text-amber-50 hover:text-white"
              onClick={openCloudReconnect}
            >
              reconnect cloud storage
            </button>
          </li>
        )}
        {oauthOk && storageOk === false && !linkedInactive && !mintFailed && (
          <li>
            Cloud storage not connected —{' '}
            <button
              type="button"
              className="underline text-amber-50 hover:text-white"
              onClick={openCloudReconnect}
            >
              reconnect from here
            </button>{' '}
            or connect a provider
          </li>
        )}
        {oauthOk && !messagingOk && (
          <li>
            Messaging encryption not loaded —{' '}
            <button
              type="button"
              className="underline text-amber-50 hover:text-white"
              onClick={() => requestMessagingReconnect()}
            >
              restore messaging keys
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};
