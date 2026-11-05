/**
 * Child folders under the pN root. Names match api/src/server/modules/storage/rootBlobLayout.ts.
 * Callers read these ids. They do not upload into the pN folder itself.
 */

import type { DeviceDriveLayout } from './deviceDriveLayout.js';
import { ensureDriveChildFolder } from './driveChild.js';

export type OwnerBlobFolders = {
  filesFolderId: string;
  contentFolderId: string;
  contentNotesFolderId: string;
  contentMediaFolderId: string;
  contentCollectionsFolderId: string;
};

export type ContentBlobClass = 'notes' | 'media' | 'collections' | 'files';

export async function ensureOwnerBlobFolders(
  accessToken: string,
  index: DeviceDriveLayout,
  fetchImpl?: typeof fetch
): Promise<OwnerBlobFolders> {
  if (
    index.filesFolderId &&
    index.contentFolderId &&
    index.contentNotesFolderId &&
    index.contentMediaFolderId &&
    index.contentCollectionsFolderId
  ) {
    return {
      filesFolderId: index.filesFolderId,
      contentFolderId: index.contentFolderId,
      contentNotesFolderId: index.contentNotesFolderId,
      contentMediaFolderId: index.contentMediaFolderId,
      contentCollectionsFolderId: index.contentCollectionsFolderId,
    };
  }
  const filesFolderId =
    index.filesFolderId || (await ensureDriveChildFolder(accessToken, index.pnFolderId, 'files', fetchImpl));
  const contentFolderId =
    index.contentFolderId ||
    (await ensureDriveChildFolder(accessToken, index.pnFolderId, 'content', fetchImpl));
  const contentNotesFolderId =
    index.contentNotesFolderId ||
    (await ensureDriveChildFolder(accessToken, contentFolderId, 'notes', fetchImpl));
  const contentMediaFolderId =
    index.contentMediaFolderId ||
    (await ensureDriveChildFolder(accessToken, contentFolderId, 'media', fetchImpl));
  const contentCollectionsFolderId =
    index.contentCollectionsFolderId ||
    (await ensureDriveChildFolder(accessToken, contentFolderId, 'collections', fetchImpl));
  return {
    filesFolderId,
    contentFolderId,
    contentNotesFolderId,
    contentMediaFolderId,
    contentCollectionsFolderId,
  };
}

export function blobFolderId(folders: OwnerBlobFolders, kind: ContentBlobClass): string {
  if (kind === 'notes') return folders.contentNotesFolderId;
  if (kind === 'media') return folders.contentMediaFolderId;
  if (kind === 'collections') return folders.contentCollectionsFolderId;
  return folders.filesFolderId;
}
