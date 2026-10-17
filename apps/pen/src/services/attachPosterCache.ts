/**
 * blob: URLs from device/cloud pick for layout posters during proxy encode.
 * Keyed by penlocal:/penmedia: ref — never stored on the doc.
 */

const posters = new Map<string, string>();

export function setAttachPoster(mediaRef: string, blobUrl: string): void {
  const ref = mediaRef.trim();
  const url = blobUrl.trim();
  if (!ref || !url) return;
  posters.set(ref, url);
}

export function getAttachPoster(mediaRef: string | null | undefined): string | null {
  const ref = mediaRef?.trim();
  if (!ref) return null;
  return posters.get(ref) ?? null;
}

export function clearAttachPoster(mediaRef: string): void {
  posters.delete(mediaRef.trim());
}
