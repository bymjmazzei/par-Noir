import type { StorageProviderId, UserOwnedTableStore } from '@par-noir/user-owned-storage';
import { resolveSocialCloudProvider } from '@par-noir/user-owned-storage';
import type { DeviceDriveLayout } from '../deviceDriveLayout.js';
import { createDeviceBlobStore, type DeviceBlobStore } from '../deviceBlobStore.js';
import { createDeviceTableStore } from '../deviceTables.js';
import { getSessionCloudCredentials } from '../sessionMemory.js';

/**
 * Where this pN's social tables live. Google keeps positional Sheets; every other
 * provider keeps the SQLite table files and JSON blobs the API used to write.
 */
export type DeviceSocialContext =
  | { kind: 'google_drive'; accessToken: string; index: DeviceDriveLayout }
  | { kind: 'tables'; provider: StorageProviderId; tables: UserOwnedTableStore; blobs: DeviceBlobStore };

export type GoogleDriveSession = () => Promise<{ accessToken: string; index: DeviceDriveLayout }>;

/** The Google session opener is app-specific (it reads the stored layout through the app's API client). */
export async function resolveDeviceSocialContext(
  pnIdentifier: string,
  googleDrive: GoogleDriveSession,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<DeviceSocialContext> {
  const credentials = getSessionCloudCredentials(pnIdentifier);
  const provider = credentials ? resolveSocialCloudProvider(credentials) : 'google_drive';
  if (!credentials || provider === 'google_drive') {
    const drive = await googleDrive();
    return { kind: 'google_drive', accessToken: drive.accessToken, index: drive.index };
  }
  const blobs = createDeviceBlobStore(pnIdentifier, credentials, {
    accountId: credentials.socialCloudAccountId,
    fetchImpl: opts.fetchImpl,
  });
  const tables = await createDeviceTableStore(pnIdentifier, credentials, { fetchImpl: opts.fetchImpl });
  return { kind: 'tables', provider, tables, blobs };
}
