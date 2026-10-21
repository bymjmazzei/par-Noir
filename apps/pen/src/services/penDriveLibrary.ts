/**
 * Pen's Drive session: fresh Google token + pN folder index for the unlocked identity.
 * Library and doc tree I/O lives in @par-noir/device-cloud-credentials (penDriveTree).
 */

import {
  ensureSessionDriveIndex,
  getCloudAccessTokenFromSession,
  getSessionCloudCredentials,
  getSessionDriveIndex,
  repairServerCloudRegistrationIfNeeded,
  type DeviceDriveLayout,
} from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import { loadPenSession } from './penSession';

export async function penSessionDrive(identityId: string): Promise<{
  accessToken: string;
  index: DeviceDriveLayout;
}> {
  const accessToken = getCloudAccessTokenFromSession(identityId);
  if (!accessToken) throw new Error('cloud_on_device');
  const oauth = loadPenSession();
  const localEnv = getSessionCloudCredentials(identityId);
  if (oauth?.accessToken && localEnv) {
    await repairServerCloudRegistrationIfNeeded({
      apiEndpoint: API_ENDPOINT,
      authToken: oauth.accessToken,
      pnIdentifier: identityId,
      localEnvelope: localEnv,
      googleAccessToken: accessToken,
    }).catch(() => undefined);
  }
  const cached = getSessionDriveIndex(identityId);
  if (cached?.pnFolderId) return { accessToken, index: cached };
  const index = await ensureSessionDriveIndex({
    identityId,
    accessToken,
    readStoredIndex: async () => {
      const res = await ownerGet(
        `/api/storage/credentials/${encodeURIComponent(identityId)}`,
        { pnIdentifier: identityId }
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { credentials?: { pnDriveIndex?: DeviceDriveLayout } };
      return body.credentials?.pnDriveIndex || null;
    },
    persistIndex: async (built) => {
      await ownerFetch(
        'POST',
        `/api/storage/initialize/${encodeURIComponent(identityId)}`,
        { pnDriveIndex: built },
        { pnIdentifier: identityId }
      );
    },
  });
  return { accessToken, index };
}
