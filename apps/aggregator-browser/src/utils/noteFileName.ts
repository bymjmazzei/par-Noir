/**
 * Note file-name detection (product vocabulary: Note).
 * New paths use note- / .note; historical Drive objects may still use thought- / .thought.
 */

export function stripEncryptedSuffix(name: string): string {
  return name.replace(/\.encrypted$/i, '');
}

/** Main note payload: note-*.note|.png or historical thought-*.thought|.png */
export function isNoteFileName(name: string): boolean {
  const n = stripEncryptedSuffix(name).toLowerCase();
  const isNotePrefixed =
    n.startsWith('note-') && (n.endsWith('.note') || n.endsWith('.png'));
  const isLegacyThoughtPrefixed =
    n.startsWith('thought-') && (n.endsWith('.thought') || n.endsWith('.png'));
  return isNotePrefixed || isLegacyThoughtPrefixed;
}

/** Thumbnail: thumb_note-* or historical thumb_thought-* */
export function isNoteThumbnailFileName(name: string): boolean {
  const n = stripEncryptedSuffix(name).toLowerCase();
  return n.startsWith('thumb_note-') || n.startsWith('thumb_thought-');
}

/** Collection payload extension */
export function isNoteCollectionFileName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('.note-collection') ||
    n.includes('.thought-collection') ||
    n.startsWith('note-collection-') ||
    n.startsWith('thought-collection-')
  );
}

export function hasNoteExtension(name: string): boolean {
  const n = stripEncryptedSuffix(name).toLowerCase();
  return (
    /\.note$/i.test(n) ||
    /\.thought$/i.test(n) ||
    (n.startsWith('note-') && n.endsWith('.png')) ||
    (n.startsWith('thought-') && n.endsWith('.png')) ||
    n.startsWith('thumb_note-') ||
    n.startsWith('thumb_thought-')
  );
}
