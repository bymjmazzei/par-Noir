/**
 * Canonical owner blob folders under the pN root. Every explorer scans the same set:
 * `files/` (dashboard + private uploads) and `content/{notes,media,collections}` (browse uploads).
 */

export interface OwnerScanFolders {
  filesFolderId?: string | null;
  contentNotesFolderId?: string | null;
  contentMediaFolderId?: string | null;
  contentCollectionsFolderId?: string | null;
}

export function ownerScanFolderIds(folders: OwnerScanFolders): string[] {
  const ids = [
    folders.filesFolderId,
    folders.contentNotesFolderId,
    folders.contentMediaFolderId,
    folders.contentCollectionsFolderId
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !id || id === 'NOT_CONNECTED' || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
