import * as React from 'react';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  RECOVERY_AUTH_TTL_MS,
  setRecoveryAuthSession,
  type RecoveryAuthSession,
} from '../services/recoveryAuthSession';

export type RecoveryEncryptedIdentityLoader = (
  identityPublicKeyOrId: string
) => Promise<Pick<EncryptedIdentity, 'encryptedData' | 'iv' | 'salt'> | null>;

interface RecoveryAuthContextValue {
  isAuthenticated: boolean;
  auth: RecoveryAuthSession | null;
  unlockViaOAuthPopup: (opts: {
    expectedUser: { id: string; publicKey?: string };
    loadEncryptedIdentity: RecoveryEncryptedIdentityLoader;
  }) => Promise<void>;
  clearAuth: () => void;
}

let recoveryAuthContext: React.Context<RecoveryAuthContextValue | null> | null = null;

function getRecoveryAuthContext(): React.Context<RecoveryAuthContextValue | null> {
  if (!recoveryAuthContext) {
    recoveryAuthContext = React.createContext<RecoveryAuthContextValue | null>(null);
  }
  return recoveryAuthContext;
}

function isEncryptedRow(value: unknown): value is EncryptedIdentity {
  const row = value as Partial<EncryptedIdentity> | null | undefined;
  return Boolean(row?.encryptedData && row.iv && row.salt);
}

/** Recovery envelope for the Recovery tab: the Unlock-app session's copy, else the locally saved .pn. */
async function loadStoredIdentity(
  publicKey: string,
  userId: string,
  loader: RecoveryEncryptedIdentityLoader
): Promise<EncryptedIdentity | null> {
  let identity: EncryptedIdentity | null = null;
  try {
    const stored = (await loader(publicKey)) || (await loader(userId));
    if (isEncryptedRow(stored)) identity = { ...stored, publicKey };
  } catch (err) {
    console.warn('[recovery] identity loader failed:', err instanceof Error ? err.message : err);
  }
  try {
    const { default: SimpleStorage } = await import('../utils/simpleStorage');
    const simple = await SimpleStorage.getInstance().getIdentity(publicKey);
    if (isEncryptedRow(simple?.encryptedData)) {
      identity = { ...(identity || {}), ...simple.encryptedData, publicKey };
    }
  } catch (err) {
    console.warn('[recovery] local identity read failed:', err instanceof Error ? err.message : err);
  }
  const { readShellRecoveryEnvelope } = await import('../services/shellRecoveryEnvelope');
  const shellEnvelope = readShellRecoveryEnvelope(publicKey) || readShellRecoveryEnvelope(userId);
  if (shellEnvelope) {
    // An Unlock-app session has no local encrypted row; only the envelope crosses over.
    identity = { encryptedData: '', iv: '', salt: '', ...(identity || {}), publicKey, recoveryEnvelope: shellEnvelope };
  }
  return identity;
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

  const unlockViaOAuthPopup = React.useCallback(
    async (opts: {
      expectedUser: { id: string; publicKey?: string };
      loadEncryptedIdentity: RecoveryEncryptedIdentityLoader;
    }) => {
      const publicKey = opts.expectedUser.publicKey;
      if (!publicKey) throw new Error('Unlock your pN on the dashboard first.');

      const { reauthenticateForRecovery } = await import('../services/recoveryStepUp');
      await reauthenticateForRecovery(publicKey);

      const encryptedIdentity = await loadStoredIdentity(publicKey, opts.expectedUser.id, opts.loadEncryptedIdentity);
      if (!encryptedIdentity?.recoveryEnvelope) {
        throw new Error(
          'par Noir Unlock did not share this pN’s recovery data. Lock the dashboard, unlock again choosing your .pn file in par Noir Unlock, then unlock recovery.'
        );
      }
      setAuth({ encryptedIdentity, expiresAt: Date.now() + RECOVERY_AUTH_TTL_MS });
    },
    []
  );

  const value = React.useMemo<RecoveryAuthContextValue>(
    () => ({
      isAuthenticated: auth != null && auth.expiresAt > Date.now(),
      auth,
      unlockViaOAuthPopup,
      clearAuth,
    }),
    [auth, unlockViaOAuthPopup, clearAuth]
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
