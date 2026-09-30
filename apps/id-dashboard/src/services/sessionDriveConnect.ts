import { setSessionCloudCredentials } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { sessionDriveFor } from './sessionDrive';
import { readShellMlKem } from './shellMlKem';

/**
 * Google already returned a token to this tab. Keep it in session memory and
 * load or build the Drive index here. Do not open Unlock.
 */
export async function connectDriveInThisSession(opts: {
  identityId: string;
  authToken: string;
  credentials: StorageCredentialsEnvelope;
}): Promise<void> {
  setSessionCloudCredentials(opts.identityId, opts.credentials);
  await sessionDriveFor(opts.identityId, opts.authToken);
  const mlKemSecretKey = readShellMlKem(opts.identityId);
  if (!mlKemSecretKey) return;
  const { publishCloudCredentialsVault } = await import('@par-noir/device-cloud-credentials');
  const { API_ENDPOINT } = await import('../config/api');
  await publishCloudCredentialsVault({
    apiEndpoint: API_ENDPOINT,
    authToken: opts.authToken,
    pnIdentifier: opts.identityId,
    mlKemSecretKey,
    credentials: opts.credentials,
  });
}
