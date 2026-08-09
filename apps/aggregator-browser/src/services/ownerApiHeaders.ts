/**
 * Owner API headers for aggregator-browser Drive-backed calls.
 * Thin wrapper over shared @par-noir/device-cloud-credentials owner cloud headers.
 *
 * There is deliberately no synchronous header builder here. A sync builder can
 * only report a Google access token that is already fresh; it cannot mint one.
 * Drive calls built that way went out with no X-PN-Cloud-Access-Token as soon as
 * the vault token passed its hour, and the API answered 409. Callers use
 * ownerFetch / ownerGet in ./ownerApiFetch, which mint and fail closed.
 */

import {
  ownerCloudHeadersAsync as sharedOwnerCloudHeadersAsync,
  waitForCloudCredentialsReady,
  hasCloudCredentialsReady,
  getCloudAccessTokenFromSession,
  PN_CLOUD_CREDENTIALS_READY_EVENT
} from '@par-noir/device-cloud-credentials';
import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';

export {
  waitForCloudCredentialsReady as waitForOwnerCloudAccess,
  hasCloudCredentialsReady as hasOwnerCloudAccess,
  getCloudAccessTokenFromSession,
  PN_CLOUD_CREDENTIALS_READY_EVENT
};

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
