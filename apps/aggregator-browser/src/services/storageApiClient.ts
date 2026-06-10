import { API_ENDPOINT } from '../config/api';

export type StorageProviderId =
  | 'google_drive'
  | 'dropbox'
  | 'aws_s3'
  | 'azure_blob'
  | 'onedrive'
  | 'ftp';

export async function uploadBlob(
  authToken: string,
  pnIdentifier: string,
  provider: StorageProviderId,
  key: string,
  fileData: ArrayBuffer | Uint8Array,
  opts?: { accountId?: string; contentType?: string }
): Promise<void> {
  const bytes = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData;
  const base64 = btoa(String.fromCharCode(...bytes));
  const endpoint = API_ENDPOINT;
  const res = await fetch(`${endpoint}/api/storage/blobs/${encodeURIComponent(pnIdentifier)}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider,
      accountId: opts?.accountId,
      key,
      fileData: base64,
      contentType: opts?.contentType || 'application/octet-stream'
    })
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || 'Blob upload failed');
  }
}

export async function downloadBlob(
  authToken: string,
  pnIdentifier: string,
  provider: StorageProviderId,
  key: string,
  accountId?: string
): Promise<Blob> {
  const endpoint = API_ENDPOINT;
  const q = new URLSearchParams({
    provider,
    key,
    download: 'true',
    ...(accountId ? { accountId } : {})
  });
  const res = await fetch(
    `${endpoint}/api/storage/blobs/${encodeURIComponent(pnIdentifier)}/download?${q}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) throw new Error('Blob download failed');
  return res.blob();
}

export function resolveFileUrl(
  pnIdentifier: string,
  backend: string,
  backendFileId: string,
  accountId?: string
): string {
  const endpoint = API_ENDPOINT;
  if (backend === 'google_drive') {
    return `${endpoint}/api/drive/files/${encodeURIComponent(backendFileId)}?download=true`;
  }
  const q = new URLSearchParams({
    provider: backend,
    key: backendFileId,
    download: 'true',
    ...(accountId ? { accountId } : {})
  });
  return `${endpoint}/api/storage/blobs/${encodeURIComponent(pnIdentifier)}/download?${q}`;
}
