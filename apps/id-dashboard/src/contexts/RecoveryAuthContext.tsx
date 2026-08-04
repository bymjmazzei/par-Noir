import * as React from 'react';
import { IdentityCrypto, SecureCredentialManager, type EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  buildBrowserAppOAuthUnlockUrl,
  startPnOAuthPopup,
  type PnOAuthPopupResult,
} from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
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
  /** @deprecated Prefer unlockViaOAuthPopup for Recovery tab step-up. */
  authenticateFromFile: (file: File, pnName: string, passcode: string) => Promise<void>;
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

function identityFromHandoff(result: PnOAuthPopupResult): EncryptedIdentity | null {
  const handoff = result.messagingHandoff;
  if (!handoff || typeof handoff !== 'object') return null;
  const identity = (handoff as { identity?: Record<string, unknown> }).identity;
  if (!identity || typeof identity !== 'object') return null;
  const { encryptedData, iv, salt, publicKey, mlKemPublicKey } = identity;
  if (
    typeof encryptedData !== 'string' ||
    typeof iv !== 'string' ||
    typeof salt !== 'string'
  ) {
    return null;
  }
  return {
    encryptedData,
    iv,
    salt,
    publicKey: typeof publicKey === 'string' ? publicKey : '',
    mlKemPublicKey: typeof mlKemPublicKey === 'string' ? mlKemPublicKey : undefined,
  };
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
    const { parsePortablePnBackup } = await import('../utils/parsePortablePnBackup');
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

  const unlockViaOAuthPopup = React.useCallback(
    async (opts: {
      expectedUser: { id: string; publicKey?: string };
      loadEncryptedIdentity: RecoveryEncryptedIdentityLoader;
    }) => {
      const origin = window.location.origin;
      const clientId = import.meta.env.VITE_PN_CLIENT_ID || 'browser-app';
      const url = buildBrowserAppOAuthUnlockUrl({
        clientId,
        appOrigin: origin,
        redirectUri: `${origin}/oauth-callback.html`,
        apiEndpoint: API_ENDPOINT,
        identityHandoffRequired: true,
        forPopup: true,
      });
      const expectedState = new URL(url).searchParams.get('state') || '';

      const result = await startPnOAuthPopup({
        url,
        expectedState,
        origin,
        timeoutMs: 180_000,
      });

      if (result.error) {
        throw new Error(result.error_description || result.error || 'Unlock cancelled');
      }

      const expectedKey = opts.expectedUser.publicKey || opts.expectedUser.id;
      const credentials = SecureCredentialManager.getCredentials(opts.expectedUser.id);
      if (!credentials?.pnName || !credentials?.passcode) {
        throw new Error(
          'Dashboard unlock secrets are not available. Unlock your pN on the dashboard, then try again.'
        );
      }

      let encryptedIdentity = identityFromHandoff(result);
      if (!encryptedIdentity?.encryptedData) {
        const loaded = await opts.loadEncryptedIdentity(expectedKey);
        const alt =
          expectedKey !== opts.expectedUser.id
            ? await opts.loadEncryptedIdentity(opts.expectedUser.id)
            : null;
        const partial = loaded || alt;
        if (!partial) {
          throw new Error('Could not load your identity after unlock. Re-unlock the dashboard and try again.');
        }
        encryptedIdentity = {
          publicKey: expectedKey,
          encryptedData: partial.encryptedData,
          iv: partial.iv,
          salt: partial.salt,
        };
      }

      if (
        encryptedIdentity.publicKey &&
        expectedKey &&
        encryptedIdentity.publicKey !== expectedKey &&
        encryptedIdentity.publicKey !== opts.expectedUser.id
      ) {
        throw new Error('Unlocked identity does not match the active dashboard session.');
      }

      await IdentityCrypto.authenticateIdentity(
        encryptedIdentity,
        credentials.passcode,
        credentials.pnName
      );

      // Prefer full stored identity (recoveryEnvelope / recoverySharesSealed) when available.
      const stored =
        (await opts.loadEncryptedIdentity(expectedKey)) ||
        (await opts.loadEncryptedIdentity(opts.expectedUser.id));
      const fullIdentity: EncryptedIdentity = stored
        ? {
            ...encryptedIdentity,
            ...stored,
            publicKey: encryptedIdentity.publicKey || expectedKey,
            recoveryEnvelope: (stored as EncryptedIdentity).recoveryEnvelope ?? encryptedIdentity.recoveryEnvelope,
            recoverySharesSealed:
              (stored as EncryptedIdentity).recoverySharesSealed ?? encryptedIdentity.recoverySharesSealed,
          }
        : { ...encryptedIdentity, publicKey: encryptedIdentity.publicKey || expectedKey };

      // Re-load full blob from SimpleStorage when present (includes sealed recovery fields).
      try {
        const { default: SimpleStorage } = await import('../utils/simpleStorage');
        const simple = await SimpleStorage.getInstance().getIdentity(expectedKey);
        const enc = simple?.encryptedData as EncryptedIdentity | undefined;
        if (enc?.encryptedData && enc.iv && enc.salt) {
          Object.assign(fullIdentity, enc);
          if (!fullIdentity.publicKey) fullIdentity.publicKey = expectedKey;
        }
      } catch {
        /* keep handoff/partial */
      }

      setAuth({
        encryptedIdentity: fullIdentity,
        pnName: credentials.pnName,
        passcode: credentials.passcode,
        expiresAt: Date.now() + RECOVERY_AUTH_TTL_MS,
      });
    },
    []
  );

  const value = React.useMemo<RecoveryAuthContextValue>(
    () => ({
      isAuthenticated: auth != null && auth.expiresAt > Date.now(),
      auth,
      authenticateFromFile,
      unlockViaOAuthPopup,
      clearAuth,
    }),
    [auth, authenticateFromFile, unlockViaOAuthPopup, clearAuth]
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
