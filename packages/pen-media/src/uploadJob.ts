/**
 * Encrypt-and-upload as one stream: each 4 MB chunk is sealed and fed into 8 MB Drive
 * pieces, so neither the plaintext nor the ciphertext is ever held whole. Runs in the
 * media worker; imports only worker-safe subpaths.
 */

import {
  encryptPenMediaStream,
  penMediaEncryptedSize,
  PEN_MEDIA_CHUNK_BYTES
} from '@par-noir/dm-crypto/pen-media';
import { deviceDriveUploadStream } from '@par-noir/device-cloud-credentials/drive-upload-stream';

export type UploadJob = {
  blob: Blob;
  keyB64: string;
  accessToken: string;
  folderId: string;
  fileName: string;
};

export type UploadProgress = (sentBytes: number, totalBytes: number) => void;

export async function runUploadJob(
  job: UploadJob,
  opts?: { onProgress?: UploadProgress; signal?: AbortSignal }
): Promise<string> {
  const file = await deviceDriveUploadStream({
    accessToken: job.accessToken,
    totalBytes: penMediaEncryptedSize(job.blob.size, PEN_MEDIA_CHUNK_BYTES),
    segments: encryptPenMediaStream(job.blob, job.keyB64),
    fileName: job.fileName,
    parents: [job.folderId],
    signal: opts?.signal,
    onProgress: opts?.onProgress
  });
  return file.id;
}
