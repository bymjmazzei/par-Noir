/**
 * Where a loose file in the pN root belongs.
 * Root children are folders. These names match the device blob folders.
 */

export const FILES_FOLDER_NAME = 'files';
export const CONTENT_FOLDER_NAME = 'content';
export const CONTENT_NOTES_FOLDER_NAME = 'notes';
export const CONTENT_MEDIA_FOLDER_NAME = 'media';
export const CONTENT_COLLECTIONS_FOLDER_NAME = 'collections';
export const PEN_ROOT_FOLDER_NAME = 'par-noir-pen';
export const PEN_PREFS_FILE_NAME = 'par-noir-pen-prefs.enc';
export const LOOSE_MEDIA_FOLDER_NAME = '_loose-media';

export type RootBlobClass =
  | { kind: 'notes' }
  | { kind: 'media' }
  | { kind: 'collections' }
  | { kind: 'files' }
  | { kind: 'pen-prefs' }
  | { kind: 'pen-media' }
  | { kind: 'pen-public'; docKey: string };

const MEDIA_EXT =
  /\.(png|jpe?g|gif|webp|heic|bmp|svg|mp4|mov|webm|m4v|avi|mkv|pdf|mp3|m4a|wav)(\.encrypted)?$/i;

function stripEncrypted(name: string): string {
  return name.replace(/\.encrypted$/i, '');
}

function isCollectionName(name: string): boolean {
  const n = stripEncrypted(name).toLowerCase();
  return (
    n.includes('.note-collection') ||
    n.includes('.thought-collection') ||
    n.startsWith('note-collection-') ||
    n.startsWith('thought-collection-')
  );
}

function isNoteName(name: string): boolean {
  const n = stripEncrypted(name).toLowerCase();
  if (n.startsWith('thumb_note-') || n.startsWith('thumb_thought-')) return true;
  if (n.startsWith('note-') && (n.endsWith('.note') || n.endsWith('.png'))) return true;
  if (n.startsWith('thought-') && (n.endsWith('.thought') || n.endsWith('.png') || n.endsWith('.note'))) {
    return true;
  }
  if (n.endsWith('.note') || n.endsWith('.thought')) return true;
  return false;
}

/** Doc key captured from a Pen publish filename, before folder matching. */
export function penPublicDocKey(name: string): string | null {
  const n = stripEncrypted(name);
  const template = n.match(/^pen-template-(.+)\.json$/i);
  if (template?.[1]) return template[1];
  const collection = n.match(/^pen-(.+)\.collection\.json$/i);
  if (collection?.[1]) return collection[1];
  const file = n.match(/^pen-(.+)\.(json|video|mp3)$/i);
  if (!file?.[1]) return null;
  return file[1].replace(/-audio-\d+$/i, '');
}

export function classifyRootBlob(name: string): RootBlobClass {
  const raw = String(name || '').trim();
  const lower = raw.toLowerCase();
  if (lower === PEN_PREFS_FILE_NAME) return { kind: 'pen-prefs' };
  if (/^media-.+\.penmedia$/i.test(raw) || /^gallery-preview.*\.penmedia$/i.test(raw)) {
    return { kind: 'pen-media' };
  }
  const docKey = penPublicDocKey(raw);
  if (docKey) return { kind: 'pen-public', docKey };
  if (isCollectionName(raw)) return { kind: 'collections' };
  if (isNoteName(raw)) return { kind: 'notes' };
  if (
    lower.startsWith('feed-preview-') ||
    lower.startsWith('public-envelope-') ||
    lower.startsWith('thumb_') ||
    MEDIA_EXT.test(lower)
  ) {
    return { kind: 'media' };
  }
  return { kind: 'files' };
}
