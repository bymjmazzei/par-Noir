/**
 * Messaging crypto unlock — ML-KEM secret in memory only.
 */

import { unlockIdentityMlKemSecret, type EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import { clearDmSessionCache } from './dmSessionCache';
import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';

export const IDENTITY_STORAGE_KEY = 'pn_encrypted_identity_v1';
const DM_SESSION_STORAGE_KEY = 'pn_dm_session_v1';

export interface DmIdentityState {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
  pnName: string;
}

export interface DmSessionHandoff {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
}

let state: DmIdentityState | null = null;

export const DM_IDENTITY_CHANGE_EVENT = 'pn_dm_identity_change';

function notifyDmIdentityChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DM_IDENTITY_CHANGE_EVENT));
  }
}

export function isDmIdentityReady(): boolean {
  return state !== null;
}

export function hasStoredEncryptedIdentity(): boolean {
  return loadStoredIdentity() !== null;
}

export function hasRestorableDmSession(): boolean {
  try {
    const raw = sessionStorage.getItem(DM_SESSION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as DmSessionHandoff;
    return typeof parsed.mlKemSecretKey === 'string' && parsed.mlKemSecretKey.length > 0;
  } catch {
    return false;
  }
}

export function needsMessagingIdentityHandoff(): boolean {
  return !hasStoredEncryptedIdentity() || (!isDmIdentityReady() && !hasRestorableDmSession());
}

export function getDmIdentity(): DmIdentityState {
  if (!state) {
    throw new Error('Messaging identity not unlocked');
  }
  return state;
}

function persistDmSessionToStorage(session: DmSessionHandoff): void {
  try {
    sessionStorage.setItem(
      DM_SESSION_STORAGE_KEY,
      JSON.stringify({
        mlKemSecretKey: session.mlKemSecretKey,
        mlKemPublicKey: session.mlKemPublicKey
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function clearDmSessionStorage(): void {
  try {
    sessionStorage.removeItem(DM_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Restore ML-KEM session from sessionStorage after tab refresh. */
export function restoreDmSessionFromStorage(): boolean {
  if (state) return true;
  try {
    const raw = sessionStorage.getItem(DM_SESSION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as DmSessionHandoff;
    if (!parsed.mlKemSecretKey) return false;
    state = {
      mlKemSecretKey: parsed.mlKemSecretKey,
      mlKemPublicKey: parsed.mlKemPublicKey,
      pnName: ''
    };
    if (parsed.mlKemPublicKey) {
      void publishMlKemPublicKey(parsed.mlKemPublicKey).catch(() => {});
    }
    notifyDmIdentityChange();
    return true;
  } catch {
    return false;
  }
}

/** Apply ML-KEM keys handed off from OAuth consent (postMessage). */
export function applyDmSessionHandoff(session: DmSessionHandoff): void {
  if (!session.mlKemSecretKey) return;
  state = {
    mlKemSecretKey: session.mlKemSecretKey,
    mlKemPublicKey: session.mlKemPublicKey,
    pnName: ''
  };
  persistDmSessionToStorage(session);
  if (session.mlKemPublicKey) {
    void publishMlKemPublicKey(session.mlKemPublicKey).catch(() => {});
  }
  notifyDmIdentityChange();
}

export function clearDmIdentity(): void {
  state = null;
  clearDmSessionCache();
  clearDmSessionStorage();
  notifyDmIdentityChange();
}

function loadStoredIdentity(): EncryptedIdentityPayload | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EncryptedIdentityPayload;
  } catch {
    return null;
  }
}

/** Call after OAuth if identity blob was stored locally during consent. */
export function storeEncryptedIdentityForMessaging(payload: EncryptedIdentityPayload): void {
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
  notifyDmIdentityChange();
}

export async function unlockDmIdentity(pnName: string, passcode: string): Promise<DmIdentityState> {
  const payload = loadStoredIdentity();
  if (!payload?.encryptedData || !payload.salt || !payload.iv) {
    throw new Error(
      'No local identity for messaging. Lock your pN and unlock again with your identity file.'
    );
  }
  const secrets = await unlockIdentityMlKemSecret(payload, pnName, passcode);
  state = {
    mlKemSecretKey: secrets.mlKemSecretKey,
    mlKemPublicKey: secrets.mlKemPublicKey,
    pnName: secrets.pnName || pnName
  };
  persistDmSessionToStorage({
    mlKemSecretKey: secrets.mlKemSecretKey,
    mlKemPublicKey: secrets.mlKemPublicKey
  });
  if (secrets.mlKemPublicKey) {
    void publishMlKemPublicKey(secrets.mlKemPublicKey).catch(() => {});
  }

  void (async () => {
    try {
      const handoffRaw = sessionStorage.getItem('pn_identity_migration_kem_handoff');
      if (!handoffRaw) return;
      const handoff = JSON.parse(handoffRaw) as {
        migrationId: string;
        predecessorMlKemSecretKey: string;
        predecessorMlKemPublicKey: string;
        successorMlKemSecretKey: string;
        successorMlKemPublicKey: string;
      };
      const session = PNOAuthService.loadSession();
      if (!session?.accessToken) return;
      const { migrateConnectionsOnUnlock } = await import('./identityMigrationBridge');
      await migrateConnectionsOnUnlock({
        predecessorMlKemSecretKey: handoff.predecessorMlKemSecretKey,
        predecessorMlKemPublicKey: handoff.predecessorMlKemPublicKey,
        successorMlKemSecretKey: handoff.successorMlKemSecretKey,
        successorMlKemPublicKey: handoff.successorMlKemPublicKey,
        authToken: session.accessToken,
      });
      const { ackMigrationStep } = await import('./identityMigrationApiClient');
      await ackMigrationStep(session.accessToken, handoff.migrationId, 'dm_rekey').catch(() => {});
      await ackMigrationStep(session.accessToken, handoff.migrationId, 'group_rewrap').catch(() => {});
      sessionStorage.removeItem('pn_identity_migration_kem_handoff');
    } catch {
      /* non-blocking */
    }
  })();

  notifyDmIdentityChange();
  return state;
}

async function publishMlKemPublicKey(mlKemPublicKey: string): Promise<void> {
  const session = PNOAuthService.loadSession();
  const pnIdentifier = session?.pnIdentifier;
  if (!pnIdentifier) return;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  await fetch(`${API_ENDPOINT}/api/profile/ml-kem-public-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userPnIdentifier: pnIdentifier, mlKemPublicKey })
  });
}
