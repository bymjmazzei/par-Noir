import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';

/**
 * In-memory cloud credentials for the unlocked session.
 * Used when the device is unkeyed (tokens must not survive lock).
 */
const sessionCloudByIdentity = new Map<string, StorageCredentialsEnvelope>();

export function setSessionCloudCredentials(
  identityId: string,
  credentials: StorageCredentialsEnvelope
): void {
  sessionCloudByIdentity.set(identityId, credentials);
}

export function getSessionCloudCredentials(
  identityId: string
): StorageCredentialsEnvelope | null {
  return sessionCloudByIdentity.get(identityId) ?? null;
}

export function clearSessionCloudCredentials(identityId: string): void {
  sessionCloudByIdentity.delete(identityId);
}

export function clearAllSessionCloudCredentials(): void {
  sessionCloudByIdentity.clear();
}
