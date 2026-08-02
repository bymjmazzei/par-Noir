import * as React from 'react';
import {
  RECOVERY_AUTH_TTL_MS,
  setRecoveryAuthSession,
  type RecoveryAuthSession,
} from '../services/recoveryAuthSession';

interface RecoveryAuthContextValue {
  isAuthenticated: boolean;
  auth: RecoveryAuthSession | null;
  authenticateFromFile: (file: File, pnName: string, passcode: string) => Promise<void>;
  clearAuth: () => void;
}

let recoveryAuthContext: React.Context<RecoveryAuthContextValue | null> | null = null;

/** Deferred init avoids createContext during components ↔ crypto-utils chunk cycles on load. */
function getRecoveryAuthContext(): React.Context<RecoveryAuthContextValue | null> {
  if (!recoveryAuthContext) {
    recoveryAuthContext = React.createContext<RecoveryAuthContextValue | null>(null);
  }
  return recoveryAuthContext;
}

export function RecoveryAuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = React.useState<RecoveryAuthSession | null>(null);
  const Ctx = getRecoveryAuthContext();

  const clearAuth = React.useCallback(() => {
    setAuth(null);
    setRecoveryAuthSession(null);
  }, []);

  React.useEffect(() => {
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

  const authenticateFromFile = React.useCallback(async (file: File, pnName: string, passcode: string) => {
    const [{ IdentityCrypto }, { parsePortablePnBackup }] = await Promise.all([
      import('@par-noir/identity-crypto'),
      import('../utils/parsePortablePnBackup'),
    ]);
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

  const value = React.useMemo<RecoveryAuthContextValue>(
    () => ({
      isAuthenticated: auth != null && auth.expiresAt > Date.now(),
      auth,
      authenticateFromFile,
      clearAuth,
    }),
    [auth, authenticateFromFile, clearAuth]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRecoveryAuth(): RecoveryAuthContextValue {
  const ctx = React.useContext(getRecoveryAuthContext());
  if (!ctx) {
    throw new Error('useRecoveryAuth must be used within RecoveryAuthProvider');
  }
  return ctx;
}

/** Safe optional hook for components outside provider. */
export function useRecoveryAuthOptional(): RecoveryAuthContextValue | null {
  return React.useContext(getRecoveryAuthContext());
}
