/**
 * Pen media refs stored in layer fields.
 * - `penlocal:{mediaId}` — bytes only in this device's IndexedDB (not yet uploaded).
 * - `penmedia:{fileId}` — Drive file (PNM1-encrypted Pen upload or raw picked media).
 */

const LOCAL_PREFIX = 'penlocal:';
const DRIVE_PREFIX = 'penmedia:';

export const MEDIA_SRC_FIELDS = [
  'imageSrc',
  'videoSrc',
  'backgroundImage',
  'backgroundVideo',
  'paintOverlaySrc'
] as const;

export type MediaSrcField = (typeof MEDIA_SRC_FIELDS)[number];

export const PRESENTATION_MEDIA_FIELDS = ['backgroundImage', 'backgroundVideo'] as const;

export function isPenLocalMediaRef(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith(LOCAL_PREFIX));
}

export function isPenMediaRef(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith(DRIVE_PREFIX));
}

export function isPenMediaSrcRef(src: string | null | undefined): boolean {
  return isPenLocalMediaRef(src) || isPenMediaRef(src);
}

export function isInlineMediaSrc(src: string | null | undefined): boolean {
  return Boolean(src && (src.startsWith('data:') || src.startsWith('blob:')));
}

export function penLocalRef(mediaId: string): string {
  return `${LOCAL_PREFIX}${mediaId}`;
}

export function penMediaRef(fileId: string): string {
  return `${DRIVE_PREFIX}${fileId}`;
}

export function parsePenLocalMediaId(src: string): string | null {
  if (!isPenLocalMediaRef(src)) return null;
  return src.slice(LOCAL_PREFIX.length).trim() || null;
}

export function parsePenMediaFileId(src: string): string | null {
  if (!isPenMediaRef(src)) return null;
  return src.slice(DRIVE_PREFIX.length).trim() || null;
}

type MediaTrack = { src?: string };
type MediaLayer = { audioTracks?: MediaTrack[] };
type MediaSection = { layers?: MediaLayer[] };
type MediaPresentation = { backgroundImage?: string; backgroundVideo?: string };

/** Device-only (`penlocal:`) refs left in a doc — media that has not reached Drive. */
export function collectLocalMediaRefs(
  sections: MediaSection[],
  pagePresentation?: MediaPresentation
): string[] {
  const out = new Set<string>();
  for (const s of sections) {
    for (const layer of s.layers || []) {
      const rec = layer as Record<string, unknown>;
      for (const field of MEDIA_SRC_FIELDS) {
        const v = rec[field];
        if (typeof v === 'string' && isPenLocalMediaRef(v)) out.add(v);
      }
      for (const t of layer.audioTracks || []) if (isPenLocalMediaRef(t.src)) out.add(t.src as string);
    }
  }
  for (const field of PRESENTATION_MEDIA_FIELDS) {
    const v = pagePresentation?.[field];
    if (isPenLocalMediaRef(v)) out.add(v as string);
  }
  return [...out];
}
