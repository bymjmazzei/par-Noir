/**
 * Shared first-party client helpers: wait for vault hydrate + attach X-PN-Cloud-Access-Token.
 *
 * Ready means a usable Google *access* token (or a refresh token we can mint from).
 * Refresh-only envelopes must not short-circuit into Bearer-only Drive calls.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { getSessionCloudCredentials, setSessionCloudCredentials } from './sessionMemory.js';
import { cloudAccessHeaders } from './cloudVault.js';

export const PN_CLOUD_CREDENTIALS_READY_EVENT = 'pn-cloud-credentials-ready';

type GoogleAccountRow = Record<string, unknown>;

function googleAccountsFromEnvelope(
  env: StorageCredentialsEnvelope | null | undefined
): GoogleAccountRow[] {
  if (!env) return [];
  const legacy = (env as { googleDrive?: GoogleAccountRow }).googleDrive;
  const accounts =
    (env.googleDriveAccounts as GoogleAccountRow[] | undefined) || (legacy ? [legacy] : []);
  return accounts || [];
}

function accountAccessToken(acct: GoogleAccountRow): string | null {
  const tok =
    (typeof acct.access_token === 'string' && acct.access_token) ||
    (typeof acct.accessToken === 'string' && acct.accessToken) ||
    '';
  return tok.trim() || null;
}

function accountRefreshToken(acct: GoogleAccountRow): string | null {
  const tok =
    (typeof acct.refresh_token === 'string' && acct.refresh_token) ||
    (typeof acct.refreshToken === 'string' && acct.refreshToken) ||
    '';
  return tok.trim() || null;
}

function accountExpiresAtMs(acct: GoogleAccountRow): number | null {
  const raw = acct.expires_at ?? acct.expiresAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Heuristic: seconds vs ms
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const expiresIn = acct.expires_in ?? acct.expiresIn;
  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + expiresIn * 1000;
  }
  return null;
}

/** Google access token from in-memory session vault (after hydrate). */
export function getCloudAccessTokenFromSession(
  pnIdentifier: string | null | undefined
): string | null {
  if (!pnIdentifier) return null;
  for (const acct of googleAccountsFromEnvelope(getSessionCloudCredentials(pnIdentifier))) {
    const tok = accountAccessToken(acct);
    if (tok) return tok;
  }
  return null;
}

/** Google refresh token from in-memory session vault. */
export function getCloudRefreshTokenFromSession(
  pnIdentifier: string | null | undefined
): string | null {
  if (!pnIdentifier) return null;
  for (const acct of googleAccountsFromEnvelope(getSessionCloudCredentials(pnIdentifier))) {
    const tok = accountRefreshToken(acct);
    if (tok) return tok;
  }
  return null;
}

function accessTokenLooksFresh(pnIdentifier: string): boolean {
  const env = getSessionCloudCredentials(pnIdentifier);
  for (const acct of googleAccountsFromEnvelope(env)) {
    const tok = accountAccessToken(acct);
    if (!tok) continue;
    const exp = accountExpiresAtMs(acct);
    // No expiry metadata → treat as usable until Google rejects it.
    if (exp == null) return true;
    // Refresh 60s before expiry.
    return exp - 60_000 > Date.now();
  }
  return false;
}

/**
 * True when vault hydrate can support Drive calls: fresh access token, or refresh token to mint one.
 * Do NOT treat layout-only / unknown envelopes as ready.
 */
export function hasCloudCredentialsReady(pnIdentifier?: string | null): boolean {
  if (!pnIdentifier) return false;
  if (getCloudAccessTokenFromSession(pnIdentifier)) return true;
  return Boolean(getCloudRefreshTokenFromSession(pnIdentifier));
}

/**
 * Wait for vault hydrate (PN_CLOUD_CREDENTIALS_READY or session secrets).
 * Resolves false if credentials never arrive within timeout.
 */
export async function waitForCloudCredentialsReady(
  pnIdentifier?: string | null,
  timeoutMs = 15_000
): Promise<boolean> {
  if (hasCloudCredentialsReady(pnIdentifier)) return true;
  if (typeof window === 'undefined') return hasCloudCredentialsReady(pnIdentifier);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => {
      if (hasCloudCredentialsReady(pnIdentifier)) finish(true);
    };
    const poll = setInterval(() => {
      if (hasCloudCredentialsReady(pnIdentifier)) finish(true);
    }, 200);
    const timer = setTimeout(() => finish(hasCloudCredentialsReady(pnIdentifier)), timeoutMs);
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    onReady();
  });
}

