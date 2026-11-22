/**
 * Device-custody Pen tree on the mounted secure volume.
 * Layout: {mount}/par-noir-pen/{docId}/draft.enc | meta.json | media/{id}.pnm1
 */
import path from 'path';

export const PEN_TREE_DIR = 'par-noir-pen';

export function penTreeRoot(mountPoint: string): string {
  return path.join(mountPoint, PEN_TREE_DIR);
}

export function penDocDir(mountPoint: string, docId: string): string {
  return path.join(penTreeRoot(mountPoint), sanitizeSegment(docId));
}

export function penDraftPath(mountPoint: string, docId: string): string {
  return path.join(penDocDir(mountPoint, docId), 'draft.enc');
}

export function penMetaPath(mountPoint: string, docId: string): string {
  return path.join(penDocDir(mountPoint, docId), 'meta.json');
}

export function penMediaDir(mountPoint: string, docId: string): string {
  return path.join(penDocDir(mountPoint, docId), 'media');
}

export function penMediaPath(mountPoint: string, docId: string, mediaId: string): string {
  return path.join(penMediaDir(mountPoint, docId), `${sanitizeSegment(mediaId)}.pnm1`);
}

/** True when `candidate` is under `{mount}/par-noir-pen/` (no path escape). */
export function isPathUnderPenTree(mountPoint: string, candidate: string): boolean {
  const root = path.resolve(penTreeRoot(mountPoint));
  const resolved = path.resolve(candidate);
  return resolved === root || resolved.startsWith(root + path.sep);
}

function sanitizeSegment(name: string): string {
  return name.replace(/[\/:*?"<>|]+/g, '_').trim() || 'unknown';
}
