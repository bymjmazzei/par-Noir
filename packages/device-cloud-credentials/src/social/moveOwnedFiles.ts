import { encryptedMediaPath, type ContentClass, type StorageProviderId } from '@par-noir/user-owned-storage';
import { deviceBlobStoreForSession, type DeviceBlobStore } from '../deviceBlobStore.js';
import { deviceFileIndex } from './fileIndex.js';
import type { DeviceSocialContext } from './socialContext.js';

export type FileMoveResult = { fileId: string; ok: boolean; error?: string };

type OpenStore = (provider: StorageProviderId, accountId?: string) => DeviceBlobStore;

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Move (or copy) owned files between connected non-Google clouds on the
 * device, then point the owner and public index rows at the new copy.
 */
export async function moveOwnedFilesOnDevice(args: {
  pnIdentifier: string;
  social: DeviceSocialContext;
  fileIds: readonly string[];
  destProvider: StorageProviderId;
  destAccountId?: string;
  mode?: 'move' | 'copy';
  openStore?: OpenStore;
}): Promise<FileMoveResult[]> {
  const { social, fileIds, destProvider, destAccountId, mode = 'move' } = args;
  const openStore: OpenStore =
    args.openStore ?? ((provider, accountId) => deviceBlobStoreForSession(args.pnIdentifier, { provider, accountId }));
  if (destProvider === 'google_drive') {
    return fileIds.map((fileId) => ({ fileId, ok: false, error: 'Upload to Google Drive from the file picker' }));
  }

  const ownerIndex = deviceFileIndex(social, 'owner');
  const publicIndex = deviceFileIndex(social, 'public');
  const owned = await ownerIndex.list();
  const published = await publicIndex.list();
  const dest = openStore(destProvider, destAccountId);
  const results: FileMoveResult[] = [];

  for (const fileId of fileIds) {
    try {
      const entry = owned.find((row) => text(row.fileId) === fileId);
      if (!entry) {
        results.push({ fileId, ok: false, error: 'Not in owner index' });
        continue;
      }
      const srcBackend = (text(entry.backend) || 'google_drive') as StorageProviderId;
      if (srcBackend === 'google_drive') {
        results.push({ fileId, ok: false, error: 'Download from Google Drive and upload to the new cloud' });
        continue;
      }
      const srcAccountId = text(entry.backendAccountId) || undefined;
      if (srcBackend === destProvider && srcAccountId === destAccountId) {
        results.push({ fileId, ok: true });
        continue;
      }
      const srcKey = text(entry.backendFileId) || text(entry.googleDriveFileId) || fileId;
      const src = openStore(srcBackend, srcAccountId);
      const data = await src.get(srcKey);
      if (!data) {
        results.push({ fileId, ok: false, error: 'Source blob missing' });
        continue;
      }
      const contentClass = (text(entry.contentClass) || 'media') as ContentClass;
      const newKey = encryptedMediaPath(contentClass, fileId);
      await dest.put(newKey, data, { contentType: 'application/octet-stream' });

      const location = { backend: destProvider, backendFileId: newKey, backendAccountId: destAccountId };
      await ownerIndex.upsert({ ...entry, ...location, googleDriveFileId: newKey });
      const publicRow = published.find((row) => text(row.fileId) === fileId);
      if (publicRow) await publicIndex.upsert({ ...publicRow, ...location, googleDriveFileId: newKey });

      if (mode === 'move') await src.delete(srcKey);
      results.push({ fileId, ok: true });
    } catch (err) {
      results.push({ fileId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
