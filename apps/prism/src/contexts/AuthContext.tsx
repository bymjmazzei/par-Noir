/**
 * Auth context for Prism
 * Manages OAuth session and code exchange on return
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  exchangeCodeForToken,
  getSession,
  clearSession,
  PrismSession,
} from '../services/prismAuthService';

interface AuthContextValue {
  session: PrismSession | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PrismSession | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<PrismSession | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('oauth_error');

    if (error) {
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (code) {
      exchangeCodeForToken(code)
        .then((s) => {
          setSession(s);
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch((err) => {
          console.error('[Prism Auth] Token exchange failed:', err);
          window.history.replaceState({}, '', window.location.pathname);
        })
        .finally(() => setLoading(false));
      return;
    }

    getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });

    let lockTimeout: ReturnType<typeof setTimeout> | null = null;
    const listenerRef = { current: null as { remove: () => Promise<void> } | null };

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && sessionRef.current) {
          lockTimeout = setTimeout(async () => {
            await clearSession();
            setSession(null);
          }, 5 * 60 * 1000);
        } else if (isActive && lockTimeout) {
          clearTimeout(lockTimeout);
          lockTimeout = null;
        }
      }).then((l) => { listenerRef.current = l; });
    }

    return () => {
      if (lockTimeout) clearTimeout(lockTimeout);
      listenerRef.current?.remove?.();
    };
  }, []);

  const signOut = async () => {
    await clearSession();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
