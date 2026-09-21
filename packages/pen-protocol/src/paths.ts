/** Path helpers + dated past/ naming for Pen folder SoT. */

export const PEN_ROOT = 'par-noir-pen';

export function docRootPath(docId: string): string {
  return `${PEN_ROOT}/${sanitizeSegment(docId)}`;
}

export function docManifestPath(docId: string): string {
  return `${docRootPath(docId)}/doc.json`;
}

export function historyChainPath(docId: string): string {
  return `${docRootPath(docId)}/history.chain`;
}

export function sectionDirPath(docId: string, sectionSlug: string): string {
  return `${docRootPath(docId)}/sections/${sanitizeSegment(sectionSlug)}`;
}

/** Fixed current filename for a section. */
export function sectionCurrentPath(docId: string, sectionSlug: string): string {
  const slug = sanitizeSegment(sectionSlug);
  return `${sectionDirPath(docId, slug)}/${slug}.pen`;
}

export function sectionPastDirPath(docId: string, sectionSlug: string): string {
  return `${sectionDirPath(docId, sectionSlug)}/past`;
}

/**
 * Past filename with date in title.
 * Same calendar day → include time suffix to avoid collision.
 */
export function pastFileName(sectionSlug: string, updatedAt: Date, opts?: { forceTime?: boolean }): string {
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

export function sectionPastPath(
  docId: string,
  sectionSlug: string,
  updatedAt: Date,
  opts?: { forceTime?: boolean }
): string {
  return `${sectionPastDirPath(docId, sectionSlug)}/${pastFileName(sectionSlug, updatedAt, opts)}`;
}

export interface PromotePaths {
  currentPath: string;
  pastPath: string;
  pastName: string;
}

/** Pure promote naming: where to move current and what to call it. */
export function promoteSectionToPast(
  docId: string,
  sectionSlug: string,
  updatedAt: Date,
  opts?: { forceTime?: boolean }
): PromotePaths {
  const pastName = pastFileName(sectionSlug, updatedAt, opts);
  return {
    currentPath: sectionCurrentPath(docId, sectionSlug),
    pastPath: `${sectionPastDirPath(docId, sectionSlug)}/${pastName}`,
    pastName
  };
}

function sanitizeSegment(s: string): string {
  return String(s || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128) || 'section';
}
