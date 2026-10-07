/**
 * Pen verified-author allowlist matching (OAuth pn_identifier aliases).
 * Used by Pen client (VITE) and API (PEN_VERIFIED_AUTHOR_PN_IDS).
 */

export function pnIdAliases(pnIdentifier: string): string[] {
  const t = String(pnIdentifier || '').trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  let rest = t;
  if (t.startsWith('did:key:')) rest = t.slice('did:key:'.length);
  else if (t.startsWith('pn-')) rest = t.slice(3);
  out.add(rest);
  out.add(`pn-${rest}`);
  out.add(`did:key:${rest}`);
  if (rest.length >= 12) {
    const short = rest.slice(0, 12);
    out.add(short);
    out.add(`pn-${short}`);
    out.add(`did:key:${short}`);
  }
  return [...out];
}

export function pnMatchesVerifiedAllowlist(
  pnIdentifier: string | null | undefined,
  allowlistEntries: readonly string[]
): boolean {
  if (!allowlistEntries.length) return false;
  const aliases = pnIdAliases(pnIdentifier || '');
  if (!aliases.length) return false;
  for (const entry of allowlistEntries) {
    const entryAliases = pnIdAliases(entry);
    for (const a of aliases) {
      for (const e of entryAliases) {
        if (a === e) return true;
        if (a.length >= 12 && e.length >= 12 && (a.startsWith(e) || e.startsWith(a))) {
          return true;
        }
      }
    }
  }
  return false;
}

export function parseVerifiedAllowlistEnv(raw: string | undefined | null): string[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
