import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';

/**
 * In-memory cloud credentials for the unlocked session.
 * Used when the device is unkeyed (tokens must not survive lock).
 */
const sessionCloudByIdentity = new Map<string, StorageCredentialsEnvelope>();
const sessionDriveIndexByIdentity = new Map<string, DeviceDriveLayout>();

/** One key form for vault lookups — bare ids and `pn-` ids must hit the same slot. */
export function normalizeCloudIdentityId(identityId: string): string {
  const t = (identityId || '').trim();
  if (!t || t.startsWith('did:key:')) return t;
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export function setSessionCloudCredentials(
  identityId: string,
  credentials: StorageCredentialsEnvelope
): void {
  const key = normalizeCloudIdentityId(identityId);
  sessionCloudByIdentity.set(key, credentials);
  const index = (credentials as { pnDriveIndex?: DeviceDriveLayout }).pnDriveIndex;
  if (index?.pnFolderId && index.metadataFolderId && index.sheetIds) {
    sessionDriveIndexByIdentity.set(key, index);
  }
}

export function setSessionDriveIndex(identityId: string, index: DeviceDriveLayout): void {
  sessionDriveIndexByIdentity.set(normalizeCloudIdentityId(identityId), index);
}

export function getSessionDriveIndex(identityId: string): DeviceDriveLayout | null {
  return sessionDriveIndexByIdentity.get(normalizeCloudIdentityId(identityId)) ?? null;
}

export function sheetIdFromSession(identityId: string, key: string): string | null {
  const index = getSessionDriveIndex(identityId);
  if (!index) return null;
  if (key === 'inbox') return index.inboxSheetId || null;
  return index.sheetIds[key] || null;
}

export function getSessionCloudCredentials(
  identityId: string
): StorageCredentialsEnvelope | null {
  return sessionCloudByIdentity.get(normalizeCloudIdentityId(identityId)) ?? null;
}

export function clearSessionCloudCredentials(identityId: string): void {
  const key = normalizeCloudIdentityId(identityId);
  sessionCloudByIdentity.delete(key);
  sessionDriveIndexByIdentity.delete(key);
}

export function clearAllSessionCloudCredentials(): void {
  sessionCloudByIdentity.clear();
  sessionDriveIndexByIdentity.clear();
}
