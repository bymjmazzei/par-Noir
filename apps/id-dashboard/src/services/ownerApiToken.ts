/**
 * par Noir OAuth JWT for owner/gated API routes.
 * Never use authenticatedUser.accessToken (local unlock session) as Authorization.
 */

import { getStoredToken, getStoredTokenForPn } from './parNoirOAuthInline';

/** Sync read of the owner OAuth JWT (same sources as Storage resolveOwnerApiToken). */
export function resolveOwnerApiToken(wantedPn?: string | null): string | null {
  if (wantedPn) {
    return getStoredTokenForPn(wantedPn)?.accessToken ?? null;
  }
  return getStoredToken()?.accessToken ?? null;
}

/** Throws if no owner JWT — caller should ensureApiTokenAfterUnlock first when possible. */
export function requireOwnerApiToken(wantedPn?: string | null): string {
  const token = resolveOwnerApiToken(wantedPn);
  if (!token) {
    throw new Error('par Noir API session not ready — unlock again and retry');
  }
  return token;
}
