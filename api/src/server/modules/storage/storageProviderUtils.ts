import { resolveSocialCloudProvider } from '@par-noir/user-owned-storage';
import { storageCredentialsService } from '../storageCredentialsService';

export async function isPortableSocialCloud(pnIdentifier: string): Promise<boolean> {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) return false;
  return resolveSocialCloudProvider(record.credentials) !== 'google_drive';
}

/** @deprecated use isPortableSocialCloud */
export async function isPortableStorageProvider(pnIdentifier: string): Promise<boolean> {
  return isPortableSocialCloud(pnIdentifier);
}
