/**
 * Pen verified-author allowlist matching (OAuth pn_identifier aliases).
 * Used by Pen client (VITE) and API (PEN_VERIFIED_AUTHOR_PN_IDS).
 */

import { PN_DID_PREFIX, PN_IDENTIFIER_PREFIX } from '@par-noir/pqc-crypto/oauth-unlock-proof';

/** The bare key hash shared by `pn-<hash>` and `did:pn:<hash>`. */
function pnHash(value: string): string {
  const t = String(value || '').trim().toLowerCase();
  if (t.startsWith(PN_DID_PREFIX)) return t.slice(PN_DID_PREFIX.length);
  if (t.startsWith(PN_IDENTIFIER_PREFIX)) return t.slice(PN_IDENTIFIER_PREFIX.length);
  return t;
}

export function pnIdAliases(pnIdentifier: string): string[] {
  const hash = pnHash(pnIdentifier);
  if (!hash) return [];
  return [hash, `${PN_IDENTIFIER_PREFIX}${hash}`, `${PN_DID_PREFIX}${hash}`];
}

export function pnMatchesVerifiedAllowlist(
  pnIdentifier: string | null | undefined,
  allowlistEntries: readonly string[]
): boolean {
  const hash = pnHash(pnIdentifier || '');
  if (!hash) return false;
  return allowlistEntries.some((entry) => pnHash(entry) === hash);
}

export function parseVerifiedAllowlistEnv(raw: string | undefined | null): string[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
