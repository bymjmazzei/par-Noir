/**
 * Auth context for Prism
 * Session state comes from the shared pN session; this handles code exchange on return.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { oauthStatesMatch, usePnSession, wipeThirdPartyCloudOnLock } from '@par-noir/oauth-ui';
import { exchangeCodeForToken, prismSession, type PrismSession } from '../services/prismAuthService';
import { setPrismPnIdentifier } from '../services/prismApi';
import { PrismSessionVaultHost, wipePrismSessionVaultOnLogout } from '../components/PrismSessionVaultHost';

prismSession.onWipe(async () => {
  await wipeThirdPartyCloudOnLock(prismSession.load()?.pnIdentifier).catch(() => undefined);
  await wipePrismSessionVaultOnLogout();
  setPrismPnIdentifier(null);
});

interface AuthContextValue {
  session: PrismSession | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = usePnSession(prismSession);
  const [loading, setLoading] = useState(true);
  const processedCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setPrismPnIdentifier(session?.pnIdentifier);
  }, [session?.pnIdentifier]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResume = params.get('oauth_resume') === '1';
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error') || params.get('oauth_error');

    if (error) {
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (code) {
      const expectedState = sessionStorage.getItem('pn_oauth_state');
      if (!state || !expectedState || !oauthStatesMatch(state, expectedState)) {
        window.history.replaceState({}, '', window.location.pathname);
        setLoading(false);
        return;
      }

      if (processedCodesRef.current.has(code)) {
        window.history.replaceState({}, '', window.location.pathname);
        setLoading(false);
        return;
      }
      processedCodesRef.current.add(code);

      void (async () => {
        try {
          const granted = params.get('granted_data_points');
          await exchangeCodeForToken(code, {
            grantedDataPoints: typeof granted === 'string' ? granted : undefined,
            consentShown: params.get('consent_shown') === '1',
          });
        } catch {
          /* stays locked; user can unlock again */
        } finally {
          setLoading(false);
          window.history.replaceState({}, '', window.location.pathname);
        }
      })();
      return;
    }

    if (oauthResume) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setLoading(false);
  }, []);

  const signOut = () => {
    void prismSession.lock('manual');
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      <PrismSessionVaultHost session={session} onLoadingDone={() => setLoading(false)} />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
