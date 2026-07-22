import React, { useCallback, useEffect, useState } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  DM_IDENTITY_CHANGE_EVENT,
  isDmIdentityReady,
} from '../services/dmIdentitySession';
import { restoreMessagingAfterOAuth } from '../services/messagingOAuthHandoff';
import { fetchStorageAccounts } from '../services/storageApiClient';

export const ConnectionHealthBanner: React.FC = () => {
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
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
        return;
      }
      try {
        const { connected } = await fetchStorageAccounts(session.accessToken, pnIdentifier);
        if (!cancelled) setStorageOk(connected);
      } catch {
        if (!cancelled) setStorageOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, session?.pnIdentifier]);

  if (oauthOk && storageOk && messagingOk) return null;

  return (
    <div className="mx-3 mb-3 p-3 rounded-lg bg-amber-950/50 border border-amber-800/60 text-amber-100 text-xs space-y-2">
      <p className="font-medium">Connection status</p>
      <ul className="list-disc pl-4 space-y-0.5">
        {!oauthOk && <li>Not connected — use the lock icon to unlock with pN OAuth</li>}
        {oauthOk && storageOk === false && (
          <li>
            Cloud storage not connected — connect at{' '}
            <a href="https://pn.parnoir.com" className="underline" target="_blank" rel="noreferrer">
              pn.parnoir.com
            </a>
          </li>
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
