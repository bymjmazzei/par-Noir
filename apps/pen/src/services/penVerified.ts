/**
 * Verification gate for public template share + monetized licensing.
 * Fail closed until Veriff — except an explicit pnIdentifier allowlist
 * (`VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST`) for system / agent test pNs.
 *
 * Allowlist entries may be `pn-…`, `did:key:…`, or the bare key suffix;
 * matching is normalized so either form unlocks the gate.
 */

import type { PenSession } from './penSession';

/** Comma-separated pnIdentifiers (OAuth `pn_identifier` / `sub`). Never put pn name or passcode here. */
export function publicTemplateAllowlist(): string[] {
  const raw = String(import.meta.env.VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pnIdAliases(pnIdentifier: string): string[] {
  const t = String(pnIdentifier || '').trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  let rest = t;
  if (t.startsWith('did:key:')) rest = t.slice('did:key:'.length);
  else if (t.startsWith('pn-')) rest = t.slice(3);
  out.add(rest);
  out.add(`pn-${rest}`);
  out.add(`did:key:${rest}`);
  // OAuth may truncate the key suffix (e.g. pn- + 12 hex); also match shared prefixes ≥12.
  if (rest.length >= 12) {
    const short = rest.slice(0, 12);
    out.add(short);
    out.add(`pn-${short}`);
    out.add(`did:key:${short}`);
  }
  return [...out];
}

function pnOnAllowlist(pnIdentifier: string | null | undefined): boolean {
  const list = publicTemplateAllowlist();
  if (!list.length) return false;
  const aliases = pnIdAliases(pnIdentifier || '');
  if (!aliases.length) return false;
  for (const entry of list) {
    const entryAliases = pnIdAliases(entry);
    for (const a of aliases) {
      for (const e of entryAliases) {
        if (a === e) return true;
        // Prefix match when one side is a truncated OAuth id
        if (a.length >= 12 && e.length >= 12 && (a.startsWith(e) || e.startsWith(a))) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Verified author may publish public templates (`pen-templates`) and set
 * Social / Conditional licensing. Browse / networks stay open to all unlocked users.
 * Until Veriff rails exist: allowlist only (fail closed when unset / empty).
 */
export function isVerifiedAuthor(session: PenSession | null | undefined): boolean {
  return pnOnAllowlist(session?.pnIdentifier);
}

/** Alias for PublishMenu: public template share only. */
export function canPublishPublicTemplate(
  session: PenSession | null | undefined
): boolean {
  return isVerifiedAuthor(session);
}
