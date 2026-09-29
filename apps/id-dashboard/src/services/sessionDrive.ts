import {
  ensureSessionDriveIndex,
  getCloudAccessTokenFromSession,
  type DeviceDriveLayout,
} from '@par-noir/device-cloud-credentials';
import { ownerFetch, ownerGet } from './ownerApiService';

export async function sessionDriveFor(
  identityId: string,
  authToken: string
): Promise<{ accessToken: string; index: DeviceDriveLayout }> {
  const accessToken = getCloudAccessTokenFromSession(identityId);
  if (!accessToken) throw new Error('cloud_on_device');
  const index = await ensureSessionDriveIndex({
    identityId,
    accessToken,
    readStoredIndex: async () => {
      const res = await ownerGet(
        authToken,
        `/api/storage/credentials/${encodeURIComponent(identityId)}`,
        { pnIdentifier: identityId }
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { credentials?: { pnDriveIndex?: DeviceDriveLayout } };
      return body.credentials?.pnDriveIndex || null;
    },
    persistIndex: async (built) => {
      await ownerFetch(
        authToken,
        'POST',
        `/api/storage/initialize/${encodeURIComponent(identityId)}`,
        { pnDriveIndex: built },
        { pnIdentifier: identityId }
      );
    },
  });
  return { accessToken, index };
}
