import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';

/**
 * In-memory cloud credentials for the unlocked session.
 * Used when the device is unkeyed (tokens must not survive lock).
 */
const sessionCloudByIdentity = new Map<string, StorageCredentialsEnvelope>();

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
  sessionCloudByIdentity.set(normalizeCloudIdentityId(identityId), credentials);
}

export function getSessionCloudCredentials(
  identityId: string
): StorageCredentialsEnvelope | null {
  return sessionCloudByIdentity.get(normalizeCloudIdentityId(identityId)) ?? null;
}

export function clearSessionCloudCredentials(identityId: string): void {
  sessionCloudByIdentity.delete(normalizeCloudIdentityId(identityId));
}

export function clearAllSessionCloudCredentials(): void {
  sessionCloudByIdentity.clear();
}
