import type { EncryptedIdentity } from '@par-noir/identity-crypto';

const RECOVERY_AUTH_TTL_MS = 15 * 60 * 1000;

export interface RecoveryAuthSession {
  encryptedIdentity: EncryptedIdentity;
  /** Absent after an Unlock-app re-auth: Key 1 and Key 2 stay in Unlock. */
  pnName?: string;
  passcode?: string;
  expiresAt: number;
}

let activeSession: RecoveryAuthSession | null = null;

export function setRecoveryAuthSession(session: RecoveryAuthSession | null): void {
  activeSession = session;
}

export function getRecoveryAuthSession(): RecoveryAuthSession | null {
  if (!activeSession || activeSession.expiresAt <= Date.now()) {
    return null;
  }
  return activeSession;
}

export function recoveryAuthRequiredMessage(): string {
  return 'Unlock recovery (Unlock button above) before changing recovery settings.';
}

export { RECOVERY_AUTH_TTL_MS };
