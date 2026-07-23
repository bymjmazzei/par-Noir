/**
 * Opaque mailbox route keys — cross-cloud throughway addressing without clear pn columns.
 * Each identity mints a high-entropy key; peers store it on connection rows as peerMailboxRouteKey.
 */

import type { SealedEnvelope, SealSession } from './types.js';
import { sealCredentials, unsealCredentials } from './seal.js';

const LOCAL_KEY_PREFIX = 'pn_mailbox_route_v1:';
const ROUTE_KEY_BYTES = 32;

function storageKey(identityId: string): string {
  return `${LOCAL_KEY_PREFIX}${identityId}`;
}

/** Mint a new opaque route key (hex). */
export function mintMailboxRouteKey(): string {
  const bytes = new Uint8Array(ROUTE_KEY_BYTES);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isMailboxRouteKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

export async function loadMailboxRouteKey(
  identityId: string,
  session: SealSession
): Promise<string | null> {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(storageKey(identityId));
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as SealedEnvelope;
    const bag = await unsealCredentials<{ routeKey?: string }>(envelope, session);
    return isMailboxRouteKey(bag?.routeKey) ? bag.routeKey.trim() : null;
  } catch {
    return null;
  }
}

export async function saveMailboxRouteKey(
  identityId: string,
  session: SealSession,
  routeKey: string
): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  if (!isMailboxRouteKey(routeKey)) {
    throw new Error('invalid mailbox route key');
  }
  const envelope = await sealCredentials({ routeKey: routeKey.trim() }, session, null);
  localStorage.setItem(storageKey(identityId), JSON.stringify(envelope));
}

/** Load or mint+persist the identity's inbox route key. */
export async function ensureMailboxRouteKey(
  identityId: string,
  session: SealSession
): Promise<string> {
  const existing = await loadMailboxRouteKey(identityId, session);
  if (existing) return existing;
  const minted = mintMailboxRouteKey();
  await saveMailboxRouteKey(identityId, session, minted);
  return minted;
}

export async function clearMailboxRouteKey(identityId: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(identityId));
}
