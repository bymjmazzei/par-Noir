/**
 * Sanitize Pen local doc bundles so localStorage never holds data:/blob: media.
 */

import {
  normalizeSections,
  type PenPageLayer,
  type PenPagePresentation,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { LocalDocBundle } from './penLocalStore';
import {
  MEDIA_SRC_FIELDS,
  ingestInlineMediaSrc,
  isInlineMediaSrc,
  type MediaSrcField
} from './penLocalMedia';

export class PenLocalStoreQuotaError extends Error {
  constructor(message = 'Local storage quota exceeded while saving this document.') {
    super(message);
    this.name = 'PenLocalStoreQuotaError';
  }
}

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as DOMException;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (typeof err.code === 'number' && err.code === 22)
  );
}

export function throwIfQuota(e: unknown): never {
  if (isQuotaError(e)) throw new PenLocalStoreQuotaError();
  throw e;
}

async function migrateField(
  docId: string,
  value: string | undefined
): Promise<string | undefined> {
  if (!value) return value;
  if (!isInlineMediaSrc(value)) return value;
  const ref = await ingestInlineMediaSrc({ docId, src: value });
  if (!ref) {
    console.warn('[pen] dropped inline media that could not be migrated to IndexedDB');
    return undefined;
  }
  return ref;
}

async function migrateLayer(
  docId: string,
  layer: PenPageLayer
): Promise<PenPageLayer> {
  let next = layer;
  for (const field of MEDIA_SRC_FIELDS) {
    const cur = next[field as MediaSrcField];
    if (typeof cur !== 'string' || !isInlineMediaSrc(cur)) continue;
    const migrated = await migrateField(docId, cur);
    next = { ...next, [field]: migrated };
  }
  return next;
}

async function migratePresentation(
  docId: string,
  pres: PenPagePresentation | undefined
): Promise<PenPagePresentation | undefined> {
  if (!pres) return pres;
  let next = { ...pres };
  for (const field of ['backgroundImage', 'backgroundVideo'] as const) {
    const cur = next[field];
    if (typeof cur !== 'string' || !isInlineMediaSrc(cur)) continue;
    next = { ...next, [field]: await migrateField(docId, cur) };
  }
  return next;
}

/**
 * Walk sections + pagePresentation; replace data:/blob: with penlocal: refs.
 * Returns a deep-cloned sanitized bundle (does not mutate input).
 */
export async function sanitizeBundleMedia(
  bundle: LocalDocBundle
): Promise<LocalDocBundle> {
  const docId = bundle.manifest.docId;
  const sections: PenSectionContent[] = [];
  for (const raw of normalizeSections(bundle.sections || [])) {
    const layers = raw.layers
      ? await Promise.all(raw.layers.map((l) => migrateLayer(docId, l)))
      : undefined;
    sections.push(layers ? { ...raw, layers } : { ...raw });
  }
  const pagePresentation = await migratePresentation(
    docId,
    bundle.manifest.pagePresentation
  );
  return {
    ...bundle,
    sections,
    manifest: {
      ...bundle.manifest,
      ...(pagePresentation !== undefined ? { pagePresentation } : {})
    }
  };
}

/** Sync strip: drop inline media (warn) when async migrate is unavailable. */
export function stripInlineMediaFromBundle(bundle: LocalDocBundle): LocalDocBundle {
  const stripVal = (v: string | undefined): string | undefined => {
    if (!v || !isInlineMediaSrc(v)) return v;
    console.warn('[pen] stripping inline media from localStorage save');
    return undefined;
  };
  const sections = normalizeSections(bundle.sections || []).map((s) => ({
    ...s,
    layers: s.layers?.map((l) => {
      const next = { ...l };
      for (const field of MEDIA_SRC_FIELDS) {
        const cur = next[field as MediaSrcField];
        if (typeof cur === 'string') {
          (next as Record<string, unknown>)[field] = stripVal(cur);
        }
      }
      return next;
    })
  }));
  const pres = bundle.manifest.pagePresentation
    ? {
        ...bundle.manifest.pagePresentation,
        backgroundImage: stripVal(bundle.manifest.pagePresentation.backgroundImage),
        backgroundVideo: stripVal(bundle.manifest.pagePresentation.backgroundVideo)
      }
    : undefined;
  return {
    ...bundle,
    sections,
    manifest: {
      ...bundle.manifest,
      ...(pres ? { pagePresentation: pres } : {})
    }
  };
}
