/**
 * Device pairing nonce storage — Redis when available, in-memory fallback for single-instance dev.
 */

import type { RedisClientType } from 'redis';
import { getCacheClient } from '../utils/cache';

export interface PairingNonceEntry {
  pnIdentifier: string;
  expiresAt: number;
  createdByDeviceId: string;
}

const NONCE_TTL_MS = 5 * 60 * 1000;
const KEY_PREFIX = 'pn:device-pairing:';

const memoryNonces = new Map<string, PairingNonceEntry>();

function redisKey(nonce: string): string {
  return `${KEY_PREFIX}${nonce}`;
}

export async function storePairingNonce(
  nonce: string,
  entry: PairingNonceEntry
): Promise<void> {
  const redis = getCacheClient();
  if (redis) {
    await redis.set(redisKey(nonce), JSON.stringify(entry), { PX: NONCE_TTL_MS });
    return;
  }
  memoryNonces.set(nonce, entry);
}

export async function consumePairingNonce(nonce: string): Promise<PairingNonceEntry | null> {
  const redis = getCacheClient() as RedisClientType | null;
  if (redis) {
    const key = redisKey(nonce);
    const raw = await redis.get(key);
    if (!raw) return null;
    await redis.del(key);
    try {
      const entry = JSON.parse(raw) as PairingNonceEntry;
      if (entry.expiresAt < Date.now()) return null;
      return entry;
    } catch {
      return null;
    }
  }

  const entry = memoryNonces.get(nonce);
  if (!entry) return null;
  memoryNonces.delete(nonce);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

export function clearMemoryPairingNoncesForTests(): void {
  memoryNonces.clear();
}
