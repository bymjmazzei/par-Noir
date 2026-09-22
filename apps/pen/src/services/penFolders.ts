/** Local folder index for My Library organization. */

const prefix = (pn: string) => `pen_folders_v1:${pn}`;

export interface PenFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

export function listFolders(pn: string): PenFolder[] {
  try {
    const raw = localStorage.getItem(`${prefix(pn)}:index`);
    return raw ? (JSON.parse(raw) as PenFolder[]) : [];
  } catch {
    return [];
  }
}

function saveFolders(pn: string, folders: PenFolder[]): void {
  localStorage.setItem(`${prefix(pn)}:index`, JSON.stringify(folders));
}

export function createFolder(
  pn: string,
  name: string,
  parentId: string | null = null
): PenFolder {
  const folder: PenFolder = {
    id: `fld_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    name: name.trim() || 'Untitled folder',
    parentId,
    createdAt: new Date().toISOString()
  };
  saveFolders(pn, [folder, ...listFolders(pn)]);
  return folder;
}

export function renameFolder(pn: string, folderId: string, name: string): void {
  const next = listFolders(pn).map((f) =>
    f.id === folderId ? { ...f, name: name.trim() || f.name } : f
  );
  saveFolders(pn, next);
}

export function deleteFolder(pn: string, folderId: string): void {
  saveFolders(
    pn,
    listFolders(pn).filter((f) => f.id !== folderId && f.parentId !== folderId)
  );
}

export function listChildFolders(pn: string, parentId: string | null): PenFolder[] {
  return listFolders(pn).filter((f) => f.parentId === parentId);
}
