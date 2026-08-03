import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { sealCredentials, unsealCredentials } from './seal.js';
import { WebSealedStore } from './stores/webSealedStore.js';
import { WEB_GRACE_TTL_MS, type SealSession, type SealedEnvelope } from './types.js';
import {
  clearSessionCloudCredentials,
  getSessionCloudCredentials,
  setSessionCloudCredentials
} from './sessionMemory.js';

const defaultStore = new WebSealedStore();
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type PersistCloudCredentialsMode = 'session' | 'sealed';

/**
 * Persist cloud credentials for this unlock.
 * - `session`: memory only (unkeyed — wiped on lock)
 * - `sealed`: web sealed store + grace TTL (keyed — survives lock)
 */
export async function persistCloudCredentials(opts: {
  identityId: string;
  credentials: StorageCredentialsEnvelope;
  session: SealSession;
  mode: PersistCloudCredentialsMode;
  store?: WebSealedStore;
}): Promise<SealedEnvelope | null> {
  const { identityId, credentials, session, mode } = opts;
  setSessionCloudCredentials(identityId, credentials);
  if (mode === 'session') {
    return null;
  }
  const store = opts.store ?? defaultStore;
  const expiresAt = new Date(Date.now() + WEB_GRACE_TTL_MS).toISOString();
  const envelope = await sealCredentials(credentials, session, expiresAt);
  await store.set(identityId, envelope);
  scheduleGraceWipe(identityId, WEB_GRACE_TTL_MS, store);
  return envelope;
}

export async function loadLocalCloudCredentials(opts: {
  identityId: string;
  session: SealSession;
  store?: WebSealedStore;
}): Promise<StorageCredentialsEnvelope | null> {
  const fromMemory = getSessionCloudCredentials(opts.identityId);
  if (fromMemory) return fromMemory;
  const store = opts.store ?? defaultStore;
  const envelope = await store.get(opts.identityId);
  if (!envelope) return null;
  try {
    const opened = await unsealCredentials<StorageCredentialsEnvelope>(envelope, opts.session);
    setSessionCloudCredentials(opts.identityId, opened);
    return opened;
  } catch {
    return null;
  }
}

export async function wipeSealedCloudCredentials(
  identityId: string,
  store?: WebSealedStore
): Promise<void> {
  const s = store ?? defaultStore;
  await s.clear(identityId);
  const t = graceTimers.get(identityId);
  if (t) {
    clearTimeout(t);
    graceTimers.delete(identityId);
  }
}

/**
 * Lock / logout cloud credential policy:
 * - Unkeyed: wipe sealed store + session memory
 * - Keyed: clear session memory only; sealed store kept for next unlock
 */
export async function clearCloudCredentialsOnLock(opts: {
  identityId: string;
  isKeyedSession: boolean;
  store?: WebSealedStore;
}): Promise<void> {
  clearSessionCloudCredentials(opts.identityId);
  if (!opts.isKeyedSession) {
    await wipeSealedCloudCredentials(opts.identityId, opts.store);
  }
}

function scheduleGraceWipe(identityId: string, ttlMs: number, store: WebSealedStore): void {
  const prev = graceTimers.get(identityId);
  if (prev) clearTimeout(prev);
  graceTimers.set(
    identityId,
    setTimeout(() => {
      void wipeSealedCloudCredentials(identityId, store);
      clearSessionCloudCredentials(identityId);
      graceTimers.delete(identityId);
    }, ttlMs)
  );
}
