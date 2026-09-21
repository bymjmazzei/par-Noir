/**
 * Messaging crypto unlock — ML-KEM secret in memory only.
 */

import { unlockIdentityMlKemSecret, deriveMlKemPublicKeyFromSecretKey, type EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import { clearDmSessionCache } from './dmSessionCache';
import { PNOAuthService } from './pnOAuthService';

export const IDENTITY_STORAGE_KEY = 'pn_encrypted_identity_v1';
const DM_SESSION_STORAGE_KEY = 'pn_dm_session_v1';

export interface DmIdentityState {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
  pnName: string;
  /** In-memory only for client seals (e.g. device privateDisplay); never persisted. */
  passcode: string;
}

export interface DmSessionHandoff {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
}

let state: DmIdentityState | null = null;
let publishedMlKemPublicKey: string | null = null;
let publishMlKemInflight: Promise<void> | null = null;

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

/** Always false — ML-KEM is memory-only; browser reload ends the unlock session. */
export function hasRestorableDmSession(): boolean {
  return false;
}

export function needsMessagingIdentityHandoff(): boolean {
  return !hasStoredEncryptedIdentity() || !isDmIdentityReady();
}

export function getDmIdentity(): DmIdentityState {
  if (!state) {
    throw new Error('Messaging identity not unlocked');
  }
  return state;
}

function resolveMlKemPublicKey(secretKey: string, _publicKey?: string): string {
  return deriveMlKemPublicKeyFromSecretKey(secretKey);
}

function syncDmIdentityPublicKey(): void {
  if (!state?.mlKemSecretKey) return;
  const derived = resolveMlKemPublicKey(state.mlKemSecretKey, state.mlKemPublicKey);
  if (state.mlKemPublicKey === derived) return;
  state = { ...state, mlKemPublicKey: derived };
  persistDmSessionToStorage({
    mlKemSecretKey: state.mlKemSecretKey,
    mlKemPublicKey: derived,
  });
}

/** ML-KEM public key for connection send — always derived from the unlocked secret key. */
export function getMessagingMlKemPublicKey(): string | undefined {
  if (!state?.mlKemSecretKey) return undefined;
  syncDmIdentityPublicKey();
  return state?.mlKemPublicKey;
}

/** No-op: ML-KEM must not survive browser reload (security). */
function persistDmSessionToStorage(_session: DmSessionHandoff): void {
  clearDmSessionStorage();
}

function clearDmSessionStorage(): void {
  try {
    sessionStorage.removeItem(DM_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Browser reload ends the unlock session — never rehydrate ML-KEM from storage.
 * Clears any legacy `pn_dm_session_v1` residue. Returns true only if already in memory.
 */
export function restoreDmSessionFromStorage(): boolean {
  clearDmSessionStorage();
  return state !== null;
}

/** Apply ML-KEM keys handed off from OAuth consent (postMessage). */
export function applyDmSessionHandoff(session: DmSessionHandoff): void {
  if (!session.mlKemSecretKey) return;
  if (state?.mlKemSecretKey === session.mlKemSecretKey) {
    syncDmIdentityPublicKey();
    return;
  }
  const mlKemPublicKey = resolveMlKemPublicKey(
    session.mlKemSecretKey,
    session.mlKemPublicKey
  );
  state = {
    mlKemSecretKey: session.mlKemSecretKey,
    mlKemPublicKey,
    pnName: state?.pnName || '',
    passcode: state?.passcode || '',
  };
  persistDmSessionToStorage({ mlKemSecretKey: session.mlKemSecretKey, mlKemPublicKey });
  void publishMlKemPublicKey(mlKemPublicKey).catch(() => {});
  notifyDmIdentityChange();
}

export function clearDmIdentity(): void {
  state = null;
  publishedMlKemPublicKey = null;
  publishMlKemInflight = null;
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
  const existing = loadStoredIdentity();
  if (existing && JSON.stringify(existing) === JSON.stringify(payload)) {
    return;
  }
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
  const mlKemPublicKey = secrets.mlKemPublicKey!;
  state = {
    mlKemSecretKey: secrets.mlKemSecretKey,
    mlKemPublicKey,
    pnName: secrets.pnName || pnName,
    passcode,
  };
  persistDmSessionToStorage({
    mlKemSecretKey: secrets.mlKemSecretKey,
    mlKemPublicKey
  });
  void publishMlKemPublicKey(mlKemPublicKey).catch(() => {});

  // Single post-unlock promote owner (send path also promotes per message).
  // Not invoked from mailbox drain — keeps inbox paint off the promote critical path.
  void (async () => {
    try {
      const session = PNOAuthService.loadSession();
      const pn = session?.pnIdentifier;
      if (pn) {
        const { promoteSenderOutbox } = await import('./messageService');
        await promoteSenderOutbox(pn);
      }
    } catch {
      /* non-blocking */
    }
  })();

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
  if (!mlKemPublicKey) return;
  if (publishedMlKemPublicKey === mlKemPublicKey) return;
  if (publishMlKemInflight) return publishMlKemInflight;

  publishMlKemInflight = (async () => {
    const session = PNOAuthService.loadSession();
    const pnIdentifier = session?.pnIdentifier;
    if (!pnIdentifier) return;

    const { ownerFetch } = await import('./ownerApiFetch');
    const response = await ownerFetch('POST', '/api/profile/ml-kem-public-key', {
      userPnIdentifier: pnIdentifier,
      mlKemPublicKey
    });
    if (response.ok) {
      publishedMlKemPublicKey = mlKemPublicKey;
      return;
    }
    throw new Error(`publish ml-kem-public-key failed: ${response.status}`);
  })().finally(() => {
    publishMlKemInflight = null;
  });

  return publishMlKemInflight;
}

/** Retry profile publish after vault hydrate / OAuth session ready. */
export async function retryPublishMlKemPublicKey(): Promise<void> {
  const mlKemPublicKey = getMessagingMlKemPublicKey();
  if (!mlKemPublicKey) return;
  try {
    await publishMlKemPublicKey(mlKemPublicKey);
  } catch {
    /* non-blocking — will retry on next unlock / credentials-ready */
  }
}
