import { API_ENDPOINT } from '../config/api';

export type StorageProviderId =
  | 'google_drive'
  | 'dropbox'
  | 'aws_s3'
  | 'azure_blob'
  | 'onedrive'
  | 'ftp';

function normalizeBackend(backend?: string): StorageProviderId {
  return (backend || 'google_drive') as StorageProviderId;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function uploadBlob(
  authToken: string,
  pnIdentifier: string,
  provider: StorageProviderId,
  key: string,
  fileData: ArrayBuffer | Uint8Array,
  opts?: { accountId?: string; contentType?: string }
): Promise<void> {
  const bytes = fileData instanceof ArrayBuffer ? new Uint8Array(fileData) : fileData;
  const base64 = bytesToBase64(bytes);
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

export interface ResolveFileUrlOptions {
  thumbnail?: boolean;
  accountId?: string;
  ownerPnIdentifier?: string;
}

export function resolveFileUrl(
  pnIdentifier: string,
  backend: string,
  backendFileId: string,
  accountId?: string,
  opts?: Omit<ResolveFileUrlOptions, 'accountId'>
): string {
  const provider = normalizeBackend(backend);
  const endpoint = API_ENDPOINT;
  const resolvedAccountId = accountId ?? opts?.accountId;

  if (provider === 'google_drive') {
    const q = new URLSearchParams();
    if (opts?.thumbnail) {
      q.set('thumbnail', 'true');
    } else {
      q.set('download', 'true');
    }
    if (resolvedAccountId) q.set('accountId', resolvedAccountId);
    if (opts?.ownerPnIdentifier) q.set('ownerPnIdentifier', opts.ownerPnIdentifier);
    return `${endpoint}/api/drive/files/${encodeURIComponent(backendFileId)}?${q}`;
  }

  const q = new URLSearchParams({
    provider,
    key: backendFileId,
    download: 'true',
    ...(resolvedAccountId ? { accountId: resolvedAccountId } : {})
  });
  return `${endpoint}/api/storage/blobs/${encodeURIComponent(pnIdentifier)}/download?${q}`;
}

export function resolveThumbnailUrl(
  pnIdentifier: string,
  backend: string,
  backendFileId: string,
  accountId?: string
): string {
  const provider = normalizeBackend(backend);
  if (provider === 'google_drive') {
    return resolveFileUrl(pnIdentifier, backend, backendFileId, accountId, { thumbnail: true });
  }
  return resolveFileUrl(pnIdentifier, backend, backendFileId, accountId);
}

export async function fetchStorageFile(
  authToken: string,
  pnIdentifier: string,
  backend: string,
  backendFileId: string,
  opts?: ResolveFileUrlOptions
): Promise<Response> {
  const url = resolveFileUrl(pnIdentifier, backend, backendFileId, opts?.accountId, opts);
  return fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
}

export async function downloadStorageBlob(
  authToken: string,
  pnIdentifier: string,
  backend: string,
  backendFileId: string,
  opts?: ResolveFileUrlOptions
): Promise<Blob> {
  const provider = normalizeBackend(backend);
  if (provider === 'google_drive') {
    const res = await fetchStorageFile(authToken, pnIdentifier, backend, backendFileId, opts);
    if (!res.ok) throw new Error('File download failed');
    return res.blob();
  }
  return downloadBlob(
    authToken,
    pnIdentifier,
    provider,
    backendFileId,
    opts?.accountId
  );
}

export interface UploadDriveFileOptions {
  fileData: string;
  fileName: string;
  mimeType?: string;
  accountId?: string;
  parents?: string[];
  encrypt?: boolean;
}

export async function uploadDriveFile(
  authToken: string,
  opts: UploadDriveFileOptions
): Promise<{ id: string }> {
  const res = await fetch(`${API_ENDPOINT}/api/drive/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileData: opts.fileData,
      fileName: opts.fileName,
      mimeType: opts.mimeType ?? 'application/json',
      accountId: opts.accountId,
      parents: opts.parents,
      encrypt: opts.encrypt
    })
  });
  if (!res.ok) {
    const err = (await res.text().catch(() => 'Unknown error'));
    throw new Error(`Upload failed: ${err}`);
  }
  const result = await res.json();
  const id = result.file?.id;
  if (!id) throw new Error('Upload succeeded but no file id returned');
  return { id };
}

export interface UploadStorageFileOptions {
  fileData: string | Uint8Array;
  fileName: string;
  mimeType?: string;
  accountId?: string;
  key?: string;
  parents?: string[];
  encrypt?: boolean;
}

export async function uploadStorageFile(
  authToken: string,
  pnIdentifier: string,
  backend: string,
  opts: UploadStorageFileOptions
): Promise<{ id: string; backend: StorageProviderId }> {
  const provider = normalizeBackend(backend);
  if (provider === 'google_drive') {
    const base64 =
      typeof opts.fileData === 'string' ? opts.fileData : bytesToBase64(opts.fileData);
    const { id } = await uploadDriveFile(authToken, {
      fileData: base64,
      fileName: opts.fileName,
      mimeType: opts.mimeType,
      accountId: opts.accountId,
      parents: opts.parents,
      encrypt: opts.encrypt
    });
    return { id, backend: 'google_drive' };
  }

  const bytes =
    typeof opts.fileData === 'string'
      ? Uint8Array.from(atob(opts.fileData), (c) => c.charCodeAt(0))
      : opts.fileData;
  const key = opts.key ?? opts.fileName;
  await uploadBlob(authToken, pnIdentifier, provider, key, bytes, {
    accountId: opts.accountId,
    contentType: opts.mimeType || 'application/octet-stream'
  });
  return { id: key, backend: provider };
}

export async function deleteStorageFile(
  authToken: string,
  pnIdentifier: string,
  backend: string,
  backendFileId: string,
  accountId?: string
): Promise<void> {
  const provider = normalizeBackend(backend);
  if (provider === 'google_drive') {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    const res = await fetch(`${API_ENDPOINT}/api/drive/files/${encodeURIComponent(backendFileId)}${q}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error('File delete failed');
    return;
  }

  const q = new URLSearchParams({
    provider,
    key: backendFileId,
    ...(accountId ? { accountId } : {})
  });
  const res = await fetch(
    `${API_ENDPOINT}/api/storage/blobs/${encodeURIComponent(pnIdentifier)}?${q}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    }
  );
  if (!res.ok) throw new Error('Blob delete failed');
}

export interface ListedStorageFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime?: string;
  accountId?: string;
}

function guessMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.encrypted')) return 'application/json';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.thought')) return 'application/json';
  if (lower.endsWith('.thought-collection')) return 'application/json';
  if (lower.includes('folder')) return 'application/vnd.google-apps.folder';
  return 'application/octet-stream';
}

function mapBlobEntry(
  entry: { key: string; size: number; lastModified?: string },
  accountId: string
): ListedStorageFile {
  const name = entry.key.split('/').pop() || entry.key;
  return {
    id: entry.key,
    name,
    mimeType: guessMimeType(name),
    size: String(entry.size),
    modifiedTime: entry.lastModified,
    accountId
  };
}

export async function listStorageFiles(
  authToken: string,
  pnIdentifier: string,
  provider: string,
  accountId?: string,
  prefix?: string
): Promise<ListedStorageFile[]> {
  const backend = normalizeBackend(provider);
  if (backend === 'google_drive') {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    const res = await fetch(`${API_ENDPOINT}/api/drive/files${q}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      throw new Error(`Failed to list files: ${err}`);
    }
    const data = await res.json();
    return (data.files || []).map((file: { id: string; name: string; mimeType?: string; size?: string; modifiedTime?: string }) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType || guessMimeType(file.name),
      size: file.size || '0',
      modifiedTime: file.modifiedTime,
      accountId
    }));
  }

  const q = new URLSearchParams({
    provider: backend,
    ...(prefix ? { prefix } : {}),
    ...(accountId ? { accountId } : {})
  });
  const res = await fetch(
    `${API_ENDPOINT}/api/storage/blobs/${encodeURIComponent(pnIdentifier)}?${q}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to list blobs: ${err}`);
  }
  const data = await res.json();
  return (data.files || []).map((entry: { key: string; size: number; lastModified?: string }) =>
    mapBlobEntry(entry, accountId || '')
  );
}

export async function fetchStorageAccounts(
  authToken: string,
  pnIdentifier: string
): Promise<{ connected: boolean; accounts: Array<{ provider: string; accountId: string }> }> {
  const res = await fetch(`${API_ENDPOINT}/api/storage/accounts/${encodeURIComponent(pnIdentifier)}`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    return { connected: false, accounts: [] };
  }
  const data = await res.json();
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  return { connected: accounts.length > 0, accounts };
}
