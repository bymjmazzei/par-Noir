/**
 * Prefer-app OAuth broker pending — Redis when available, in-memory for single-instance.
 * Unlock POSTs complete; browse/Messages GETs pending by OAuth state.
 */

import type { RedisClientType } from 'redis';
import { getCacheClient } from '../utils/cache';

export type BrokerPendingRecord = {
  clientId: string;
  payload: Record<string, unknown>;
  expiresAt: number;
};

const KEY_PREFIX = 'pn:oauth-broker:';
const LAUNCH_PREFIX = 'pn:oauth-broker-launched:';
const memoryPending = new Map<string, BrokerPendingRecord>();
const memoryLaunched = new Map<string, BrokerPendingRecord>();

function redisKey(state: string): string {
  return `${KEY_PREFIX}${state}`;
}

function launchKey(state: string): string {
  return `${LAUNCH_PREFIX}${state}`;
}

export async function storeBrokerPendingRecord(
  state: string,
  record: BrokerPendingRecord,
  ttlMs: number
): Promise<void> {
  const redis = getCacheClient();
  if (redis) {
    const px = Math.max(1, Math.min(ttlMs, record.expiresAt - Date.now()));
    await redis.set(redisKey(state), JSON.stringify(record), { PX: px });
    return;
  }
  memoryPending.set(state, record);
}

export async function takeBrokerPendingRecord(
  state: string,
  clientId: string
): Promise<Record<string, unknown> | null> {
  const redis = getCacheClient() as RedisClientType | null;
  if (redis) {
    const key = redisKey(state);
    const raw = await redis.get(key);
    if (!raw) return null;
    await redis.del(key);
    try {
      const entry = JSON.parse(raw) as BrokerPendingRecord;
      if (entry.expiresAt < Date.now()) return null;
      if (entry.clientId !== clientId) return null;
      return entry.payload;
    } catch {
      return null;
    }
  }

  const pending = memoryPending.get(state);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) {
    memoryPending.delete(state);
    return null;
  }
  if (pending.clientId !== clientId) return null;
  memoryPending.delete(state);
  return pending.payload;
}

/** Unlock app received the deep link. Separate from the completion record. Does not require a code. */
export async function storeBrokerLaunched(state: string, clientId: string, ttlMs: number): Promise<void> {
  const record: BrokerPendingRecord = {
    clientId,
    payload: { launched: true },
    expiresAt: Date.now() + ttlMs,
  };
  const redis = getCacheClient();
  if (redis) {
    const px = Math.max(1, Math.min(ttlMs, record.expiresAt - Date.now()));
    await redis.set(launchKey(state), JSON.stringify(record), { PX: px });
    return;
  }
  memoryLaunched.set(state, record);
}

/** Read the launch claim. Does not delete the completion record. */
export async function readBrokerLaunched(state: string, clientId: string): Promise<boolean> {
  const redis = getCacheClient() as RedisClientType | null;
  if (redis) {
    const raw = await redis.get(launchKey(state));
    if (!raw) return false;
    try {
      const entry = JSON.parse(raw) as BrokerPendingRecord;
      if (entry.expiresAt < Date.now()) return false;
      return entry.clientId === clientId;
    } catch {
      return false;
    }
  }
  const pending = memoryLaunched.get(state);
  if (!pending) return false;
  if (pending.expiresAt < Date.now()) {
    memoryLaunched.delete(state);
    return false;
  }
  return pending.clientId === clientId;
}

export function clearMemoryBrokerPendingForTests(): void {
  memoryPending.clear();
  memoryLaunched.clear();
}
