/**
 * Owner API headers for aggregator-browser Drive-backed calls.
 * Thin wrapper over shared @par-noir/device-cloud-credentials owner cloud headers.
 */

import {
  ownerCloudHeaders,
  ownerCloudHeadersAsync as sharedOwnerCloudHeadersAsync,
  waitForCloudCredentialsReady,
  hasCloudCredentialsReady,
  getCloudAccessTokenFromSession,
  PN_CLOUD_CREDENTIALS_READY_EVENT
} from '@par-noir/device-cloud-credentials';
import { PNOAuthService } from './pnOAuthService';

export {
  waitForCloudCredentialsReady as waitForOwnerCloudAccess,
  hasCloudCredentialsReady as hasOwnerCloudAccess,
  getCloudAccessTokenFromSession,
  PN_CLOUD_CREDENTIALS_READY_EVENT
};

/** Sync headers from current OAuth session + cloud vault session memory. */
export function getOwnerApiHeaders(extra?: HeadersInit): Record<string, string> {
  const session = PNOAuthService.loadSession();
  const headers = ownerCloudHeaders({
    authToken: session?.accessToken || '',
    pnIdentifier: session?.pnIdentifier
  });
  if (!session?.accessToken) {
    delete headers.Authorization;
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
  const token = authToken || session?.accessToken || '';
  const pn = pnIdentifier || session?.pnIdentifier;
  const headers = await sharedOwnerCloudHeadersAsync({
    authToken: token,
    pnIdentifier: pn
  });
  if (!token) delete headers.Authorization;
  return headers;
}
