import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import type { RecoveryEnvelope } from '@par-noir/recovery-crypto';

const RECOVERY_ACTIVE_SESSION_TTL_MS = 20 * 60 * 1000;
const STORAGE_KEY = 'pn_recovery_active_session';

export interface RecoveryActiveSession {
  requestId: string;
  publicKey: string;
  pnIdentifier: string;
  callbackContact: string;
  envelope: RecoveryEnvelope;
  /** Present for .pn initiate path; failsafe key path may omit until Continue. */
  existingIdentity?: EncryptedIdentity;
  threshold: number;
  approvalCount: number;
  status: 'pending' | 'ready' | 'expired' | 'completed';
  createdAt: number;
  expiresAt: number;
}

function readRaw(): RecoveryActiveSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecoveryActiveSession;
  } catch {
    return null;
  }
}

function writeRaw(session: RecoveryActiveSession | null): void {
  if (!session) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function setRecoveryActiveSession(
  session: Omit<RecoveryActiveSession, 'createdAt' | 'expiresAt'> & {
    createdAt?: number;
    expiresAt?: number;
  }
): RecoveryActiveSession {
  const now = Date.now();
  const full: RecoveryActiveSession = {
    ...session,
    createdAt: session.createdAt ?? now,
    expiresAt: session.expiresAt ?? now + RECOVERY_ACTIVE_SESSION_TTL_MS,
  };
  writeRaw(full);
  return full;
}

export function getRecoveryActiveSession(): RecoveryActiveSession | null {
  const session = readRaw();
  if (!session) return null;
  if (session.expiresAt <= Date.now() || session.status === 'expired') {
    writeRaw(null);
    return null;
  }
  return session;
}

export function touchRecoveryActiveSession(): RecoveryActiveSession | null {
  const session = getRecoveryActiveSession();
  if (!session) return null;
  const updated = {
    ...session,
    expiresAt: Date.now() + RECOVERY_ACTIVE_SESSION_TTL_MS,
  };
  writeRaw(updated);
  return updated;
}

export function updateRecoveryActiveSession(
  patch: Partial<RecoveryActiveSession>
): RecoveryActiveSession | null {
  const session = getRecoveryActiveSession();
  if (!session) return null;
  const updated = { ...session, ...patch };
  writeRaw(updated);
  return updated;
}

export function clearRecoveryActiveSession(): void {
  writeRaw(null);
}

export function recoveryActiveSessionRemainingMs(): number {
  const session = getRecoveryActiveSession();
  if (!session) return 0;
  return Math.max(0, session.expiresAt - Date.now());
}

export { RECOVERY_ACTIVE_SESSION_TTL_MS };
