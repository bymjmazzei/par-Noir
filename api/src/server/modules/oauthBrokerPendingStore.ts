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
const memoryPending = new Map<string, BrokerPendingRecord>();

function redisKey(state: string): string {
  return `${KEY_PREFIX}${state}`;
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

export function clearMemoryBrokerPendingForTests(): void {
  memoryPending.clear();
}
