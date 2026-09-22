/** Path helpers for Pen folder SoT: current / drafts / past per doc. */

export const PEN_ROOT = 'par-noir-pen';

export function sanitizeSegment(s: string): string {
  return (
    String(s || '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) || 'section'
  );
}

export function docRootPath(docId: string): string {
  return `${PEN_ROOT}/${sanitizeSegment(docId)}`;
}

export function docManifestPath(docId: string): string {
  return `${docRootPath(docId)}/doc.json`;
}

export function historyChainPath(docId: string): string {
  return `${docRootPath(docId)}/history.chain`;
}

export function commentsJsonlPath(docId: string): string {
  return `${docRootPath(docId)}/comments.jsonl`;
}

/** Live published tree. */
export function currentDirPath(docId: string): string {
  return `${docRootPath(docId)}/current`;
}

export function currentSectionPath(docId: string, sectionSlug: string): string {
  const slug = sanitizeSegment(sectionSlug);
  return `${currentDirPath(docId)}/${slug}.pen`;
}

export function draftsDirPath(docId: string): string {
  return `${docRootPath(docId)}/drafts`;
}

export function draftDirPath(docId: string, draftId: string): string {
  return `${draftsDirPath(docId)}/${sanitizeSegment(draftId)}`;
}

export function draftManifestPath(docId: string, draftId: string): string {
  return `${draftDirPath(docId, draftId)}/draft.json`;
}

export function draftSectionPath(docId: string, draftId: string, sectionSlug: string): string {
  const slug = sanitizeSegment(sectionSlug);
  return `${draftDirPath(docId, draftId)}/${slug}.pen`;
}

export function pastDirPath(docId: string): string {
  return `${docRootPath(docId)}/past`;
}

export function pastVersionDirPath(docId: string, versionId: string): string {
  return `${pastDirPath(docId)}/${sanitizeSegment(versionId)}`;
}

export function pastSectionPath(docId: string, versionId: string, sectionSlug: string): string {
  const slug = sanitizeSegment(sectionSlug);
  return `${pastVersionDirPath(docId, versionId)}/${slug}.pen`;
}

/**
 * Version folder name when publishing (supersede current → past).
 * Same calendar day → include time suffix to avoid collision.
 */
export function pastVersionId(updatedAt: Date, opts?: { forceTime?: boolean }): string {
  const y = updatedAt.getUTCFullYear();
  const m = String(updatedAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(updatedAt.getUTCDate()).padStart(2, '0');
  const date = `${y}-${m}-${d}`;
  if (opts?.forceTime) {
    const hh = String(updatedAt.getUTCHours()).padStart(2, '0');
    const mm = String(updatedAt.getUTCMinutes()).padStart(2, '0');
    const ss = String(updatedAt.getUTCSeconds()).padStart(2, '0');
    return `v-${date}T${hh}${mm}${ss}Z`;
  }
  return `v-${date}`;
}

export interface PublishPaths {
  currentDir: string;
  pastDir: string;
  versionId: string;
}

/** Pure publish naming: where to move current and the new past version id. */
export function publishCurrentToPast(
  docId: string,
  updatedAt: Date,
  opts?: { forceTime?: boolean }
): PublishPaths {
  const versionId = pastVersionId(updatedAt, opts);
  return {
    currentDir: currentDirPath(docId),
    pastDir: pastVersionDirPath(docId, versionId),
    versionId
  };
}

/** @deprecated Use currentSectionPath — kept for migrate-on-load of legacy trees. */
export function sectionCurrentPath(docId: string, sectionSlug: string): string {
  return currentSectionPath(docId, sectionSlug);
}

/** @deprecated Legacy section-level past naming. */
export function pastFileName(
  sectionSlug: string,
  updatedAt: Date,
  opts?: { forceTime?: boolean }
): string {
  const slug = sanitizeSegment(sectionSlug);
  const y = updatedAt.getUTCFullYear();
  const m = String(updatedAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(updatedAt.getUTCDate()).padStart(2, '0');
  const date = `${y}-${m}-${d}`;
  if (opts?.forceTime) {
    const hh = String(updatedAt.getUTCHours()).padStart(2, '0');
    const mm = String(updatedAt.getUTCMinutes()).padStart(2, '0');
    const ss = String(updatedAt.getUTCSeconds()).padStart(2, '0');
    return `${slug}-${date}T${hh}${mm}${ss}Z.pen`;
  }
  return `${slug}-${date}.pen`;
}

/** @deprecated Prefer publishCurrentToPast for doc-level publish. */
export interface PromotePaths {
  currentPath: string;
  pastPath: string;
  pastName: string;
}

/** @deprecated Section-level promote; new flows use drafts + publishCurrentToPast. */
export function promoteSectionToPast(
  docId: string,
  sectionSlug: string,
  updatedAt: Date,
  opts?: { forceTime?: boolean }
): PromotePaths {
  const pastName = pastFileName(sectionSlug, updatedAt, opts);
  const versionId = pastVersionId(updatedAt, opts);
  return {
    currentPath: currentSectionPath(docId, sectionSlug),
    pastPath: pastSectionPath(docId, versionId, sectionSlug),
    pastName
  };
}
