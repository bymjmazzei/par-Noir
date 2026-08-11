/**
 * Opaque mailbox route keys — cross-cloud throughway addressing without clear pn columns.
 * Server binding is SoT: dashboard and browser converge via GET/POST /api/mailbox/route.
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

export interface MailboxRouteApiContext {
  apiBaseUrl: string;
  authToken: string;
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Record<string, string> | Promise<Record<string, string>>;
}

async function mergeAuthHeaders(
  api: MailboxRouteApiContext,
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, string>> {
  const extra = api.buildAuthHeaders ? await api.buildAuthHeaders(method, path, body) : {};
  return {
    Authorization: `Bearer ${api.authToken}`,
    Accept: 'application/json',
    ...extra
  };
}

/** Fetch the authoritative inbox route for this identity from the server. */
export async function fetchMailboxRoute(
  identityId: string,
  api: MailboxRouteApiContext
): Promise<string | null> {
  const base = api.apiBaseUrl.replace(/\/$/, '');
  const path = `/api/mailbox/route?pnIdentifier=${encodeURIComponent(identityId)}`;
  const res = await fetch(`${base}${path}`, {
    headers: await mergeAuthHeaders(api, 'GET', path)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`mailbox route get failed: HTTP ${res.status}`);
  const body = (await res.json()) as { routeKey?: string };
  return isMailboxRouteKey(body.routeKey) ? body.routeKey!.trim() : null;
}

/**
 * Claim (or adopt) an opaque route. Server returns the authoritative key so a
 * second client mint converges on the first claim.
 */
export async function claimMailboxRouteKey(
  identityId: string,
  routeKey: string,
  api: MailboxRouteApiContext
): Promise<string> {
  const base = api.apiBaseUrl.replace(/\/$/, '');
  const path = '/api/mailbox/route';
  const body = { pnIdentifier: identityId, routeKey };
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      ...(await mergeAuthHeaders(api, 'POST', path, body)),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`mailbox route claim failed: HTTP ${res.status}`);
  const parsed = (await res.json()) as { routeKey?: string };
  if (!isMailboxRouteKey(parsed.routeKey)) {
    throw new Error('mailbox route claim returned invalid routeKey');
  }
  return parsed.routeKey.trim();
}

/**
 * Load or mint the identity's inbox route, syncing with server SoT when api is
 * provided so dashboard and browser share one claimed route.
 */
export async function ensureMailboxRouteKey(
  identityId: string,
  session: SealSession,
  api?: MailboxRouteApiContext
): Promise<string> {
  if (api) {
    const remote = await fetchMailboxRoute(identityId, api).catch(() => null);
    if (remote) {
      await saveMailboxRouteKey(identityId, session, remote);
      return remote;
    }
    const local = (await loadMailboxRouteKey(identityId, session)) || mintMailboxRouteKey();
    const authoritative = await claimMailboxRouteKey(identityId, local, api);
    await saveMailboxRouteKey(identityId, session, authoritative);
    return authoritative;
  }

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
