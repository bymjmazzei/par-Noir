import { setSessionCloudCredentials } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { sessionDriveFor } from './sessionDrive';

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
}
