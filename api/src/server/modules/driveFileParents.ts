/**
 * First-party file uploads must name a child of the pN root.
 * The pN folder itself holds only layout folders.
 */

export function rejectPnRootFileParent(
  parents: string[] | undefined,
  pnFolderId: string | undefined
): { ok: true; parents: string[] } | { ok: false; error: string } {
  const list = (parents || []).map((id) => id.trim()).filter(Boolean);
  if (list.length === 0) {
    return {
      ok: false,
      error: 'A file upload must name a folder inside the pN root.',
    };
  }
  if (pnFolderId && list.includes(pnFolderId)) {
    return {
      ok: false,
      error: 'Files cannot be uploaded into the pN root. Choose a child folder.',
    };
  }
  return { ok: true, parents: list };
}
