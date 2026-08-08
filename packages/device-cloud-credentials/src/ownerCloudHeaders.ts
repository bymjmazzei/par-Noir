/**
 * Shared first-party client helpers: wait for vault hydrate + attach X-PN-Cloud-Access-Token.
 *
 * Drive-ready (hasCloudCredentialsReady / PN_CLOUD_CREDENTIALS_READY) means a usable Google
 * *access* token is in session. Refresh-only is hydrate material for minting — never READY alone.
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

/**
 * Hydrate material: access or refresh present (can mint). Not Drive-ready by itself.
 * @internal used by publishCloudDriveReady
 */
export function hasCloudHydrateMaterial(pnIdentifier?: string | null): boolean {
  if (!pnIdentifier) return false;
  if (getCloudAccessTokenFromSession(pnIdentifier)) return true;
  return Boolean(getCloudRefreshTokenFromSession(pnIdentifier));
}

function accessTokenLooksFresh(pnIdentifier: string): boolean {
  const env = getSessionCloudCredentials(pnIdentifier);
  for (const acct of googleAccountsFromEnvelope(env)) {
    const tok = accountAccessToken(acct);
    if (!tok) continue;
    const exp = accountExpiresAtMs(acct);
    if (exp == null) return true;
    return exp - 60_000 > Date.now();
  }
  return false;
}

/**
 * Drive-ready: a Google *access* token is in session.
 * Refresh-only must NOT count — callers would fire Bearer-only Drive requests.
 */
export function hasCloudCredentialsReady(pnIdentifier?: string | null): boolean {
  if (!pnIdentifier) return false;
  return Boolean(getCloudAccessTokenFromSession(pnIdentifier));
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number
): Promise<boolean> {
  if (predicate()) return true;
  if (typeof window === 'undefined') return predicate();

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
      if (predicate()) finish(true);
    };
    const poll = setInterval(() => {
      if (predicate()) finish(true);
    }, 200);
    const timer = setTimeout(() => finish(predicate()), timeoutMs);
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    onReady();
  });
}

/** Wait until hydrate material (access or refresh) exists. */
export async function waitForCloudHydrateMaterial(
  pnIdentifier?: string | null,
  timeoutMs = 15_000
): Promise<boolean> {
  return waitUntil(() => hasCloudHydrateMaterial(pnIdentifier), timeoutMs);
}

/**
 * Wait until Drive-ready (access token in session).
 * Resolves false if access token never arrives within timeout.
 */
export async function waitForCloudCredentialsReady(
  pnIdentifier?: string | null,
  timeoutMs = 15_000
): Promise<boolean> {
  return waitUntil(() => hasCloudCredentialsReady(pnIdentifier), timeoutMs);
}

function dispatchCloudCredentialsReady(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
    }
  } catch {
    /* non-DOM */
  }
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
}

let refreshInflight: Promise<string | null> | null = null;

/**
 * Ensure session has a usable Google access token; refresh via par Noir API when needed.
 * Does not dispatch READY — use publishCloudDriveReady for that.
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

/**
 * Mint a fresh access token if needed, then fire PN_CLOUD_CREDENTIALS_READY.
 * Only dispatches when getCloudAccessTokenFromSession(pn) is non-null.
 * Returns false if hydrate/mint failed (do not treat as Drive-ready).
 */
export async function publishCloudDriveReady(opts: {
  authToken: string;
  pnIdentifier: string;
  apiEndpoint: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const pn = opts.pnIdentifier?.trim();
  if (!pn || !opts.authToken) return false;

  const hydrated = await waitForCloudHydrateMaterial(pn, opts.timeoutMs ?? 15_000);
  if (!hydrated) return false;

  const tok = await ensureCloudAccessToken({
    authToken: opts.authToken,
    pnIdentifier: pn,
    apiEndpoint: opts.apiEndpoint
  });
  if (!tok?.trim()) return false;
  if (!getCloudAccessTokenFromSession(pn)) return false;

  dispatchCloudCredentialsReady();
  return true;
}

/** Bearer + optional X-PN-Cloud-Access-Token from session (no wait). Non-Drive / sync only. */
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

/** Wait for Drive-ready access token (and refresh if needed) then return headers. */
export async function ownerCloudHeadersAsync(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  timeoutMs?: number;
  apiEndpoint?: string | null;
  extra?: Record<string, string>;
}): Promise<Record<string, string>> {
  // Prefer hydrate material first so we can mint before waiting forever on access-only.
  await waitForCloudHydrateMaterial(opts.pnIdentifier, opts.timeoutMs);
  if (opts.apiEndpoint) {
    await ensureCloudAccessToken({
      authToken: opts.authToken,
      pnIdentifier: opts.pnIdentifier,
      apiEndpoint: opts.apiEndpoint
    });
  }
  await waitForCloudCredentialsReady(opts.pnIdentifier, Math.min(opts.timeoutMs ?? 15_000, 5_000));
  return ownerCloudHeaders(opts);
}
