import * as React from 'react';
import { setRecoveryAuthSession, type RecoveryAuthSession } from '../services/recoveryAuthSession';

interface RecoveryAuthContextValue {
  isAuthenticated: boolean;
  auth: RecoveryAuthSession | null;
  startSession: (session: RecoveryAuthSession) => void;
  clearAuth: () => void;
}

let recoveryAuthContext: React.Context<RecoveryAuthContextValue | null> | null = null;

function getRecoveryAuthContext(): React.Context<RecoveryAuthContextValue | null> {
  if (!recoveryAuthContext) {
    recoveryAuthContext = React.createContext<RecoveryAuthContextValue | null>(null);
  }
  return recoveryAuthContext;
}

export function RecoveryAuthProvider({
  children,
  onSessionChange,
}: {
  children: React.ReactNode;
  /** Runs after the shared recovery session is set, cleared or expires. */
  onSessionChange?: () => void;
}) {
  const [auth, setAuth] = React.useState<RecoveryAuthSession | null>(null);
  const Ctx = getRecoveryAuthContext();
  const onSessionChangeRef = React.useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

  const clearAuth = React.useCallback(() => {
    setAuth(null);
    setRecoveryAuthSession(null);
  }, []);

  React.useEffect(() => {
    if (!auth) {
      setRecoveryAuthSession(null);
      onSessionChangeRef.current?.();
      return;
    }
    setRecoveryAuthSession(auth);
    onSessionChangeRef.current?.();
    const remaining = auth.expiresAt - Date.now();
    if (remaining <= 0) {
      clearAuth();
      return;
    }
    const timer = window.setTimeout(() => clearAuth(), remaining);
    return () => window.clearTimeout(timer);
  }, [auth, clearAuth]);

  const startSession = React.useCallback((session: RecoveryAuthSession) => {
    setAuth(session);
  }, []);

  const value = React.useMemo<RecoveryAuthContextValue>(
    () => ({
      isAuthenticated: auth != null && auth.expiresAt > Date.now(),
      auth,
      startSession,
      clearAuth,
    }),
    [auth, startSession, clearAuth]
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

export function useRecoveryAuthOptional(): RecoveryAuthContextValue | null {
  return React.useContext(getRecoveryAuthContext());
}
