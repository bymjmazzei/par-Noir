/**
 * Keep Pen local doc bundles free of data:/blob: media so localStorage never bloats.
 */

import { normalizeSections } from '@par-noir/pen-protocol';
import { MEDIA_SRC_FIELDS, isInlineMediaSrc, type MediaSrcField } from '@par-noir/pen-media';
import type { LocalDocBundle } from './penLocalStore';

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

/** Layer fields hold refs only; drop any stray data:/blob: so localStorage stays small. */
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
