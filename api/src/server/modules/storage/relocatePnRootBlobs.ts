/**
 * Move non-folder children of the pN root into files/, content/*, or par-noir-pen/.
 */

import { driveV3FetchWithRetry } from '../googleApiRetry';
import {
  findFolderByNameUnderParent,
  findOrCreateFolderUnderParent,
} from '../pnDriveLayout';
import { patchPnDriveIndex } from '../pnDriveIndex';
import {
  classifyRootBlob,
  CONTENT_COLLECTIONS_FOLDER_NAME,
  CONTENT_FOLDER_NAME,
  CONTENT_MEDIA_FOLDER_NAME,
  CONTENT_NOTES_FOLDER_NAME,
  FILES_FOLDER_NAME,
  LOOSE_MEDIA_FOLDER_NAME,
  PEN_ROOT_FOLDER_NAME,
} from './rootBlobLayout';

const FOLDER = 'application/vnd.google-apps.folder';

export type BlobFolderIds = {
  filesFolderId: string;
  contentFolderId: string;
  contentNotesFolderId: string;
  contentMediaFolderId: string;
  contentCollectionsFolderId: string;
};

type DriveFile = { id: string; name: string; mimeType?: string };

async function listChildren(accessToken: string, parentId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = '';
  do {
    const q = `'${parentId}' in parents and trashed=false`;
    let path = `/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType)&pageSize=100`;
    if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await driveV3FetchWithRetry(accessToken, path, undefined, 'listPnRootChildren');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to list pN root children: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(data.files || []).filter((f) => f.id && f.name));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function moveFile(
  accessToken: string,
  fileId: string,
  fromParentId: string,
  toParentId: string
): Promise<void> {
  const path =
    `/files/${encodeURIComponent(fileId)}` +
    `?addParents=${encodeURIComponent(toParentId)}` +
    `&removeParents=${encodeURIComponent(fromParentId)}` +
    '&fields=id,parents';
  const res = await driveV3FetchWithRetry(accessToken, path, { method: 'PATCH' }, 'moveRootBlob');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to move ${fileId}: ${res.status} ${text.slice(0, 200)}`);
  }
}

async function downloadText(accessToken: string, fileId: string): Promise<string> {
  const res = await driveV3FetchWithRetry(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?alt=media`,
    undefined,
    'readPenMediaRef'
  );
  if (!res.ok) return '';
  const text = await res.text();
  return text.length > 500_000 ? text.slice(0, 500_000) : text;
}

function collectPenMediaIds(text: string, into: Map<string, string>, docFolderId: string): void {
  const re = /penmedia:([A-Za-z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match[1]) into.set(match[1], docFolderId);
  }
}

async function penMediaOwners(
  accessToken: string,
  penRootId: string
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  const children = await listChildren(accessToken, penRootId);
  const skip = new Set(['fonts', 'templates', LOOSE_MEDIA_FOLDER_NAME]);
  for (const folder of children) {
    if (folder.mimeType !== FOLDER || skip.has(folder.name)) continue;
    const files = await listChildren(accessToken, folder.id);
    for (const file of files) {
      if (file.mimeType === FOLDER) {
        if (file.name !== 'current' && file.name !== 'drafts') continue;
        const nested = await listChildren(accessToken, file.id);
        for (const section of nested) {
          if (!section.name.endsWith('.pen') && section.name !== 'draft.json') continue;
          collectPenMediaIds(await downloadText(accessToken, section.id), owners, folder.id);
        }
        continue;
      }
      if (file.name !== 'doc.json' && !file.name.endsWith('.pen')) continue;
      collectPenMediaIds(await downloadText(accessToken, file.id), owners, folder.id);
    }
  }
  return owners;
}

async function publicFolderForDoc(
  accessToken: string,
  penRootId: string,
  docKey: string,
  notesFolderId: string
): Promise<string> {
  let key = docKey;
  while (key) {
    const existing = await findFolderByNameUnderParent(accessToken, key, penRootId);
    if (existing) return findOrCreateFolderUnderParent(accessToken, 'public', existing);
    const cut = key.lastIndexOf('-');
    if (cut <= 0) break;
    key = key.slice(0, cut);
  }
  return notesFolderId;
}

export async function relocatePnRootBlobs(opts: {
  accessToken: string;
  pnIdentifier: string;
  pnFolderId: string;
  patchIndex?: boolean;
}): Promise<BlobFolderIds> {
  const { accessToken, pnFolderId } = opts;
  const snapshot = await listChildren(accessToken, pnFolderId);
  const filesFolderId = await findOrCreateFolderUnderParent(accessToken, FILES_FOLDER_NAME, pnFolderId);
  const contentFolderId = await findOrCreateFolderUnderParent(
    accessToken,
    CONTENT_FOLDER_NAME,
    pnFolderId
  );
  const contentNotesFolderId = await findOrCreateFolderUnderParent(
    accessToken,
    CONTENT_NOTES_FOLDER_NAME,
    contentFolderId
  );
  const contentMediaFolderId = await findOrCreateFolderUnderParent(
    accessToken,
    CONTENT_MEDIA_FOLDER_NAME,
    contentFolderId
  );
  const contentCollectionsFolderId = await findOrCreateFolderUnderParent(
    accessToken,
    CONTENT_COLLECTIONS_FOLDER_NAME,
    contentFolderId
  );
  const penRootId = await findOrCreateFolderUnderParent(accessToken, PEN_ROOT_FOLDER_NAME, pnFolderId);

  const loose = snapshot.filter((file) => file.mimeType !== FOLDER);
  const needsPenMedia = loose.some((file) => classifyRootBlob(file.name).kind === 'pen-media');
  const owners = needsPenMedia ? await penMediaOwners(accessToken, penRootId) : new Map<string, string>();
  let looseMediaId: string | null = null;

  for (const file of loose) {
    const classified = classifyRootBlob(file.name);
    let dest = filesFolderId;
    if (classified.kind === 'notes') dest = contentNotesFolderId;
    else if (classified.kind === 'media') dest = contentMediaFolderId;
    else if (classified.kind === 'collections') dest = contentCollectionsFolderId;
    else if (classified.kind === 'pen-prefs') dest = penRootId;
    else if (classified.kind === 'pen-public') {
      dest = await publicFolderForDoc(accessToken, penRootId, classified.docKey, contentNotesFolderId);
    } else if (classified.kind === 'pen-media') {
      const docFolderId = owners.get(file.id);
      if (docFolderId) {
        dest = await findOrCreateFolderUnderParent(accessToken, 'media', docFolderId);
      } else {
        looseMediaId =
          looseMediaId ||
          (await findOrCreateFolderUnderParent(accessToken, LOOSE_MEDIA_FOLDER_NAME, penRootId));
        dest = looseMediaId;
      }
    }
    if (dest === pnFolderId) continue;
    await moveFile(accessToken, file.id, pnFolderId, dest);
  }

  const ids: BlobFolderIds = {
    filesFolderId,
    contentFolderId,
    contentNotesFolderId,
    contentMediaFolderId,
    contentCollectionsFolderId,
  };
  if (opts.patchIndex) {
    await patchPnDriveIndex(opts.pnIdentifier, ids);
  }
  return ids;
}
