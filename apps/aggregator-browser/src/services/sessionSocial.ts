import {
  resolveDeviceSocialContext,
  resolveTablesSocialContext,
  type DeviceSocialContext,
  type TablesSocialContext,
} from '@par-noir/device-cloud-credentials';
import { sessionDriveFor } from './sessionDrive';

/** This pN's social tables on its own cloud: Google Sheets or the portable table files. */
export function sessionSocialFor(identityId: string): Promise<DeviceSocialContext> {
  return resolveDeviceSocialContext(identityId, () => sessionDriveFor(identityId));
}

/** The portable table files when this pN's social cloud is not Google Drive; null otherwise. */
export function sessionTablesFor(identityId: string): Promise<TablesSocialContext | null> {
  return resolveTablesSocialContext(identityId);
}
