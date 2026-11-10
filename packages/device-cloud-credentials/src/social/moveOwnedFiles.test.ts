import { describe, expect, it } from 'vitest';
import { MemoryBlobStore, type StorageProviderId } from '@par-noir/user-owned-storage';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage/sqlite';
import type { DeviceBlobStore } from '../deviceBlobStore.js';
import { deviceFileIndex } from './fileIndex.js';
import { moveOwnedFilesOnDevice } from './moveOwnedFiles.js';
import type { TablesSocialContext } from './socialContext.js';

describe('moving owned files between clouds on the device', () => {
  it('copies the blob, repoints owner and public rows, and deletes the source', async () => {
    const socialBlobs = new MemoryBlobStore();
    const social: TablesSocialContext = {
      kind: 'tables',
      provider: 'azure_blob',
      tables: new SqliteBlobTableAdapter(socialBlobs, 'root/'),
      blobs: socialBlobs as unknown as DeviceBlobStore,
      layoutRoot: 'root/',
    };
    const stores = new Map<string, MemoryBlobStore>();
    const openStore = (provider: StorageProviderId, accountId?: string) => {
      const key = `${provider}|${accountId ?? ''}`;
      if (!stores.has(key)) stores.set(key, new MemoryBlobStore());
      return stores.get(key) as unknown as DeviceBlobStore;
    };
    const src = openStore('azure_blob', 'az1');
    await src.put('files/media/f1.enc', new Uint8Array([1, 2, 3]));
    const row = { fileId: 'f1', backend: 'azure_blob', backendAccountId: 'az1', backendFileId: 'files/media/f1.enc', contentClass: 'media' };
    await deviceFileIndex(social, 'owner').upsert(row);
    await deviceFileIndex(social, 'public').upsert({ ...row, visibility: 'public' });

    const results = await moveOwnedFilesOnDevice({
      pnIdentifier: 'pn-me',
      social,
      fileIds: ['f1', 'missing'],
      destProvider: 'dropbox',
      destAccountId: 'db1',
      openStore,
    });

    expect(results).toEqual([
      { fileId: 'f1', ok: true },
      { fileId: 'missing', ok: false, error: 'Not in owner index' },
    ]);
    const owner = (await deviceFileIndex(social, 'owner').list()).find((r) => r.fileId === 'f1');
    const pub = (await deviceFileIndex(social, 'public').list()).find((r) => r.fileId === 'f1');
    expect(owner).toMatchObject({ backend: 'dropbox', backendAccountId: 'db1' });
    const newKey = String(owner?.backendFileId);
    expect(pub?.googleDriveFileId).toBe(newKey);
    expect(await openStore('dropbox', 'db1').get(newKey)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await src.get('files/media/f1.enc')).toBeNull();
  });
});
