import { PN_DID_PREFIX } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { API_ENDPOINT } from '../config/api';
import { accountsCacheService } from './accountsCacheService';
import { apiGet, ownerFetch, ownerGet } from './ownerApiFetch';
import { PNOAuthService } from './pnOAuthService';
import {
  deviceBlobStoreForSession,
  ensureOwnerBlobFolders,
  SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT,
} from '@par-noir/device-cloud-credentials';
import { ownerScanFolderIds } from '@par-noir/owner-files';
import { sessionDriveFor } from './sessionDrive';

/** Canonical cache/API key for viewer storage accounts (bare id, no pn- prefix). */
export function canonicalStorageAccountsPnId(pnIdentifier: string): string {
  if (pnIdentifier.startsWith(PN_DID_PREFIX)) return pnIdentifier;
  return pnIdentifier.startsWith('pn-') ? pnIdentifier.slice(3) : pnIdentifier;
}

function resolveStorageAccountsPnId(pnIdentifier: string): string | null {
  if (pnIdentifier.startsWith(PN_DID_PREFIX)) {
    const sessionPn = PNOAuthService.loadSession()?.pnIdentifier;
    if (sessionPn && !sessionPn.startsWith(PN_DID_PREFIX)) {
      return canonicalStorageAccountsPnId(sessionPn);
    }
    return null;
  }
  return canonicalStorageAccountsPnId(pnIdentifier);
}

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

/** Non-Google files live in the owner's cloud and are read on the device, never via the API. */
function blobStore(pnIdentifier: string, provider: StorageProviderId, accountId?: string) {
  return deviceBlobStoreForSession(pnIdentifier, { provider, accountId });
}

/** Google Drive file URL; ownerGet answers it on the device. */
function driveFileUrl(backendFileId: string, opts?: ResolveFileUrlOptions): string {
  const q = new URLSearchParams();
  q.set(opts?.thumbnail ? 'thumbnail' : 'download', 'true');
  if (opts?.accountId) q.set('accountId', opts.accountId);
  if (opts?.ownerPnIdentifier) q.set('ownerPnIdentifier', opts.ownerPnIdentifier);
  return `${API_ENDPOINT}/api/drive/files/${encodeURIComponent(backendFileId)}?${q}`;
}

export interface ResolveFileUrlOptions {
  thumbnail?: boolean;
  accountId?: string;
  ownerPnIdentifier?: string;
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
    const res = await ownerGet(driveFileUrl(backendFileId, opts), { authToken, pnIdentifier });
    if (!res.ok) throw new Error('File download failed');
    return res.blob();
  }
  const bytes = await blobStore(pnIdentifier, provider, opts?.accountId).get(backendFileId);
  if (!bytes) throw new Error('File not found in your cloud');
  return new Blob([bytes as BlobPart]);
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
  opts: UploadDriveFileOptions,
  pnIdentifier?: string
): Promise<{ id: string }> {
  const res = await ownerFetch(
    'POST',
    '/api/drive/files',
    {
      fileData: opts.fileData,
      fileName: opts.fileName,
      mimeType: opts.mimeType ?? 'application/json',
      accountId: opts.accountId,
      parents: opts.parents,
      encrypt: opts.encrypt
    },
    { authToken, pnIdentifier }
  );
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
    const { id } = await uploadDriveFile(
      authToken,
      {
        fileData: base64,
        fileName: opts.fileName,
        mimeType: opts.mimeType,
        accountId: opts.accountId,
        parents: opts.parents,
        encrypt: opts.encrypt
      },
      pnIdentifier
    );
    return { id, backend: 'google_drive' };
  }

  const bytes =
    typeof opts.fileData === 'string'
      ? Uint8Array.from(atob(opts.fileData), (c) => c.charCodeAt(0))
      : opts.fileData;
  const key = opts.key ?? opts.fileName;
  await blobStore(pnIdentifier, provider, opts.accountId).put(key, bytes, {
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
    const res = await ownerFetch(
      'DELETE',
      `/api/drive/files/${encodeURIComponent(backendFileId)}${q}`,
      undefined,
      { authToken, pnIdentifier }
    );
    if (!res.ok) throw new Error('File delete failed');
    return;
  }

  await blobStore(pnIdentifier, provider, accountId).delete(backendFileId);
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
  if (lower.endsWith('.note') || lower.endsWith('.thought')) return 'application/json';
  if (lower.endsWith('.note-collection') || lower.endsWith('.thought-collection')) return 'application/json';
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
    const drive = await sessionDriveFor(pnIdentifier);
    const folders = await ensureOwnerBlobFolders(drive.accessToken, drive.index);
    const parentIds = ownerScanFolderIds(folders);
    const listed: ListedStorageFile[] = [];
    for (const parentId of parentIds) {
      const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
      const account = accountId ? `&accountId=${encodeURIComponent(accountId)}` : '';
      const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=100${account}`, {
        authToken,
        pnIdentifier,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => 'Unknown error');
        throw new Error(`Failed to list files: ${err}`);
      }
      const data = (await res.json()) as {
        files?: Array<{
          id: string;
          name: string;
          mimeType?: string;
          size?: string;
          modifiedTime?: string;
        }>;
      };
      for (const file of data.files || []) {
        listed.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType || guessMimeType(file.name),
          size: file.size || '0',
          modifiedTime: file.modifiedTime,
          accountId,
        });
      }
    }
    return listed;
  }

  const entries = await blobStore(pnIdentifier, backend, accountId).list(prefix);
  return entries.map((entry) => mapBlobEntry(entry, accountId || ''));
}

export type StorageAccountsResult = {
  connected: boolean;
  accounts: Array<{ provider: string; accountId: string; email?: string; displayName?: string }>;
  socialCloudProvider?: string | null;
};

/** Thrown when GET /api/storage/accounts fails (do not treat as "never linked"). */
export class StorageAccountsFetchError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Storage accounts request failed (${status})`);
    this.name = 'StorageAccountsFetchError';
    this.status = status;
  }
}

