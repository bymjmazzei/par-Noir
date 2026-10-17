/**
 * Raw-byte Drive upload from the device: Google resumable session, fixed-size pieces.
 * No base64, no JSON body, and only one piece is read into memory at a time.
 */

import { getCloudAccessTokenFromSession } from './ownerCloudHeaders.js';

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** Google requires pieces in multiples of 256 KiB (except the last). */
export const DRIVE_UPLOAD_PIECE_BYTES = 8 * 1024 * 1024;

export type DriveUploadedFile = { id: string; name?: string; mimeType?: string };

export type DeviceDriveUploadParams = {
  accessToken: string;
  blob: Blob;
  fileName: string;
  parents: string[];
  mimeType?: string;
  pieceBytes?: number;
  fetchImpl?: typeof fetch;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
};

function confirmedOffset(res: Response, fallback: number): number {
  const range = res.headers.get('Range');
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : fallback;
}

export async function deviceDriveUploadBlob(params: DeviceDriveUploadParams): Promise<DriveUploadedFile> {
  const fetchImpl = params.fetchImpl || fetch;
  if (!params.parents.length) throw new Error('drive_parent_required');
  const pieceBytes = params.pieceBytes ?? DRIVE_UPLOAD_PIECE_BYTES;
  const total = params.blob.size;
  const mimeType = params.mimeType || 'application/octet-stream';

  const start = await fetchImpl(`${UPLOAD}?uploadType=resumable&fields=id,name,mimeType`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(total)
    },
    body: JSON.stringify({ name: params.fileName, parents: params.parents })
  });
  if (!start.ok) throw new Error(`drive_upload_start_${start.status}`);
  const session = start.headers.get('Location');
  if (!session) throw new Error('drive_upload_session_missing');

  let offset = 0;
  for (;;) {
    const end = Math.min(total, offset + pieceBytes);
    const piece = params.blob.slice(offset, end);
    const res = await fetchImpl(session, {
      method: 'PUT',
      headers: {
        'Content-Range': total === 0 ? 'bytes */0' : `bytes ${offset}-${end - 1}/${total}`
      },
      body: piece
    });
    if (res.status === 200 || res.status === 201) {
      params.onProgress?.(total, total);
      const file = (await res.json()) as DriveUploadedFile;
      if (!file?.id) throw new Error('drive_upload_no_file_id');
      return file;
    }
    if (res.status !== 308) throw new Error(`drive_upload_piece_${res.status}`);
    offset = confirmedOffset(res, end);
    params.onProgress?.(offset, total);
    if (offset >= total) throw new Error('drive_upload_incomplete');
  }
}

/** Same upload using the unlocked session's device-held Drive token. */
export async function deviceDriveUploadBlobForSession(
  params: Omit<DeviceDriveUploadParams, 'accessToken'> & { pnIdentifier: string }
): Promise<DriveUploadedFile> {
  const accessToken = getCloudAccessTokenFromSession(params.pnIdentifier);
  if (!accessToken) throw new Error('cloud_on_device');
  return deviceDriveUploadBlob({ ...params, accessToken });
}

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
