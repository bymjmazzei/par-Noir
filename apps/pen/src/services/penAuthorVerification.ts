import { pnMatchesVerifiedAllowlist, parseVerifiedAllowlistEnv } from '@par-noir/pen-protocol';
import { API_ENDPOINT } from '../config/api';
import { apiGet } from './penOwnerFetch';
import type { PenSession } from './penSession';

/** Build-time allowlist (local dev). */
export function clientVerifiedAllowlist(): string[] {
  return parseVerifiedAllowlistEnv(import.meta.env.VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST);
}

export function isClientVerifiedAuthor(pnIdentifier: string | null | undefined): boolean {
  return pnMatchesVerifiedAllowlist(pnIdentifier, clientVerifiedAllowlist());
}

export async function fetchApiVerifiedAuthor(session: PenSession): Promise<boolean> {
  try {
    const res = await apiGet('/api/pen/author-verification', {
      authToken: session.accessToken,
      pnIdentifier: session.pnIdentifier
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verified?: boolean };
    return data.verified === true;
  } catch {
    return false;
  }
}

export async function resolveVerifiedAuthor(session: PenSession | null | undefined): Promise<boolean> {
  if (!session?.pnIdentifier) return false;
  if (isClientVerifiedAuthor(session.pnIdentifier)) return true;
  return fetchApiVerifiedAuthor(session);
}
