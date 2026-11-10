import { resolveDeviceSocialContext, type DeviceSocialContext } from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from './sessionDrive';

/** This pN's social tables on its own cloud: Google Sheets or the portable table files. */
export function sessionSocialFor(identityId: string, authToken: string): Promise<DeviceSocialContext> {
  return resolveDeviceSocialContext(identityId, () => sessionDriveFor(identityId, authToken));
}
