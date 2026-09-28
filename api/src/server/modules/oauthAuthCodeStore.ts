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
const CHALLENGE_PREFIX = 'pn:oauth-challenge:';
const memoryCodes = new Map<string, AuthCodeRecord>();
const memoryChallenges = new Map<string, UnlockChallengeRecord>();

function redisKey(code: string): string {
  return `${KEY_PREFIX}${code}`;
}

function challengeKey(challengeId: string): string {
  return `${CHALLENGE_PREFIX}${challengeId}`;
}

export type UnlockChallengeRecord = {
  challengeId: string;
  challenge: string;
  clientId: string;
  redirectUri: string;
  expiresAt: number;
};

function cacheClient(): RedisClientType | null {
  return getCacheClient() as RedisClientType | null;
}

/** Production never falls back to process memory. Dev and tests may. */
function memoryAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function assertStoreAvailable(): RedisClientType | null {
  const redis = cacheClient();
  if (redis) return redis;
  if (!memoryAllowed()) {
    throw new Error('Redis is required for short-lived OAuth records in production');
  }
  return null;
}

export async function putAuthCodeRecord(record: AuthCodeRecord, ttlMs: number): Promise<void> {
  const redis = assertStoreAvailable();
  const px = Math.max(1, Math.min(ttlMs, record.expiresAt - Date.now()));
  if (!redis) {
    memoryCodes.set(record.code, record);
    return;
  }
  await redis.set(redisKey(record.code), JSON.stringify(record), { PX: px });
}

export async function peekAuthCodeRecord(
  code: string,
  clientId: string
): Promise<AuthCodeRecord | null> {
  const redis = cacheClient();
  if (redis) {
    const raw = await redis.get(redisKey(code));
    if (!raw) return null;
    return parseAuthCode(raw, clientId, async () => {
      await redis.del(redisKey(code));
    });
  }
  if (!memoryAllowed()) return null;
  const local = memoryCodes.get(code);
  if (!local) return null;
  if (local.expiresAt < Date.now()) {
    memoryCodes.delete(code);
    return null;
  }
  if (local.clientId !== clientId) return null;
  return local;
}

export async function takeAuthCodeRecord(code: string): Promise<AuthCodeRecord | null> {
  const redis = cacheClient();
  if (redis) {
    const raw = await redisGetDel(redis, redisKey(code));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as AuthCodeRecord;
      if (entry.expiresAt < Date.now()) return null;
      return entry;
    } catch {
      return null;
    }
  }
  if (!memoryAllowed()) return null;
  const local = memoryCodes.get(code);
  if (!local) return null;
  memoryCodes.delete(code);
  if (local.expiresAt < Date.now()) return null;
  return local;
}

export async function putUnlockChallengeRecord(
  record: UnlockChallengeRecord,
  ttlMs: number
): Promise<void> {
  const redis = assertStoreAvailable();
  const px = Math.max(1, Math.min(ttlMs, record.expiresAt - Date.now()));
  if (!redis) {
    memoryChallenges.set(record.challengeId, record);
    return;
  }
  await redis.set(challengeKey(record.challengeId), JSON.stringify(record), { PX: px });
}

/** Atomic single use. A second caller, even one that does not share memory, gets null. */
export async function takeUnlockChallengeRecord(
  challengeId: string
): Promise<UnlockChallengeRecord | null> {
  const redis = cacheClient();
  if (redis) {
    const raw = await redisGetDel(redis, challengeKey(challengeId));
    if (!raw) return null;
    try {
      const entry = JSON.parse(raw) as UnlockChallengeRecord;
      if (entry.expiresAt < Date.now()) return null;
      return entry;
    } catch {
      return null;
    }
  }
  if (!memoryAllowed()) return null;
  const local = memoryChallenges.get(challengeId);
  if (!local) return null;
  memoryChallenges.delete(challengeId);
  if (local.expiresAt < Date.now()) return null;
  return local;
}

async function redisGetDel(redis: RedisClientType, key: string): Promise<string | null> {
  if (typeof redis.getDel === 'function') {
    const raw = await redis.getDel(key);
    return raw == null ? null : String(raw);
  }
  const raw = await redis.get(key);
  if (raw == null) return null;
  await redis.del(key);
  return String(raw);
}

async function parseAuthCode(
  raw: string,
  clientId: string,
  drop: () => Promise<void>
): Promise<AuthCodeRecord | null> {
  try {
    const entry = JSON.parse(raw) as AuthCodeRecord;
    if (entry.expiresAt < Date.now()) {
      await drop();
      return null;
    }
    if (entry.clientId !== clientId) return null;
    return entry;
  } catch {
    return null;
  }
}

export function clearMemoryAuthCodesForTests(): void {
  memoryCodes.clear();
  memoryChallenges.clear();
}
