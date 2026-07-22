/**
 * Helpers for routes that need any social cloud (Google or portable).
 */

import { resolveSocialCloudProvider } from '@par-noir/user-owned-storage';
import { storageCredentialsService } from '../storageCredentialsService';
import { getOwnerStorageContext, hasOwnerStorage } from './ownerStorageContext';
import { isPortableStorageProvider } from './storageProviderUtils';

export async function requireOwnerSocialCloud(pnIdentifier: string): Promise<{
  pnIdentifier: string;
  portable: boolean;
  metadataFolderId?: string;
  token?: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number };
  accountId?: string;
}> {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  if (!(await hasOwnerStorage(normalized))) {
    throw Object.assign(new Error('Storage not connected'), { status: 404 });
  }
  const portable = await isPortableStorageProvider(normalized);
  if (portable) {
    return { pnIdentifier: normalized, portable: true };
  }
  const ctx = await getOwnerStorageContext(normalized);
  if (!ctx || ctx.kind !== 'google_drive') {
    throw Object.assign(new Error('Storage not connected'), { status: 404 });
  }
  return {
    pnIdentifier: normalized,
    portable: false,
    metadataFolderId: ctx.metadataFolderId,
    token: ctx.token,
    accountId: ctx.accountId
  };
}

export async function socialCloudLabel(pnIdentifier: string): Promise<string> {
  const record = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!record?.credentials) return 'storage';
  return resolveSocialCloudProvider(record.credentials);
}
