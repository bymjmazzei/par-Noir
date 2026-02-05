/**
 * Auth context for Prism
 * Manages OAuth session and code exchange on return
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('oauth_error');

    if (error) {
      // Clear OAuth params and show error (handled by app)
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

    setSession(getSession());
    setLoading(false);
  }, []);

  const signOut = () => {
    clearSession();
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
