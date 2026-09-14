/**
 * Fail-closed gate before sealing/sending under device-cloud custody.
 */
import { getCloudAccessTokenFromSession } from './ownerCloudHeaders.js';

export function requireOnlineCloudForSend(userPnIdentifier: string): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Connect to the network to send messages.');
  }
  if (!getCloudAccessTokenFromSession(userPnIdentifier)) {
    throw new Error('Cloud storage is not ready. Unlock and reconnect cloud storage to send.');
  }
}
