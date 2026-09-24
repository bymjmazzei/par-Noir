/**
 * Verification gate for public template share + monetized licensing.
 * Fail closed until Veriff — except an explicit pnIdentifier allowlist
 * (`VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST`) for system / agent test pNs.
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

function pnOnAllowlist(pnIdentifier: string | null | undefined): boolean {
  const pn = String(pnIdentifier || '').trim();
  if (!pn) return false;
  const list = publicTemplateAllowlist();
  if (!list.length) return false;
  return list.some((entry) => entry === pn);
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
