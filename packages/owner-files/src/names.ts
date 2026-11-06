/**
 * Storage object naming used by browse, dashboard, and Pen uploads.
 * New paths use note- / .note; historical Drive objects may still use thought- / .thought.
 */

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export function stripEncryptedSuffix(name: string): string {
  return name.replace(/\.encrypted$/i, '');
}

export function isEncryptedName(name: string): boolean {
  return /\.encrypted$/i.test(name);
}

/** Main note payload: note-*.note|.png or historical thought-*.thought|.png */
export function isNoteFileName(name: string): boolean {
  const n = stripEncryptedSuffix(name).toLowerCase();
  const isNotePrefixed = n.startsWith('note-') && (n.endsWith('.note') || n.endsWith('.png'));
  const isLegacyThoughtPrefixed =
    n.startsWith('thought-') && (n.endsWith('.thought') || n.endsWith('.png'));
  return isNotePrefixed || isLegacyThoughtPrefixed;
}

/** Thumbnail: thumb_note-* or historical thumb_thought-* */
export function isNoteThumbnailFileName(name: string): boolean {
  const n = stripEncryptedSuffix(name).toLowerCase();
  return n.startsWith('thumb_note-') || n.startsWith('thumb_thought-');
}

export function isNoteCollectionFileName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('.note-collection') ||
    n.includes('.thought-collection') ||
    n.startsWith('note-collection-') ||
    n.startsWith('thought-collection-')
  );
}

/** Encrypted thumbnail sidecar: `thumb_<main name>.encrypted`. */
export function isThumbnailFileName(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('thumb_') && n.endsWith('.encrypted');
}

/** PDF / note-collection page thumbnails: `thumb_<base>-page-N.png.encrypted`. */
export function isPageThumbnailFileName(name: string): boolean {
  return /^thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i.test(name);
}

/** Plumbing objects written next to owner files (share envelopes, CDN canonicals, indexes). */
export function isSystemArtifactName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n === 'public-file-index.json' ||
    n.startsWith('public-envelope-') ||
    n.startsWith('feed-preview-') ||
    /^migration-.*-report\.json$/.test(n)
  );
}

export function isCollectionFileName(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith('collection-') && n.endsWith('.collection.encrypted');
}

/** Main-file name a thumbnail points at (without `.encrypted`). */
export function thumbnailTargetName(thumbName: string): string {
  return thumbName.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
}

export function noteBaseName(name: string): string {
  return name
    .replace(/^thumb_/i, '')
    .replace(/\.encrypted$/i, '')
    .replace(/\.(note|thought|png)$/i, '');
}

export function cleanThumbDisplayName(name: string): string {
  return name
    .replace(/^thumb_/i, '')
    .replace(/\.encrypted$/i, '')
    .replace(/\.[^.]+$/, '');
}

export function cleanCollectionDisplayName(name: string): string {
  return name.replace(/\.encrypted$/i, '').replace(/\.collection$/i, '');
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json'
};

/** Best-effort MIME from a (possibly `.encrypted`) file name. */
export function guessMimeFromName(name: string): string | undefined {
  const base = stripEncryptedSuffix(name);
  const dot = base.lastIndexOf('.');
  if (dot < 0) return undefined;
  return MIME_BY_EXT[base.slice(dot + 1).toLowerCase()];
}
