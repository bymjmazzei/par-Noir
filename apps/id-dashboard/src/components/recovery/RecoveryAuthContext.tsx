import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { IdentityCrypto, type EncryptedIdentity } from '../../utils/crypto';
import { parsePortablePnBackup } from '../../utils/parsePortablePnBackup';
import {
  RECOVERY_AUTH_TTL_MS,
  setRecoveryAuthSession,
  type RecoveryAuthSession,
} from '../../services/recoveryAuthSession';

interface RecoveryAuthContextValue {
  isAuthenticated: boolean;
  auth: RecoveryAuthSession | null;
  authenticateFromFile: (file: File, pnName: string, passcode: string) => Promise<void>;
  clearAuth: () => void;
}

const RecoveryAuthContext = createContext<RecoveryAuthContextValue | null>(null);

export function RecoveryAuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<RecoveryAuthSession | null>(null);

  const clearAuth = useCallback(() => {
    setAuth(null);
    setRecoveryAuthSession(null);
  }, []);

  useEffect(() => {
    if (!auth) {
      setRecoveryAuthSession(null);
      return;
    }
    setRecoveryAuthSession(auth);
    const remaining = auth.expiresAt - Date.now();
    if (remaining <= 0) {
      clearAuth();
      return;
    }
    const timer = window.setTimeout(() => clearAuth(), remaining);
    return () => window.clearTimeout(timer);
  }, [auth, clearAuth]);

  const authenticateFromFile = useCallback(async (file: File, pnName: string, passcode: string) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const encryptedIdentity = parsePortablePnBackup(parsed);
    await IdentityCrypto.authenticateIdentity(encryptedIdentity, passcode, pnName);
    setAuth({
      encryptedIdentity,
      pnName,
      passcode,
      expiresAt: Date.now() + RECOVERY_AUTH_TTL_MS,
    });
  }, []);

  const value = useMemo<RecoveryAuthContextValue>(
    () => ({
      isAuthenticated: auth != null && auth.expiresAt > Date.now(),
      auth,
      authenticateFromFile,
      clearAuth,
    }),
    [auth, authenticateFromFile, clearAuth]
  );

  return <RecoveryAuthContext.Provider value={value}>{children}</RecoveryAuthContext.Provider>;
}

export function useRecoveryAuth(): RecoveryAuthContextValue {
  const ctx = useContext(RecoveryAuthContext);
  if (!ctx) {
    throw new Error('useRecoveryAuth must be used within RecoveryAuthProvider');
  }
  return ctx;
}

/** Safe optional hook for components outside provider. */
export function useRecoveryAuthOptional(): RecoveryAuthContextValue | null {
  return useContext(RecoveryAuthContext);
}
