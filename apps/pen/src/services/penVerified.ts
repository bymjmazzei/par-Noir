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

/** Expand an id into comparable forms (pn- / did:key: / bare). */
export function pnIdAliases(pnIdentifier: string): string[] {
  const t = String(pnIdentifier || '').trim();
  if (!t) return [];
  const out = new Set<string>([t]);
  if (t.startsWith('did:key:')) {
    const rest = t.slice('did:key:'.length);
    out.add(rest);
    out.add(`pn-${rest}`);
  } else if (t.startsWith('pn-')) {
    const rest = t.slice(3);
    out.add(rest);
    out.add(`did:key:${rest}`);
  } else {
    out.add(`pn-${t}`);
    out.add(`did:key:${t}`);
  }
  return [...out];
}

function pnOnAllowlist(pnIdentifier: string | null | undefined): boolean {
  const list = publicTemplateAllowlist();
  if (!list.length) return false;
  const aliases = new Set(pnIdAliases(pnIdentifier || ''));
  if (!aliases.size) return false;
  for (const entry of list) {
    for (const a of pnIdAliases(entry)) {
      if (aliases.has(a)) return true;
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
