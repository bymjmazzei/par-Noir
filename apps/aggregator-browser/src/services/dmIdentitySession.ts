/**
 * Messaging + authorship crypto unlock — ML-KEM (+ optional ML-DSA) in memory only.
 */

import { deriveMlKemPublicKeyFromSecretKey, type EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import {
  mergeMessagingSessionParts,
  parseMessagingHandoffFromStorage,
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
} from '@par-noir/oauth-ui';
import { clearDmSessionCache } from './dmSessionCache';
import { PNOAuthService } from './pnOAuthService';

export const IDENTITY_STORAGE_KEY = 'pn_encrypted_identity_v1';
const DM_SESSION_STORAGE_KEY = 'pn_dm_session_v1';

export interface DmIdentityState {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
  /** Durable ML-DSA from OAuth messaging handoff — Pen Mini / Note authorship. */
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
}

export interface DmSessionHandoff {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
  mlDsaPublicKey?: string;
  mlDsaSecretKey?: string;
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

/** True when in-memory session has a durable ML-DSA pair (Pen authorship). */
export function hasSigningKeys(): boolean {
  return Boolean(state?.mlDsaPublicKey && state?.mlDsaSecretKey);
}

/**
 * OAuth unlock success for browse: messaging KEM + authorship DSA.
 * Key 2 re-derive may restore KEM only; full unlock needed for DSA.
 */
export function isBrowseUnlockCryptoReady(): boolean {
  return isDmIdentityReady() && hasSigningKeys();
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
    mlDsaPublicKey: state.mlDsaPublicKey,
    mlDsaSecretKey: state.mlDsaSecretKey,
  });
}

/** Merge DSA (and missing KEM fields) from short-lived OAuth handoff stash. */
export function enrichDmSessionFromHandoffStash(): void {
  if (!state?.mlKemSecretKey) return;
  if (state.mlDsaPublicKey && state.mlDsaSecretKey) return;
  let fromStorage:
    | {
        mlKemSecretKey: string;
        mlKemPublicKey?: string;
        mlDsaSecretKey?: string;
        mlDsaPublicKey?: string;
      }
    | undefined;
  try {
    fromStorage = parseMessagingHandoffFromStorage(
      localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE)
    )?.session;
  } catch {
    fromStorage = undefined;
  }
  const merged = mergeMessagingSessionParts(
    {
      mlKemSecretKey: state.mlKemSecretKey,
      mlKemPublicKey: state.mlKemPublicKey,
      mlDsaPublicKey: state.mlDsaPublicKey,
      mlDsaSecretKey: state.mlDsaSecretKey,
    },
    fromStorage
  );
  if (!merged?.mlDsaPublicKey || !merged?.mlDsaSecretKey) return;
  state = {
    ...state,
    mlKemSecretKey: merged.mlKemSecretKey || state.mlKemSecretKey,
    mlKemPublicKey: state.mlKemPublicKey,
    mlDsaPublicKey: merged.mlDsaPublicKey,
    mlDsaSecretKey: merged.mlDsaSecretKey,
  };
  notifyDmIdentityChange();
}

/**
 * Durable ML-DSA for Pen Mini / Note authorship. No ephemeral fallback.
 * Merges from handoff stash when in-memory DSA was stripped from URL hash.
 */
export function resolveBrowseSigningKeys(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  ephemeral: boolean;
} {
  enrichDmSessionFromHandoffStash();
  if (state?.mlDsaSecretKey && state?.mlDsaPublicKey) {
    try {
      return {
        publicKey: base64ToBytes(state.mlDsaPublicKey),
        secretKey: base64ToBytes(state.mlDsaSecretKey),
        ephemeral: false,
      };
    } catch {
      throw new Error('signing_keys_invalid');
    }
  }
  throw new Error(
    'signing_keys_required — unlock again so ML-DSA keys are included in the messaging handoff'
  );
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

/** Apply ML-KEM (+ ML-DSA when present) handed off from OAuth consent (postMessage). */
export function applyDmSessionHandoff(session: DmSessionHandoff): void {
  if (!session.mlKemSecretKey) return;

  const incomingDsaPk =
    typeof session.mlDsaPublicKey === 'string' && session.mlDsaPublicKey
      ? session.mlDsaPublicKey
      : undefined;
  const incomingDsaSk =
    typeof session.mlDsaSecretKey === 'string' && session.mlDsaSecretKey
      ? session.mlDsaSecretKey
      : undefined;

  if (state?.mlKemSecretKey === session.mlKemSecretKey) {
    syncDmIdentityPublicKey();
    // Same KEM: still merge DSA if handoff (or later stash enrich) provides it.
    if (
      (incomingDsaPk && incomingDsaSk) &&
      (state.mlDsaPublicKey !== incomingDsaPk || state.mlDsaSecretKey !== incomingDsaSk)
    ) {
      state = {
        ...state,
        mlDsaPublicKey: incomingDsaPk,
        mlDsaSecretKey: incomingDsaSk,
      };
      notifyDmIdentityChange();
    }
    enrichDmSessionFromHandoffStash();
    return;
  }

  const mlKemPublicKey = resolveMlKemPublicKey(
    session.mlKemSecretKey,
    session.mlKemPublicKey
  );
  state = {
    mlKemSecretKey: session.mlKemSecretKey,
    mlKemPublicKey,
    mlDsaPublicKey: incomingDsaPk,
    mlDsaSecretKey: incomingDsaSk,
  };
  persistDmSessionToStorage({
    mlKemSecretKey: session.mlKemSecretKey,
    mlKemPublicKey,
    mlDsaPublicKey: incomingDsaPk,
    mlDsaSecretKey: incomingDsaSk,
  });
  enrichDmSessionFromHandoffStash();
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
