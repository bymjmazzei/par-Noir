/**
 * Shared first-party cloud vault hydrate (identity-sealed credentials).
 */

export {
  hydrateCloudCredentialsFromVault,
  publishCloudCredentialsVault,
  cloudAccessHeaders,
  sealCloudVault,
  unsealCloudVault,
  canonicalCloudSealSession,
  PN_CLOUD_ACCESS_TOKEN_HEADER,
  CLOUD_VAULT_SEAL_SESSION_ID
} from '@par-noir/device-cloud-credentials';
export type { CloudVaultHydrateResult } from '@par-noir/device-cloud-credentials';

import {
  getSessionCloudCredentials,
  hydrateCloudCredentialsFromVault
} from '@par-noir/device-cloud-credentials';
import { envelopeHasUsableSecrets } from '@par-noir/user-owned-storage';

/**
 * Hydrate session cloud creds from API vault when local session is empty.
 * Returns true when session has usable secrets afterwards.
 */
export async function ensureCloudCredentialsReady(opts: {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  pnName: string;
  passcode: string;
  extraHeaders?: Record<string, string>;
}): Promise<'ready' | 'missing' | 'unseal_failed' | 'error'> {
  const existing = getSessionCloudCredentials(opts.pnIdentifier);
  if (envelopeHasUsableSecrets(existing)) return 'ready';

  const result = await hydrateCloudCredentialsFromVault(opts);
  if (result.status === 'ready') return 'ready';
  return result.status;
}
