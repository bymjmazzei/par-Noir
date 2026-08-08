import { encryptedMediaPath, type ContentClass } from '@par-noir/user-owned-storage/pn-layout';
import { ownerFetch, ownerGet } from '../ownerApiService';
import { AbstractStorageBackend, type StorageFile, type StorageQuota, type StorageUserInfo } from './StorageBackend';

export class PortableBlobBackend extends AbstractStorageBackend {
  readonly provider: string;
  readonly accountId: string;
  private connected = true;

  constructor(
    private pnIdentifier: string,
    private authToken: string,
    provider: string,
    accountId: string
  ) {
    super();
    this.provider = provider;
    this.accountId = accountId;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getOrCreateFolder(_name: string, _pnIdentifier?: string): Promise<string> {
    return '';
  }

  async listFiles(_pnIdentifier?: string): Promise<StorageFile[]> {
    const res = await ownerFetch(
      this.authToken,
      'GET',
      `/api/storage/blobs/${encodeURIComponent(this.pnIdentifier)}?provider=${encodeURIComponent(this.provider)}&accountId=${encodeURIComponent(this.accountId)}&prefix=_metadata/`,
      undefined,
      { pnIdentifier: this.pnIdentifier }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { files?: Array<{ key: string; size?: number }> };
    return (data.files ?? []).map((f) => ({
      id: f.key,
      name: f.key.split('/').pop() || f.key,
      mimeType: 'application/octet-stream',
      size: f.size ?? 0,
      modifiedTime: new Date().toISOString()
    }));
  }

  async uploadFile(
    file: File,
    _folderId?: string,
    metadata?: unknown
  ): Promise<StorageFile> {
    const fileId = crypto.randomUUID();
    const contentClass =
      typeof metadata === 'object' && metadata !== null && 'contentClass' in metadata
        ? metadata.contentClass as ContentClass
        : 'media';
    const key = encryptedMediaPath(contentClass, fileId);
    const buf = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const res = await ownerFetch(
      this.authToken,
      'POST',
      `/api/storage/blobs/${encodeURIComponent(this.pnIdentifier)}/upload`,
      {
        provider: this.provider,
        accountId: this.accountId,
        key,
        fileData: base64,
        contentType: file.type || 'application/octet-stream'
      },
      { pnIdentifier: this.pnIdentifier }
    );
    if (!res.ok) throw new Error('Portable upload failed');
    return {
      id: fileId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      modifiedTime: new Date().toISOString(),
      backend: this.provider,
      backendFileId: key
    } as StorageFile & { backend?: string; backendFileId?: string };
  }

  async downloadFile(fileKey: string): Promise<Blob> {
    const path =
      `/api/storage/blobs/${encodeURIComponent(this.pnIdentifier)}/download` +
      `?provider=${encodeURIComponent(this.provider)}` +
      `&accountId=${encodeURIComponent(this.accountId)}` +
      `&key=${encodeURIComponent(fileKey)}` +
      `&download=true`;
    const res = await ownerGet(this.authToken, path, { pnIdentifier: this.pnIdentifier });
    if (!res.ok) throw new Error('Portable download failed');
    return res.blob();
  }

  async deleteFile(fileKey: string): Promise<void> {
    const res = await ownerFetch(
      this.authToken,
      'DELETE',
      `/api/storage/blobs/${encodeURIComponent(this.pnIdentifier)}?provider=${encodeURIComponent(this.provider)}&accountId=${encodeURIComponent(this.accountId)}&key=${encodeURIComponent(fileKey)}`,
      undefined,
      { pnIdentifier: this.pnIdentifier }
    );
    if (!res.ok) throw new Error('Portable delete failed');
  }

  async getQuota(): Promise<StorageQuota | null> {
    return null;
  }

  async getUserInfo(): Promise<StorageUserInfo | null> {
    return { displayName: this.provider };
  }
}
