/**
 * Upload-first attach: a picked file is encrypted and uploaded to Drive before the
 * editor sees it, then written to IndexedDB once under its Drive file id. Nothing
 * uploads later during editing or playback.
 */

import { getCloudAccessTokenFromSession } from '@par-noir/device-cloud-credentials';
import { penMediaConfig } from './config';
import { uploadInWorker } from './crypto';
import { deleteLocalMedia, getLocalMedia, putLocalMediaForDriveFile } from './store';
import type { UploadProgress } from './uploadJob';

async function uploadToDocFolder(params: {
  pnIdentifier: string;
  docId: string;
  blob: Blob;
  fileName: string;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
}): Promise<string> {
  const accessToken = getCloudAccessTokenFromSession(params.pnIdentifier);
  if (!accessToken) throw new Error('cloud_on_device');
  const cfg = penMediaConfig();
  const keyB64 = cfg.mintDocKey(params.docId);
  const folderId = await cfg.resolveUploadFolder(params.pnIdentifier, params.docId);
  params.signal?.throwIfAborted();
  return uploadInWorker(
    { blob: params.blob, keyB64, accessToken, folderId, fileName: params.fileName },
    { onProgress: params.onProgress, signal: params.signal }
  );
}

/** Upload, then cache locally. Returns a `penmedia:` ref and a playable blob URL. */
export async function attachMediaFile(params: {
  pnIdentifier: string;
  docId: string;
  file: Blob;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
}): Promise<{ ref: string; mediaId: string; blobUrl: string; mime: string }> {
  const fileId = await uploadToDocFolder({
    pnIdentifier: params.pnIdentifier,
    docId: params.docId,
    blob: params.file,
    fileName: `media-${Date.now()}.pnm`,
    onProgress: params.onProgress,
    signal: params.signal
  });
  if (params.signal?.aborted) throw new Error('upload_cancelled');
  const put = await putLocalMediaForDriveFile({ docId: params.docId, fileId, blob: params.file });
  return {
    ref: put.ref,
    mediaId: put.mediaId,
    blobUrl: put.blobUrl,
    mime: params.file.type || 'application/octet-stream'
  };
}

/**
 * Offline fallback (gallery previews): a blob stored under `penlocal:` uploads later,
 * moves to its Drive id in IndexedDB, and the local record is dropped. Media already on
 * Drive returns its file id untouched. Null when missing.
 */
export async function uploadStoredMedia(params: {
  pnIdentifier: string;
  docId: string;
  mediaId: string;
}): Promise<string | null> {
  const hit = await getLocalMedia(params.mediaId);
  if (!hit) return null;
  if (hit.driveFileId) return hit.driveFileId;
  const fileId = await uploadToDocFolder({
    pnIdentifier: params.pnIdentifier,
    docId: params.docId,
    blob: hit.blob,
    fileName: `media-${params.mediaId}.pnm`
  });
  await putLocalMediaForDriveFile({ docId: params.docId, fileId, blob: hit.blob });
  await deleteLocalMedia(params.mediaId);
  return fileId;
}
