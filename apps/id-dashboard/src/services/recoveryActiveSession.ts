import type { RecoveryEnvelope } from '@par-noir/recovery-crypto';

const STORAGE_KEY = 'pn_recovery_active_session';

/**
 * Claimant-side recovery in progress. Lives until the relay request expires (days), so it
 * survives closing the tab; the one-time key pair is stored separately by request id.
 */
export interface RecoveryActiveSession {
  requestId: string;
  publicKey: string;
  pnIdentifier: string;
  callbackContact: string;
  envelope: RecoveryEnvelope;
  /** sha256 of the failsafe key; the relay requires it again at release. */
  keyHash: string;
  threshold: number;
  approvalCount: number;
  status: 'pending' | 'ready' | 'expired' | 'completed';
  releaseAfter: number;
  createdAt: number;
  expiresAt: number;
}

function readRaw(): RecoveryActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecoveryActiveSession;
  } catch {
    return null;
  }
}

function writeRaw(session: RecoveryActiveSession | null): void {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function setRecoveryActiveSession(
  session: Omit<RecoveryActiveSession, 'createdAt'> & { createdAt?: number }
): RecoveryActiveSession {
  const full: RecoveryActiveSession = { ...session, createdAt: session.createdAt ?? Date.now() };
  writeRaw(full);
  return full;
}

export function getRecoveryActiveSession(): RecoveryActiveSession | null {
  const session = readRaw();
  if (!session) return null;
  if (session.expiresAt <= Date.now() || session.status === 'expired' || !session.keyHash) {
    writeRaw(null);
    return null;
  }
  return session;
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
