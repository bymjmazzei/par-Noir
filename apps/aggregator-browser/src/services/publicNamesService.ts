/**
 * Public names — browser helpers (listed names by pn, vanity resolve).
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

function getAuthHeaders(): HeadersInit {
  const session = PNOAuthService.loadSession();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  return headers;
}

export interface ListedPublicName {
  publicName: string;
  proofType: 'dns' | 'youtube' | string;
  isVanity: boolean;
}

const BY_PN_CACHE_TTL_MS = 5 * 60 * 1000;

const byPnCache = new Map<string, { names: ListedPublicName[]; expiresAt: number }>();
const byPnInFlight = new Map<string, Promise<ListedPublicName[]>>();

export async function fetchListedPublicNamesForPn(
  pnIdentifier: string
): Promise<ListedPublicName[]> {
  if (!pnIdentifier) return [];

  const cached = byPnCache.get(pnIdentifier);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.names;
  }

  const pending = byPnInFlight.get(pnIdentifier);
  if (pending) return pending;

  const fetchPromise = (async (): Promise<ListedPublicName[]> => {
    try {
      const res = await fetch(
        `${API_ENDPOINT}/api/public-names/by-pn/${encodeURIComponent(pnIdentifier)}`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { names?: ListedPublicName[] };
      const names = data.names || [];
      byPnCache.set(pnIdentifier, { names, expiresAt: Date.now() + BY_PN_CACHE_TTL_MS });
      return names;
    } catch {
      return [];
    } finally {
      byPnInFlight.delete(pnIdentifier);
    }
  })();

  byPnInFlight.set(pnIdentifier, fetchPromise);
  return fetchPromise;
}

export async function resolveVanityPublicName(
  slug: string
): Promise<{ pnIdentifier: string; publicName: string } | null> {
  const q = slug.trim().replace(/^@+/, '').toLowerCase();
  if (!q) return null;
  try {
    const params = new URLSearchParams({ q, vanity: '1' });
    const res = await fetch(`${API_ENDPOINT}/api/public-names/resolve?${params}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      profile?: { pnIdentifier: string; publicName: string } | null;
    };
    if (!data.profile?.pnIdentifier) return null;
    return {
      pnIdentifier: data.profile.pnIdentifier,
      publicName: data.profile.publicName,
    };
  } catch {
    return null;
  }
}

/** First path segment reserved for app routes — not vanity slugs. */
const RESERVED_PATH_SEGMENTS = new Set([
  '',
  'oauth',
  'callback',
  'assets',
  'static',
  'api',
  'index.html',
  'favicon.ico',
]);

export function vanitySlugFromPathname(pathname: string): string | null {
  const seg = pathname.replace(/^\//, '').split('/')[0] || '';
  if (!seg || RESERVED_PATH_SEGMENTS.has(seg.toLowerCase())) return null;
  if (seg.includes('.')) return null;
  return seg.replace(/^@+/, '').toLowerCase();
}
