import React, { useCallback, useEffect, useState } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  isDmIdentityReady,
} from '../services/dmIdentitySession';
import { restoreMessagingAfterOAuth } from '../services/messagingOAuthHandoff';
import { fetchStorageAccounts } from '../services/storageApiClient';
import { getSessionCloudCredentials } from '@par-noir/device-cloud-credentials';
import { assessCloudSessionReadiness } from '@par-noir/user-owned-storage';

/**
 * Connection health for messaging/settings. Cloud reconnect is handled by
 * AggregatorCloudReconnectHost (in-app), not a dashboard-only link.
 */
export const ConnectionHealthBanner: React.FC = () => {
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [linkedInactive, setLinkedInactive] = useState(false);
  const [messagingOk, setMessagingOk] = useState(() => isDmIdentityReady());
  const session = PNOAuthService.loadSession();
  const oauthOk = !!(session?.accessToken && PNOAuthService.isSessionValid(session));

  const refreshMessagingState = useCallback(() => {
    restoreMessagingAfterOAuth();
    setMessagingOk(isDmIdentityReady());
  }, []);

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
    let cancelled = false;
    (async () => {
      const pnIdentifier = session?.pnIdentifier;
      if (!session?.accessToken || !pnIdentifier) {
        setStorageOk(false);
        setLinkedInactive(false);
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
        if (!cancelled) {
          setLinkedInactive(readiness === 'linkedInactive');
          setStorageOk(readiness === 'ready' || (connected && readiness !== 'linkedInactive'));
        }
      } catch {
        if (!cancelled) {
          setStorageOk(false);
          setLinkedInactive(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, session?.pnIdentifier]);

  if (oauthOk && storageOk && messagingOk && !linkedInactive) return null;

  return (
    <div className="mx-3 mb-3 p-3 rounded-lg bg-amber-950/50 border border-amber-800/60 text-amber-100 text-xs space-y-2">
      <p className="font-medium">Connection status</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {!oauthOk && <li>Not connected — use the lock icon to unlock with pN OAuth</li>}
        {oauthOk && linkedInactive && (
          <li>
            Cloud storage is linked but not signed in on this device — use the reconnect prompt to
            authorize this unlock
          </li>
        )}
        {oauthOk && storageOk === false && !linkedInactive && (
          <li>Cloud storage not connected — reconnect from the prompt or connect a provider</li>
        )}
        {oauthOk && !messagingOk && (
          <li>
            Messaging encryption not loaded — lock and unlock your pN with the lock icon to restore
            messaging keys
          </li>
        )}
      </ul>
    </div>
  );
};
