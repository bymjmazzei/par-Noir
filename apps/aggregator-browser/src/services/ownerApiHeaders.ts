/**
 * Owner API headers for aggregator-browser Drive-backed calls.
 * Thin wrapper over shared @par-noir/device-cloud-credentials owner cloud headers.
 *
 * Drive-backed calls MUST use ownerApiHeadersAsync (wait + mint).
 * Sync getOwnerApiHeaders is for non-Drive / display-only paths.
 */

import {
  ownerCloudHeaders,
  ownerCloudHeadersAsync as sharedOwnerCloudHeadersAsync,
  waitForCloudCredentialsReady,
  hasCloudCredentialsReady,
  getCloudAccessTokenFromSession,
  PN_CLOUD_CREDENTIALS_READY_EVENT,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from '@par-noir/device-cloud-credentials';
import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';

export {
  waitForCloudCredentialsReady as waitForOwnerCloudAccess,
  hasCloudCredentialsReady as hasOwnerCloudAccess,
  getCloudAccessTokenFromSession,
  PN_CLOUD_CREDENTIALS_READY_EVENT
};

/**
 * Sync headers — NOT for Drive-backed API calls under custody.
 * Prefer ownerApiHeadersAsync. In DEV, warns when cloud token is missing.
 */
export function getOwnerApiHeaders(extra?: HeadersInit): Record<string, string> {
  const session = PNOAuthService.loadSession();
  const headers = ownerCloudHeaders({
    authToken: session?.accessToken || '',
    pnIdentifier: session?.pnIdentifier
  });
  if (!session?.accessToken) {
    delete headers.Authorization;
  }
  if (import.meta.env.DEV && session?.pnIdentifier && !headers[PN_CLOUD_ACCESS_TOKEN_HEADER]) {
    console.warn(
      '[ownerApiHeaders] Sync headers without X-PN-Cloud-Access-Token — use ownerApiHeadersAsync for Drive calls'
    );
  }
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

/** Wait for Drive-ready access token (+ refresh) then return headers. */
export async function ownerApiHeadersAsync(
  authToken?: string | null,
  pnIdentifier?: string | null
): Promise<Record<string, string>> {
  const session = PNOAuthService.loadSession();
  const token = authToken || session?.accessToken || '';
  const pn = pnIdentifier || session?.pnIdentifier;
  const headers = await sharedOwnerCloudHeadersAsync({
    authToken: token,
    pnIdentifier: pn,
    apiEndpoint: API_ENDPOINT
  });
  if (!token) delete headers.Authorization;
  return headers;
}
