/**
 * Shared first-party client helpers: wait for vault hydrate + attach X-PN-Cloud-Access-Token.
 *
 * Drive-ready (hasCloudCredentialsReady / PN_CLOUD_CREDENTIALS_READY) means a usable Google
 * *access* token is in session. Refresh-only is hydrate material for minting — never READY alone.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { getSessionCloudCredentials, setSessionCloudCredentials } from './sessionMemory.js';
import { cloudAccessHeaders } from './cloudVault.js';
import {
  accountRefreshToken,
  freshAccessTokenFromEnvelope,
  googleAccountsFromEnvelope,
  resolveFreshDriveToken,
  type GoogleAccountRow
} from './driveTokenResolver.js';

export const PN_CLOUD_CREDENTIALS_READY_EVENT = 'pn-cloud-credentials-ready';

/**
 * Google access token from the in-memory session vault, only when provably fresh.
 *
 * Returning an unverified token here is what forwarded a dead
 * X-PN-Cloud-Access-Token to the API. Freshness lives in driveTokenResolver.
 */
export function getCloudAccessTokenFromSession(
  pnIdentifier: string | null | undefined
): string | null {
  if (!pnIdentifier) return null;
  return freshAccessTokenFromEnvelope(getSessionCloudCredentials(pnIdentifier));
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

/**
 * Drive-ready: a provably fresh Google *access* token is in session.
 * Refresh-only must NOT count — callers would fire Bearer-only Drive requests.
 * An expired token must NOT count either — callers would fire requests Google rejects.
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

/**
 * Record a freshly minted token against the session vault.
 *
 * Only the absolute `expires_at` is written. Storing a relative `expires_in`
 * alongside it invites a reader to recompute the deadline from "now" and
 * conclude a long-dead token is still good.
 */
function patchSessionAccessTokenAbsolute(
  pnIdentifier: string,
  accessToken: string,
  expiresAt: number
): void {
  const env = getSessionCloudCredentials(pnIdentifier);
  if (!env) return;
  const accounts = googleAccountsFromEnvelope(env);
  if (accounts.length === 0) return;
  const stamp = (acct: GoogleAccountRow): GoogleAccountRow => {
    const next: GoogleAccountRow = {
      ...acct,
      access_token: accessToken,
      accessToken,
      expires_at: expiresAt
    };
    delete next.expiresAt;
    delete next.expires_in;
    delete next.expiresIn;
    return next;
  };
  let patched = false;
  const nextAccounts = accounts.map((acct) => {
    if (patched) return acct;
    if (!accountRefreshToken(acct) && !acct.access_token && !acct.accessToken) return acct;
    patched = true;
    return stamp(acct);
  });
  if (!patched && nextAccounts[0]) {
    nextAccounts[0] = stamp(nextAccounts[0]);
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

const refreshInflight = new Map<string, Promise<string | null>>();

/**
 * Ensure session holds a usable Google access token; refresh via par Noir API when needed.
 *
 * Returns null rather than a stale token when the refresh cannot be completed.
 * Callers must treat null as "Drive is not reachable right now" and surface that,
 * not fall back to whatever is sitting in the vault.
 *
 * Does not dispatch READY — use publishCloudDriveReady for that.
 */
export async function ensureCloudAccessToken(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  apiEndpoint?: string | null;
  path?: string;
}): Promise<string | null> {
  const pn = opts.pnIdentifier;
  if (!pn || !opts.authToken) return null;

  const fresh = getCloudAccessTokenFromSession(pn);
  if (fresh) return fresh;

  const inflight = refreshInflight.get(pn);
  if (inflight) return inflight;

  const attempt = (async () => {
    const resolved = await resolveFreshDriveToken({
      envelope: getSessionCloudCredentials(pn),
      authToken: opts.authToken,
      apiEndpoint: opts.apiEndpoint,
      path: opts.path ?? 'session'
    });
    if (!resolved.token) return null;
    if (resolved.expiresAt != null) {
      patchSessionAccessTokenAbsolute(pn, resolved.token, resolved.expiresAt);
    }
    return resolved.token;
  })().finally(() => {
    refreshInflight.delete(pn);
  });

  refreshInflight.set(pn, attempt);
  return attempt;
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
