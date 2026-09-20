/**
 * Auth context for Prism
 * Manages OAuth session and code exchange on return
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  exchangeCodeForToken,
  getSession,
  clearSession,
  PrismSession,
} from '../services/prismAuthService';
import { setPrismPnIdentifier } from '../services/prismApi';
import { oauthStatesMatch } from '@par-noir/oauth-ui';
import { PrismSessionVaultHost } from '../components/PrismSessionVaultHost';
import { hasPrismSessionVault } from '../services/sessionVaultNative';

interface AuthContextValue {
  session: PrismSession | null;
  loading: boolean;
  signOut: () => void;
  /** Reload session from storage (e.g. after popup OAuth exchange in opener) */
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PrismSession | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<PrismSession | null>(null);
  sessionRef.current = session;
  const processedCodesRef = useRef<Set<string>>(new Set());

  const refreshSession = useCallback(async () => {
    const s = await getSession();
    setPrismPnIdentifier(s?.pnIdentifier);
    setSession(s);
  }, []);

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
          await refreshSession();
        } catch {
          const s = await getSession();
          if (s) {
            setPrismPnIdentifier(s.pnIdentifier);
            setSession(s);
          }
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

    void (async () => {
      // Native + vault: let PrismSessionVaultHost drive biometric restore; skip ungated getSession.
      if (Capacitor.isNativePlatform() && (await hasPrismSessionVault())) {
        setLoading(false);
        return;
      }
      const s = await getSession();
      setPrismPnIdentifier(s?.pnIdentifier);
      setSession(s);
      setLoading(false);
    })();
  }, [refreshSession]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let lockTimeout: ReturnType<typeof setTimeout> | null = null;
    const listenerRef = { current: null as { remove: () => Promise<void> } | null };

    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && sessionRef.current) {
        // Clear in-memory session only — keep Keychain vault for biometric reopen.
        lockTimeout = setTimeout(() => {
          setSession(null);
        }, 5 * 60 * 1000);
      } else if (isActive && lockTimeout) {
        clearTimeout(lockTimeout);
        lockTimeout = null;
      }
    }).then((l) => {
      listenerRef.current = l;
    });

    return () => {
      if (lockTimeout) clearTimeout(lockTimeout);
      listenerRef.current?.remove?.();
    };
  }, []);

  const signOut = async () => {
    try {
      const { wipeThirdPartyCloudOnLock } = await import('@par-noir/oauth-ui');
      await wipeThirdPartyCloudOnLock(session?.pnIdentifier);
    } catch {
      /* ignore */
    }
    await clearSession();
    setPrismPnIdentifier(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut, refreshSession }}>
      <PrismSessionVaultHost
        session={session}
        onSession={(s) => {
          setPrismPnIdentifier(s?.pnIdentifier);
          setSession(s);
        }}
        onLoadingDone={() => setLoading(false)}
      />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
