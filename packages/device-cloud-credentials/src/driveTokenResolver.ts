/**
 * The one resolver for Google Drive access tokens on the device side.
 *
 * Everything that needs a Drive token goes through here. A second implementation
 * is a bug by definition: four of them drifted apart once already and shipped a
 * dead token to Google on every unlock.
 *
 * Two rules make that failure impossible to repeat:
 *   1. Freshness is decided from an absolute `expires_at` only. Unknown expiry
 *      means NOT fresh. A bare `expires_in` carries no issue time, so treating it
 *      as "one hour from now" silently restarts the clock on every call.
 *   2. A token that cannot be proven fresh is never returned. Callers get null
 *      and a reason; they must not fall back to the stale value.
 */

import { GOOGLE_TOKEN_URL, refreshProviderAccessToken } from './providerToken.js';
export const DRIVE_TOKEN_SKEW_MS = 60_000;

export type GoogleAccountRow = Record<string, unknown>;

export type DriveTokenReason =
  | 'ok'
  | 'no_account'
  | 'no_credentials'
  | 'expiry_unknown'
  | 'expired'
  | 'no_refresh_token'
  | 'no_api_endpoint'
  | 'refresh_rejected'
  | 'refresh_failed';

export interface ResolvedDriveToken {
  /** Null whenever freshness could not be established. Never a stale token. */
  token: string | null;
  reason: DriveTokenReason;
  /** Absolute ms epoch for a newly minted token, so the caller can record it. */
  expiresAt?: number;
}

interface EnvelopeLike {
  googleDriveAccounts?: unknown;
  googleDrive?: unknown;
}

/**
 * Dead ends on a credential path must be visible. Reason codes only: no pn name,
 * passcode, account id, or token ever reaches this log.
 */
function warnDeadEnd(path: string, reason: DriveTokenReason): void {
  try {
    console.warn('[DriveToken] no usable Drive token', { path, reason });
  } catch {
    /* non-console host */
  }
}

export function googleAccountsFromEnvelope(env: unknown): GoogleAccountRow[] {
  const envelope = env as EnvelopeLike | null | undefined;
  if (!envelope) return [];
  const accounts = envelope.googleDriveAccounts;
  if (Array.isArray(accounts) && accounts.length > 0) {
    return accounts as GoogleAccountRow[];
  }
  return envelope.googleDrive ? [envelope.googleDrive as GoogleAccountRow] : [];
}