const storageAccountsInflight = new Map<string, Promise<StorageAccountsResult>>();

/** Clear cached storage accounts (call on lock or after account mutations). */
export function invalidateStorageAccountsCache(pnIdentifier?: string): void {
  if (pnIdentifier) {
    const resolved = canonicalStorageAccountsPnId(pnIdentifier);
    accountsCacheService.clear(resolved);
    storageAccountsInflight.delete(resolved);
  } else {
    accountsCacheService.clearAll();
    storageAccountsInflight.clear();
  }
}

/** Read warmed viewer accounts cache without a network call. */
export function readCachedStorageAccounts(pnIdentifier: string): StorageAccountsResult | null {
  const resolvedPnId = resolveStorageAccountsPnId(pnIdentifier);
  if (!resolvedPnId) return null;
  const cached = accountsCacheService.get(resolvedPnId);
  if (!cached) return null;
  const social = cached.socialCloudProvider ?? null;
  return {
    connected: cached.accounts.length > 0 || !!social,
    accounts: cached.accounts,
    socialCloudProvider: social,
  };
}

export async function fetchStorageAccounts(
  authToken: string,
  pnIdentifier: string
): Promise<StorageAccountsResult> {
  const resolvedPnId = resolveStorageAccountsPnId(pnIdentifier);
  if (!resolvedPnId) {
    return { connected: false, accounts: [], socialCloudProvider: null };
  }

  const cached = accountsCacheService.get(resolvedPnId);
  if (cached) {
    const social = cached.socialCloudProvider ?? null;
    return {
      connected: cached.accounts.length > 0 || !!social,
      accounts: cached.accounts,
      socialCloudProvider: social
    };
  }

  const inflight = storageAccountsInflight.get(resolvedPnId);
  if (inflight) return inflight;

  const work = (async (): Promise<StorageAccountsResult> => {
    // Credentials-only list: bearer is enough; no Drive mint required.
    const res = await apiGet(`/api/storage/accounts/${encodeURIComponent(resolvedPnId)}`, {
      authToken,
      pnIdentifier: resolvedPnId
    });
    if (!res.ok) {
      throw new StorageAccountsFetchError(res.status);
    }
    const data = await res.json();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const socialCloudProvider =
      (data.socialCloudProvider as string | undefined) ??
      (data.primaryProvider as string | undefined) ??
      null;
    accountsCacheService.set(resolvedPnId, accounts, socialCloudProvider);
    return {
      connected: accounts.length > 0 || !!socialCloudProvider,
      accounts,
      socialCloudProvider
    };
  })().finally(() => {
    storageAccountsInflight.delete(resolvedPnId);
  });

  storageAccountsInflight.set(resolvedPnId, work);
  return work;
}

if (typeof window !== 'undefined') {
  window.addEventListener(SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT, (ev) => {
    const detail = (ev as CustomEvent<{ pnIdentifier?: string }>).detail;
    if (detail?.pnIdentifier) {
      invalidateStorageAccountsCache(detail.pnIdentifier);
    }
  });
}
