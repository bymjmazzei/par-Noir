/**
 * Owner API headers for aggregator-browser Drive-backed calls.
 * Attaches X-PN-Cloud-Access-Token from session vault hydrate when present.
 */

import {
  getSessionCloudCredentials,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from '@par-noir/device-cloud-credentials';
import { PNOAuthService } from './pnOAuthService';

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const cloudTok = googleAccessTokenFromSession(pn);
  if (cloudTok) headers[PN_CLOUD_ACCESS_TOKEN_HEADER] = cloudTok;
  return headers;
}
