/**
 * Owner API headers for aggregator-browser Drive-backed calls.
 * Attaches X-PN-Cloud-Access-Token from session vault hydrate when present.
 */

import {
  getSessionCloudCredentials,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from '@par-noir/device-cloud-credentials';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';
import { PNOAuthService } from './pnOAuthService';

const PN_CLOUD_CREDENTIALS_READY = 'pn-cloud-credentials-ready';

function googleAccessTokenFromSession(pnIdentifier: string | null | undefined): string | null {
  if (!pnIdentifier) return null;
  const env = getSessionCloudCredentials(pnIdentifier);
  const legacy = (env as { googleDrive?: Record<string, unknown> } | null)?.googleDrive;
  const accounts =
    (env?.googleDriveAccounts as Record<string, unknown>[] | undefined) ||
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

/** True when session memory has usable Google secrets for this pN. */
export function hasOwnerCloudAccess(pnIdentifier?: string | null): boolean {
  const session = PNOAuthService.loadSession();
  const pn = pnIdentifier || session?.pnIdentifier;
  if (!pn) return false;
  if (googleAccessTokenFromSession(pn)) return true;
  return envelopeHasUsableSecrets(getSessionCloudCredentials(pn));
}

/**
 * Wait for vault hydrate before Drive-backed owner API calls (avoids 409 spam).
 * Resolves false if credentials never arrive within timeout.
 */
export async function waitForOwnerCloudAccess(
  pnIdentifier?: string | null,
  timeoutMs = 15_000
): Promise<boolean> {
  if (hasOwnerCloudAccess(pnIdentifier)) return true;
  if (typeof window === 'undefined') return hasOwnerCloudAccess(pnIdentifier);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY, onReady);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => {
      if (hasOwnerCloudAccess(pnIdentifier)) finish(true);
    };
    const poll = setInterval(() => {
      if (hasOwnerCloudAccess(pnIdentifier)) finish(true);
    }, 200);
    const timer = setTimeout(() => finish(hasOwnerCloudAccess(pnIdentifier)), timeoutMs);
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY, onReady);
    onReady();
  });
}

/** Sync headers from current OAuth session + cloud vault session memory. */
export function getOwnerApiHeaders(extra?: HeadersInit): Record<string, string> {
  const session = PNOAuthService.loadSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  const cloudTok = googleAccessTokenFromSession(session?.pnIdentifier);
  if (cloudTok) {
    headers[PN_CLOUD_ACCESS_TOKEN_HEADER] = cloudTok;
  }
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

export async function ownerApiHeadersAsync(
  authToken?: string | null,
  pnIdentifier?: string | null
): Promise<Record<string, string>> {
  const session = PNOAuthService.loadSession();
  const token = authToken || session?.accessToken;
  const pn = pnIdentifier || session?.pnIdentifier;
  await waitForOwnerCloudAccess(pn);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const cloudTok = googleAccessTokenFromSession(pn);
  if (cloudTok) headers[PN_CLOUD_ACCESS_TOKEN_HEADER] = cloudTok;
  return headers;
}
