/**
 * Child folders under the pN root. Names match api/src/server/modules/storage/rootBlobLayout.ts.
 * Callers read these ids. They do not upload into the pN folder itself.
 */

import { deviceDriveCall } from './deviceDriveCall.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';

const FOLDER = 'application/vnd.google-apps.folder';

export type OwnerBlobFolders = {
  filesFolderId: string;
  contentFolderId: string;
  contentNotesFolderId: string;
  contentMediaFolderId: string;
  contentCollectionsFolderId: string;
};

export type ContentBlobClass = 'notes' | 'media' | 'collections' | 'files';

async function findChildFolder(
  accessToken: string,
  parentId: string,
  name: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER}' and trashed=false`
  );
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${q}&pageSize=5`, undefined, {
    accessToken,
    fetchImpl,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
  return data.files?.find((file) => file.id && file.name === name)?.id || null;
}

async function ensureChildFolder(
  accessToken: string,
  parentId: string,
  name: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const existing = await findChildFolder(accessToken, parentId, name, fetchImpl);
  if (existing) return existing;
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/folders',
    { folderName: name, parentFolderId: parentId },
    { accessToken, fetchImpl }
  );
  if (!res.ok) throw new Error(`blob_folder_create_failed_${res.status}`);
  const data = (await res.json()) as { folder?: { id?: string } };
  if (!data.folder?.id) throw new Error('blob_folder_create_no_id');
  return data.folder.id;
}

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
    index.filesFolderId || (await ensureChildFolder(accessToken, index.pnFolderId, 'files', fetchImpl));
  const contentFolderId =
    index.contentFolderId ||
    (await ensureChildFolder(accessToken, index.pnFolderId, 'content', fetchImpl));
  const contentNotesFolderId =
    index.contentNotesFolderId ||
    (await ensureChildFolder(accessToken, contentFolderId, 'notes', fetchImpl));
  const contentMediaFolderId =
    index.contentMediaFolderId ||
    (await ensureChildFolder(accessToken, contentFolderId, 'media', fetchImpl));
  const contentCollectionsFolderId =
    index.contentCollectionsFolderId ||
    (await ensureChildFolder(accessToken, contentFolderId, 'collections', fetchImpl));
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