function stringField(acct: GoogleAccountRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = acct[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function accountAccessToken(acct: GoogleAccountRow): string | null {
  return stringField(acct, 'access_token', 'accessToken');
}

export function accountRefreshToken(acct: GoogleAccountRow): string | null {
  return stringField(acct, 'refresh_token', 'refreshToken');
}

/**
 * Absolute expiry in ms, or null when unknown.
 *
 * `expires_in` is deliberately ignored. It is a lifetime relative to an issue
 * time we do not have, so deriving `Date.now() + expires_in` reports a fresh
 * token forever.
 */
export function accountExpiresAtMs(acct: GoogleAccountRow): number | null {
  const raw = acct.expires_at ?? acct.expiresAt;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  // Tolerate seconds-precision timestamps.
  return raw < 1e12 ? raw * 1000 : raw;
}

/** True only when an access token exists and is provably still valid. */
export function isAccessTokenFresh(acct: GoogleAccountRow, nowMs: number = Date.now()): boolean {
  if (!accountAccessToken(acct)) return false;
  const expiresAt = accountExpiresAtMs(acct);
  if (expiresAt == null) return false;
  return expiresAt - DRIVE_TOKEN_SKEW_MS > nowMs;
}

/** The account we should work with: prefer one that can actually produce a token. */
export function pickGoogleAccount(env: unknown): GoogleAccountRow | null {
  const accounts = googleAccountsFromEnvelope(env);
  if (accounts.length === 0) return null;
  return (
    accounts.find((acct) => accountAccessToken(acct) || accountRefreshToken(acct)) ?? accounts[0]
  );
}

/** A provably fresh token already in the envelope, else null. Never refreshes. */
export function freshAccessTokenFromEnvelope(
  env: unknown,
  nowMs: number = Date.now()
): string | null {
  for (const acct of googleAccountsFromEnvelope(env)) {
    if (isAccessTokenFresh(acct, nowMs)) return accountAccessToken(acct);
  }
  return null;
}

/**
 * Exchange a refresh token for a new access token directly with Google.
 * The user's refresh token stays on the device. No par Noir request carries it.
 */
export async function refreshDriveAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  path: string;
}): Promise<ResolvedDriveToken> {
  if (!opts.clientId?.trim() || !opts.refreshToken?.trim()) {
    warnDeadEnd(opts.path, 'no_credentials');
    return { token: null, reason: 'no_credentials' };
  }

  let minted: Awaited<ReturnType<typeof refreshProviderAccessToken>>;
  try {
    minted = await refreshProviderAccessToken({
      tokenUrl: GOOGLE_TOKEN_URL,
      clientId: opts.clientId.trim(),
      refreshToken: opts.refreshToken.trim()
    });
  } catch {
    warnDeadEnd(opts.path, 'refresh_failed');
    return { token: null, reason: 'refresh_failed' };
  }

  if (!minted) {
    warnDeadEnd(opts.path, 'refresh_rejected');
    return { token: null, reason: 'refresh_rejected' };
  }

  return {
    token: minted.accessToken,
    reason: 'ok',
    expiresAt: Date.now() + minted.expiresIn * 1000
  };
}

async function resolveGoogleClientId(opts: {
  clientId?: string | null;
  apiEndpoint?: string | null;
}): Promise<string | null> {
  const direct = opts.clientId?.trim();
  if (direct) return direct;
  const base = opts.apiEndpoint?.replace(/\/$/, '');
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/public-config`);
    if (!res.ok) return null;
    const data = (await res.json()) as { googleDriveClientId?: string };
    return data.googleDriveClientId?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Resolve a Drive access token that is provably usable, refreshing if needed.
 * Returns null with a reason rather than a token it cannot vouch for.
 */
export async function resolveFreshDriveToken(opts: {
  envelope: unknown;
  /** Public Google OAuth client id. Loaded from /api/public-config when omitted. */
  clientId?: string | null;
  apiEndpoint?: string | null;
  /** Short label for logs, e.g. 'consent' or 'grant-persist'. */
  path: string;
  now?: number;
}): Promise<ResolvedDriveToken> {
  const nowMs = opts.now ?? Date.now();

  const account = pickGoogleAccount(opts.envelope);
  if (!account) {
    warnDeadEnd(opts.path, 'no_account');
    return { token: null, reason: 'no_account' };
  }

  const fresh = freshAccessTokenFromEnvelope(opts.envelope, nowMs);
  if (fresh) return { token: fresh, reason: 'ok' };

  const refreshToken = accountRefreshToken(account);
  if (!refreshToken) {
    // Distinguish "we know it died" from "we were never told when it dies";
    // both are unusable, but they point at different upstream defects.
    const reason: DriveTokenReason =
      accountExpiresAtMs(account) == null ? 'expiry_unknown' : 'expired';
    warnDeadEnd(opts.path, reason);
    return { token: null, reason };
  }

  if (!opts.apiEndpoint && !opts.clientId) {
    warnDeadEnd(opts.path, 'no_api_endpoint');
    return { token: null, reason: 'no_api_endpoint' };
  }

  const clientId = await resolveGoogleClientId(opts);
  if (!clientId) {
    warnDeadEnd(opts.path, 'no_credentials');
    return { token: null, reason: 'no_credentials' };
  }

  return refreshDriveAccessToken({
    refreshToken,
    clientId,
    path: opts.path
  });
}
