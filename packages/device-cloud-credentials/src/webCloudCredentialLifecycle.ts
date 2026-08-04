import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { sealCredentials, unsealCredentials } from './seal.js';
import { WebSealedStore } from './stores/webSealedStore.js';
import type { SealSession, SealedEnvelope } from './types.js';
import {
  clearSessionCloudCredentials,
  getSessionCloudCredentials,
  setSessionCloudCredentials
} from './sessionMemory.js';

const defaultStore = new WebSealedStore();
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type PersistCloudCredentialsMode = 'session' | 'sealed';

/**
 * Web browser persist mode (browsers are never keyed installs):
 * - No keyed devices yet → durable sealed store across unlocks (Case A)
 * - Keyed apps exist → session only; wipe sealed on lock (Case B unkeyed web)
 */
export function resolveCloudPersistMode(opts: {
  hasKeyedDevices: boolean;
}): PersistCloudCredentialsMode {
  return opts.hasKeyedDevices ? 'session' : 'sealed';
}

/**
 * Whether sealed cloud creds should survive lock on this web session.
 * Wipe only in Case B (keyed devices exist elsewhere; this web session is unkeyed).
 */
export function shouldRetainSealedCloudOnLock(opts: {
  hasKeyedDevices: boolean;
}): boolean {
  return !opts.hasKeyedDevices;
}

/**
 * Persist cloud credentials for this unlock.
 * - `session`: memory only (wiped on lock)
 * - `sealed`: durable web sealed store (no grace TTL — survives lock until Case B wipe)
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
  // Durable seal: no expiresAt (matches native). Do not schedule grace wipe.
  const envelope = await sealCredentials(credentials, session, null);
  await store.set(identityId, envelope);
  cancelGraceWipe(identityId);
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
  cancelGraceWipe(identityId);
}

/**
 * Lock / logout cloud credential policy for web:
 * - Case A (!hasKeyedDevices): keep sealed store for next unlock
 * - Case B (hasKeyedDevices): wipe sealed + session (unkeyed web)
 *
 * `isKeyedSession` retained for native/keyed-web legacy callers: if true, always retain sealed.
 */
export async function clearCloudCredentialsOnLock(opts: {
  identityId: string;
  isKeyedSession?: boolean;
  hasKeyedDevices?: boolean;
  store?: WebSealedStore;
}): Promise<void> {
  clearSessionCloudCredentials(opts.identityId);
  // Keyed install always retains. Else Case A (!hasKeyedDevices) retains.
  // Legacy callers that only pass isKeyedSession:false still wipe.
  const retain =
    opts.isKeyedSession === true ||
    (typeof opts.hasKeyedDevices === 'boolean' && !opts.hasKeyedDevices);
  if (!retain) {
    await wipeSealedCloudCredentials(opts.identityId, opts.store);
  }
}

function cancelGraceWipe(identityId: string): void {
  const t = graceTimers.get(identityId);
  if (t) {
    clearTimeout(t);
    graceTimers.delete(identityId);
  }
}
