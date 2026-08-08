/**
 * Shared first-party client helpers: wait for vault hydrate + attach X-PN-Cloud-Access-Token.
 */

import { getSessionCloudCredentials } from './sessionMemory.js';
import { PN_CLOUD_ACCESS_TOKEN_HEADER, cloudAccessHeaders } from './cloudVault.js';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';

export const PN_CLOUD_CREDENTIALS_READY_EVENT = 'pn-cloud-credentials-ready';

/** Google access token from in-memory session vault (after hydrate). */
export function getCloudAccessTokenFromSession(
  pnIdentifier: string | null | undefined
): string | null {
  if (!pnIdentifier) return null;
  const env = getSessionCloudCredentials(pnIdentifier);
  if (!env) return null;
  const legacy = (env as { googleDrive?: Record<string, unknown> }).googleDrive;
  const accounts =
    (env.googleDriveAccounts as Record<string, unknown>[] | undefined) ||
    (legacy ? [legacy] : []);
  for (const acct of accounts || []) {
    const tok =
      (typeof acct.access_token === 'string' && acct.access_token) ||
      (typeof acct.accessToken === 'string' && acct.accessToken) ||
      '';
    if (tok.trim()) return tok.trim();
  }
  return null;
}

export function hasCloudCredentialsReady(pnIdentifier?: string | null): boolean {
  if (!pnIdentifier) return false;
  if (getCloudAccessTokenFromSession(pnIdentifier)) return true;
  return envelopeHasUsableSecrets(getSessionCloudCredentials(pnIdentifier));
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

/** Wait for hydrate then return ownerCloudHeaders. */
export async function ownerCloudHeadersAsync(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  timeoutMs?: number;
  extra?: Record<string, string>;
}): Promise<Record<string, string>> {
  await waitForCloudCredentialsReady(opts.pnIdentifier, opts.timeoutMs);
  return ownerCloudHeaders(opts);
}
