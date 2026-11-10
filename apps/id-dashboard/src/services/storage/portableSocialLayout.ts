import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { ownerFetch } from '../ownerApiService';

/**
 * A non-Google social cloud is laid out from this device (it holds the keys); the
 * API records the layout root and marks the layout current.
 */
export async function initializePortableSocialLayout(
  authToken: string,
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope
): Promise<void> {
  const { initializeDevicePortableLayout } = await import('@par-noir/device-cloud-credentials');
  const layout = await initializeDevicePortableLayout(pnIdentifier, credentials);
  if (!layout) return;
  const res = await ownerFetch(
    authToken,
    'POST',
    `/api/storage/layout/${encodeURIComponent(pnIdentifier)}`,
    { cachedLayout: { pathPrefix: layout.pathPrefix }, portableLayoutInitialized: true },
    { pnIdentifier }
  );
  if (!res.ok) {
    throw new Error(`Storage layout save failed (${res.status})`);
  }
}