function patchSessionAccessToken(
  pnIdentifier: string,
  accessToken: string,
  expiresIn?: number
): void {
  const env = getSessionCloudCredentials(pnIdentifier);
  if (!env) return;
  const accounts = googleAccountsFromEnvelope(env);
  if (accounts.length === 0) return;
  const expiresAt = typeof expiresIn === 'number' ? Date.now() + expiresIn * 1000 : undefined;
  let patched = false;
  const nextAccounts = accounts.map((acct) => {
    if (patched) return acct;
    if (!accountRefreshToken(acct) && !accountAccessToken(acct)) return acct;
    patched = true;
    return {
      ...acct,
      access_token: accessToken,
      accessToken,
      ...(expiresAt != null
        ? { expires_at: expiresAt, expiresAt, expires_in: expiresIn, expiresIn }
        : {})
    };
  });
  if (!patched && nextAccounts[0]) {
    nextAccounts[0] = {
      ...nextAccounts[0],
      access_token: accessToken,
      accessToken,
      ...(expiresAt != null
        ? { expires_at: expiresAt, expiresAt, expires_in: expiresIn, expiresIn }
        : {})
    };
  }
  const next: StorageCredentialsEnvelope = {
    ...env,
    googleDriveAccounts: nextAccounts as StorageCredentialsEnvelope['googleDriveAccounts']
  };
  if ((env as { googleDrive?: GoogleAccountRow }).googleDrive) {
    (next as { googleDrive?: GoogleAccountRow }).googleDrive = nextAccounts[0];
  }
  setSessionCloudCredentials(pnIdentifier, next);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
    }
  } catch {
    /* non-DOM */
  }
}

let refreshInflight: Promise<string | null> | null = null;

/**
 * Ensure session has a usable Google access token; refresh via par Noir API when needed.
 */
export async function ensureCloudAccessToken(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  apiEndpoint?: string | null;
}): Promise<string | null> {
  const pn = opts.pnIdentifier;
  if (!pn || !opts.authToken) return null;

  if (accessTokenLooksFresh(pn)) {
    return getCloudAccessTokenFromSession(pn);
  }

  const refreshToken = getCloudRefreshTokenFromSession(pn);
  const existing = getCloudAccessTokenFromSession(pn);
  if (!refreshToken) return existing;

  const base = (opts.apiEndpoint || '').replace(/\/$/, '');
  if (!base) return existing;

  if (refreshInflight) return refreshInflight;

  refreshInflight = (async () => {
    try {
      const res = await fetch(`${base}/api/auth/google-oauth/refresh`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });
      if (!res.ok) return getCloudAccessTokenFromSession(pn);
      const data = (await res.json()) as {
        access_token?: string;
        accessToken?: string;
        expires_in?: number;
      };
      const next =
        (typeof data.access_token === 'string' && data.access_token.trim()) ||
        (typeof data.accessToken === 'string' && data.accessToken.trim()) ||
        '';
      if (!next) return getCloudAccessTokenFromSession(pn);
      patchSessionAccessToken(pn, next, data.expires_in);
      return next;
    } catch {
      return getCloudAccessTokenFromSession(pn);
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

/** Bearer + optional X-PN-Cloud-Access-Token from session (no wait). */
export function ownerCloudHeaders(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  extra?: Record<string, string>;
}): Record<string, string> {
  const cloudTok = getCloudAccessTokenFromSession(opts.pnIdentifier);
  const headers = cloudAccessHeaders(opts.authToken, cloudTok);
  if (opts.extra) Object.assign(headers, opts.extra);
  return headers;
}

/** Wait for hydrate (and refresh if needed) then return ownerCloudHeaders. */
export async function ownerCloudHeadersAsync(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  timeoutMs?: number;
  apiEndpoint?: string | null;
  extra?: Record<string, string>;
}): Promise<Record<string, string>> {
  await waitForCloudCredentialsReady(opts.pnIdentifier, opts.timeoutMs);
  if (opts.apiEndpoint) {
    await ensureCloudAccessToken({
      authToken: opts.authToken,
      pnIdentifier: opts.pnIdentifier,
      apiEndpoint: opts.apiEndpoint
    });
  }
  return ownerCloudHeaders(opts);
}
