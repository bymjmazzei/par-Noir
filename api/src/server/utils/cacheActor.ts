/**
 * Person key for public-cache rows.
 * The database stores the HMAC, not the DID or pn identifier, so a dump of
 * Postgres cannot join grants, subscriptions, and engagement back to a session.
 * The pepper lives in the process environment, not in the database.
 */

import { createHmac } from 'crypto';

const TEST_PEPPER = 'test-cache-actor-pepper';

function pepper(): string {
  const fromEnv = process.env.PN_CACHE_ACTOR_PEPPER?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'test') return TEST_PEPPER;
  throw new Error('PN_CACHE_ACTOR_PEPPER is required to write public-cache person rows');
}

export function cacheActorId(personKey: string): string {
  const key = personKey.trim();
  if (!key) return key;
  return createHmac('sha256', pepper()).update(key).digest('hex');
}
