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
    setSession(s);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResume = params.get('oauth_resume') === '1';
    const code = params.get('code');
    const error = params.get('error') || params.get('oauth_error');

    if (error) {
      window.history.replaceState({}, '', window.location.pathname);
      setLoading(false);
      return;
    }

    if (code) {
      if (processedCodesRef.current.has(code)) {
        window.history.replaceState({}, '', window.location.pathname);
        setLoading(false);
        return;
      }
      processedCodesRef.current.add(code);

      void (async () => {
        try {
          await exchangeCodeForToken(code);
          await refreshSession();
        } catch {
          const s = await getSession();
          if (s) {
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

    void getSession().then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, [refreshSession]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let lockTimeout: ReturnType<typeof setTimeout> | null = null;
    const listenerRef = { current: null as { remove: () => Promise<void> } | null };

    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && sessionRef.current) {
        lockTimeout = setTimeout(async () => {
          await clearSession();
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
    await clearSession();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
