import { encryptedMediaPath, type ContentClass } from '@par-noir/user-owned-storage/pn-layout';
import type { StorageProviderId } from '@par-noir/user-owned-storage';
import { deviceBlobStoreForSession } from '@par-noir/device-cloud-credentials';
import { AbstractStorageBackend, type StorageFile, type StorageQuota, type StorageUserInfo } from './StorageBackend';

export class PortableBlobBackend extends AbstractStorageBackend {
  readonly provider: string;
  readonly accountId: string;
  private connected = true;

  constructor(
    private pnIdentifier: string,
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

  async ensureFilesFolder(_pnIdentifier: string): Promise<string> {
    return '';
  }

  /** Files live in the owner's cloud; the device reads and writes them directly. */
  private store() {
    return deviceBlobStoreForSession(this.pnIdentifier, {
      provider: this.provider as StorageProviderId,
      accountId: this.accountId
    });
  }

  async listFiles(_pnIdentifier?: string): Promise<StorageFile[]> {
    const entries = await this.store().list('_metadata/');
    return entries.map((f) => ({
      id: f.key,
      name: f.key.split('/').pop() || f.key,
      mimeType: 'application/octet-stream',
      size: f.size ?? 0,
      modifiedTime: f.lastModified || new Date().toISOString()
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
    await this.store().put(key, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream'
    });
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
    const bytes = await this.store().get(fileKey);
    if (!bytes) throw new Error('File not found in your cloud');
    return new Blob([bytes as BlobPart]);
  }

  async deleteFile(fileKey: string): Promise<void> {
    await this.store().delete(fileKey);
  }

  async getQuota(): Promise<StorageQuota | null> {
    return null;
  }

  async getUserInfo(): Promise<StorageUserInfo | null> {
    return { displayName: this.provider };
  }
}
