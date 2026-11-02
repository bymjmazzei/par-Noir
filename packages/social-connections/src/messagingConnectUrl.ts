import { isPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { withPnPrefix } from './normalize.js';

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
  if (isPnIdentifier(slug)) {
    return { kind: 'pn', pnIdentifier: slug };
  }
  return { kind: 'vanity', slug };
}
