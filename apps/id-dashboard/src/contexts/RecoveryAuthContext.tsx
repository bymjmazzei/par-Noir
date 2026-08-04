import * as React from 'react';
import { IdentityCrypto, type EncryptedIdentity } from '@par-noir/identity-crypto';
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

const RECOVERY_STEPUP_MESSAGE = 'pn_recovery_stepup';

let recoveryAuthContext: React.Context<RecoveryAuthContextValue | null> | null = null;

function getRecoveryAuthContext(): React.Context<RecoveryAuthContextValue | null> {
  if (!recoveryAuthContext) {
    recoveryAuthContext = React.createContext<RecoveryAuthContextValue | null>(null);
  }
  return recoveryAuthContext;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface RecoveryStepUpPayload {
  v: number;
  nonce: string;
  publicKey: string;
  did: string;
  pnName: string;
  passcode: string;
  encryptedIdentity: EncryptedIdentity;
  expiresAt: number;
}

function readStepUpPayload(nonce: string): RecoveryStepUpPayload | null {
  const key = `pn_recovery_stepup_${nonce}`;
  try {
    // Popup and opener do not share sessionStorage — use localStorage for handoff.
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoveryStepUpPayload;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    if (!parsed?.pnName || !parsed?.passcode || !parsed?.encryptedIdentity?.encryptedData) {
      return null;
    }
    if (parsed.nonce && parsed.nonce !== nonce) {
      return null;
    }
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    return null;
  }
}

function isStepUpPayload(value: unknown, nonce: string): value is RecoveryStepUpPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as RecoveryStepUpPayload;
  return (
    p.nonce === nonce &&
    typeof p.pnName === 'string' &&
    typeof p.passcode === 'string' &&
    !!p.encryptedIdentity?.encryptedData &&
    !!p.encryptedIdentity?.iv &&
    !!p.encryptedIdentity?.salt &&
    (!p.expiresAt || p.expiresAt >= Date.now())
  );
}

/**
 * Same-origin recovery step-up popup (not full browser-app OAuth consent).
 * User re-enters Key 1/Key 2 in oauth-authorize.html; secrets return via sessionStorage + postMessage.
 */
function openRecoveryStepUpPopup(timeoutMs = 180_000): Promise<RecoveryStepUpPayload> {
  const origin = window.location.origin;
  const stepupNonce = randomHex(16);
  const url = `${origin}/oauth-authorize.html?mode=recovery_stepup&stepup_nonce=${encodeURIComponent(stepupNonce)}&popup=true`;

  return new Promise((resolve, reject) => {
    const popup = window.open(url, 'parnoir_recovery_stepup', 'popup=yes,width=500,height=640,scrollbars=yes,resizable=yes');
    if (!popup) {
      reject(new Error('Popup blocked. Allow popups for this site and try again.'));
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
      window.removeEventListener('message', onMessage);
    };
    const finish = (payload: RecoveryStepUpPayload | null, err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else if (payload) resolve(payload);
      else reject(new Error('Recovery unlock did not complete'));
    };

    const tryRead = () => {
      const payload = readStepUpPayload(stepupNonce);
      if (payload) finish(payload);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if ((data as { type?: string }).type !== RECOVERY_STEPUP_MESSAGE) return;
      if ((data as { nonce?: string }).nonce !== stepupNonce) return;
      const embedded = (data as { payload?: unknown }).payload;
      if (isStepUpPayload(embedded, stepupNonce)) {
        // Prefer in-message payload (sessionStorage is not shared across popup/opener).
        localStorage.removeItem(`pn_recovery_stepup_${stepupNonce}`);
        sessionStorage.removeItem(`pn_recovery_stepup_${stepupNonce}`);
        finish(embedded);
        return;
      }
      tryRead();
    };

    window.addEventListener('message', onMessage);

    let closedGraceStarted = false;
    const pollTimer = window.setInterval(() => {
      tryRead();
      try {
        if (popup.closed && !settled) {
          tryRead();
          if (!closedGraceStarted) {
            closedGraceStarted = true;
            window.setTimeout(() => {
              tryRead();
              if (!settled) {
                finish(null, new Error('Unlock window closed before recovery was confirmed'));
              }
            }, 800);
          }
        }
      } catch {
        /* cross-origin transient */
      }
    }, 400);

    const timeoutTimer = window.setTimeout(() => {
      finish(null, new Error('Recovery unlock timed out. Try again.'));
    }, timeoutMs);
  });
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
      const stepUp = await openRecoveryStepUpPopup();
      const expectedKey = opts.expectedUser.publicKey || opts.expectedUser.id;

      if (
        stepUp.publicKey &&
        expectedKey &&
        stepUp.publicKey !== expectedKey &&
        stepUp.publicKey !== opts.expectedUser.id &&
        stepUp.did !== opts.expectedUser.id
      ) {
        throw new Error('Unlocked identity does not match the active dashboard session.');
      }

      await IdentityCrypto.authenticateIdentity(
        stepUp.encryptedIdentity,
        stepUp.passcode,
        stepUp.pnName
      );

      // Prefer stored identity when it has recovery envelope / sealed shares.
      let fullIdentity: EncryptedIdentity = {
        ...stepUp.encryptedIdentity,
        publicKey: stepUp.encryptedIdentity.publicKey || stepUp.publicKey || expectedKey,
      };
      try {
        const stored =
          (await opts.loadEncryptedIdentity(expectedKey)) ||
          (await opts.loadEncryptedIdentity(opts.expectedUser.id));
        if (stored?.encryptedData && stored.iv && stored.salt) {
          fullIdentity = {
            ...fullIdentity,
            ...stored,
            publicKey: fullIdentity.publicKey || expectedKey,
          };
        }
        const { default: SimpleStorage } = await import('../utils/simpleStorage');
        const simple = await SimpleStorage.getInstance().getIdentity(expectedKey);
        const enc = simple?.encryptedData as EncryptedIdentity | undefined;
        if (enc?.encryptedData && enc.iv && enc.salt) {
          fullIdentity = { ...fullIdentity, ...enc, publicKey: fullIdentity.publicKey || expectedKey };
        }
      } catch {
        /* keep popup identity */
      }

      setAuth({
        encryptedIdentity: fullIdentity,
        pnName: stepUp.pnName,
        passcode: stepUp.passcode,
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
