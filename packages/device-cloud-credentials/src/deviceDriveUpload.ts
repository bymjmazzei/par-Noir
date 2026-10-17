/**
 * Raw Drive file bytes fetched by the device with the session's device-held token.
 * Uploads stream through {@link deviceDriveUploadStream} (worker-safe, no session imports).
 */

import { getCloudAccessTokenFromSession } from './ownerCloudHeaders.js';

/** Raw bytes of a Drive file, fetched by the device. */
export async function deviceDriveDownloadBlobForSession(params: {
  pnIdentifier: string;
  fileId: string;
  fetchImpl?: typeof fetch;
}): Promise<Blob> {
  const accessToken = getCloudAccessTokenFromSession(params.pnIdentifier);
  if (!accessToken) throw new Error('cloud_on_device');
  const res = await (params.fetchImpl || fetch)(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(params.fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`drive_download_${res.status}`);
  return res.blob();
}
