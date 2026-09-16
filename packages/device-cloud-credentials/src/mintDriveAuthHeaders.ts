/**
 * Package-internal cloud-header mint for mailbox/outbox helpers.
 *
 * Apps must not pass ownerApiHeadersAsync via buildAuthHeaders. When apiEndpoint
 * + pnIdentifier are set, we mint X-PN-Cloud-Access-Token here. buildAuthHeaders
 * remains for non-cloud extras only (e.g. dashboard device proof).
 */

import { PN_CLOUD_ACCESS_TOKEN_HEADER } from './cloudVault.js';
import { ensureCloudAccessToken } from './ownerCloudHeaders.js';

export type BuildAuthHeaders = (
  method: string,
  path: string,
  body?: unknown
) => Record<string, string> | Promise<Record<string, string>>;

function stripAuthorization(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  delete next.Authorization;
  delete next.authorization;
  return next;
}

/**
 * Resolve a Google access token to forward: mint when apiEndpoint is set, else
 * fall back to an optional sync/async getter (dashboard envelope path).
 */
export async function resolveForwardedCloudToken(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  apiEndpoint?: string | null;
  getCloudAccessToken?: () => Promise<string | undefined> | string | undefined;
}): Promise<string | undefined> {
  if (opts.apiEndpoint && opts.pnIdentifier && opts.authToken) {
    const minted = await ensureCloudAccessToken({
      authToken: opts.authToken,
      pnIdentifier: opts.pnIdentifier,
      apiEndpoint: opts.apiEndpoint
    });
    if (minted?.trim()) return minted.trim();
  }
  if (opts.getCloudAccessToken) {
    const fallback = await opts.getCloudAccessToken();
    if (typeof fallback === 'string' && fallback.trim()) return fallback.trim();
  }
  return undefined;
}

/**
 * Extra headers beyond Bearer: optional app extras + minted cloud AT.
 * Authorization is never included — callers set Bearer from authToken.
 */
export async function mintDriveAuthExtras(opts: {
  authToken: string;
  pnIdentifier?: string | null;
  apiEndpoint?: string | null;
  buildAuthHeaders?: BuildAuthHeaders;
  getCloudAccessToken?: () => Promise<string | undefined> | string | undefined;
  method: string;
  path: string;
  body?: unknown;
}): Promise<Record<string, string>> {
  const extra = opts.buildAuthHeaders
    ? stripAuthorization({ ...(await opts.buildAuthHeaders(opts.method, opts.path, opts.body)) })
    : {};

  const cloudTok = await resolveForwardedCloudToken({
    authToken: opts.authToken,
    pnIdentifier: opts.pnIdentifier,
    apiEndpoint: opts.apiEndpoint,
    getCloudAccessToken: opts.getCloudAccessToken
  });

  if (cloudTok) {
    // Minted / resolved token wins over any stale value in extras.
    extra[PN_CLOUD_ACCESS_TOKEN_HEADER] = cloudTok;
  } else {
    delete extra[PN_CLOUD_ACCESS_TOKEN_HEADER];
    delete extra['x-pn-cloud-access-token'];
  }

  return extra;
}
