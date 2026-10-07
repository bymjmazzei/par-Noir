import { withPnPrefix } from './normalize.js';

/** Canonical pN volume id: pn- + 12 hex chars (public-key hash). */
export const MESSAGING_CONNECT_PN_ID_RE = /^pn-[0-9a-f]{12}$/i;

export function normalizeConnectPnIdentifier(pnIdentifier: string): string {
  const trimmed = String(pnIdentifier || '').trim();
  if (!trimmed) return '';
  return withPnPrefix(trimmed.toLowerCase());
}

export function buildMessagingConnectUrl(origin: string, pnIdentifier: string): string {
  const base = String(origin || '').replace(/\/$/, '');
  const pn = normalizeConnectPnIdentifier(pnIdentifier);
  if (!pn) return base;
  return `${base}/connect/${encodeURIComponent(pn)}`;
}

export type MessagingConnectPath =
  | { kind: 'pn'; pnIdentifier: string }
  | { kind: 'vanity'; slug: string };

/**
 * Parse `/connect/{segment}` — pN id (no API) or vanity slug (resolve via public-names).
 */
export function parseMessagingConnectPath(pathname: string): MessagingConnectPath | null {
  const parts = pathname.replace(/^\//, '').split('/').filter(Boolean);
  if (parts[0]?.toLowerCase() !== 'connect' || !parts[1]) return null;
  let segment = parts[1];
  try {
    segment = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (segment.includes('.')) return null;
  const slug = segment.replace(/^@+/, '').toLowerCase();
  if (!slug) return null;
  if (MESSAGING_CONNECT_PN_ID_RE.test(slug)) {
    return { kind: 'pn', pnIdentifier: slug };
  }
  return { kind: 'vanity', slug };
}
