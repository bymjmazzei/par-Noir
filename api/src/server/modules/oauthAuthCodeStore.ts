/**
 * Short-lived OAuth authorization codes — Redis when available so peek/exchange
 * work across API replicas (prefer-app broker-complete peeks the live code).
 */

import type { RedisClientType } from 'redis';
import { getCacheClient } from '../utils/cache';

/** Subset stored for cross-instance peek + exchange. */
export type AuthCodeRecord = {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  did: string;
  publicKey: string;
  pnIdentifier?: string;
  expiresAt: number;
};

const KEY_PREFIX = 'pn:oauth-code:';
const memoryCodes = new Map<string, AuthCodeRecord>();

function redisKey(code: string): string {
  return `${KEY_PREFIX}${code}`;
}

export async function putAuthCodeRecord(record: AuthCodeRecord, ttlMs: number): Promise<void> {
  memoryCodes.set(record.code, record);
  const redis = getCacheClient();
  if (!redis) return;
  const px = Math.max(1, Math.min(ttlMs, record.expiresAt - Date.now()));
  await redis.set(redisKey(record.code), JSON.stringify(record), { PX: px });
}

export async function peekAuthCodeRecord(
  code: string,
  clientId: string
): Promise<AuthCodeRecord | null> {
  const local = memoryCodes.get(code);
  if (local) {
    if (local.expiresAt < Date.now()) {
      memoryCodes.delete(code);
    } else if (local.clientId === clientId) {
      return local;
    } else {
      return null;
    }
  }

  const redis = getCacheClient() as RedisClientType | null;
  if (!redis) return null;
  const raw = await redis.get(redisKey(code));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as AuthCodeRecord;
    if (entry.expiresAt < Date.now()) {
      await redis.del(redisKey(code));
      return null;
    }
    if (entry.clientId !== clientId) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function takeAuthCodeRecord(code: string): Promise<AuthCodeRecord | null> {
  const local = memoryCodes.get(code);
  if (local) {
    memoryCodes.delete(code);
    const redis = getCacheClient();
    if (redis) {
      try {
        await redis.del(redisKey(code));
      } catch {
        /* ignore */
      }
    }
    if (local.expiresAt < Date.now()) return null;
    return local;
  }

  const redis = getCacheClient() as RedisClientType | null;
  if (!redis) return null;
  const key = redisKey(code);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  try {
    const entry = JSON.parse(raw) as AuthCodeRecord;
    if (entry.expiresAt < Date.now()) return null;
    return entry;
  } catch {
    return null;
  }
}

export function clearMemoryAuthCodesForTests(): void {
  memoryCodes.clear();
}
