/**
 * Remap overlay layer rects when switching Social galleryAspect.
 */

import type { PenDocManifest, PenPageLayer, PenPageOrientation, PenSectionContent } from './types.js';
import { selectPageSize, type PageSizeChoice } from './pageGeometry.js';

export type GalleryAspect = NonNullable<PenDocManifest['galleryAspect']>;

/** Ratio page a social template was drawn at. No aspect means the template keeps its own layout. */
export function pageSizeForGalleryAspect(
  aspect: string | null | undefined
): (PageSizeChoice & { orientation: PenPageOrientation }) | null {
  if (aspect !== '9/16' && aspect !== '16/9' && aspect !== '1/1') return null;
  const orientation: PenPageOrientation = aspect === '16/9' ? 'landscape' : 'portrait';
  const choice = selectPageSize(aspect === '1/1' ? 'ratio-1-1' : 'ratio-9-16', undefined, orientation);
  return { ...choice, orientation };
}

/** Canonical social canvas size for each gallery aspect (CSS px). */
export function canvasSizeForAspect(aspect: GalleryAspect): { w: number; h: number } {
  if (aspect === '16/9') return { w: 640, h: 360 };
  if (aspect === '1/1') return { w: 360, h: 360 };
  return { w: 360, h: 640 };
}

export function normalizeGalleryAspect(
  aspect: string | null | undefined
): GalleryAspect {
  if (aspect === '16/9' || aspect === '1/1' || aspect === '9/16') return aspect;
  return '9/16';
}

function remapLayer(
  layer: PenPageLayer,
  from: { w: number; h: number },
  to: { w: number; h: number }
): PenPageLayer {
  const sx = to.w / Math.max(1, from.w);
  const sy = to.h / Math.max(1, from.h);
  return {
    ...layer,
    x: Math.round(layer.x * sx),
    y: Math.round(layer.y * sy),
    w: Math.max(24, Math.round(layer.w * sx)),
    h: Math.max(24, Math.round(layer.h * sy))
  };
}

/** Remap every overlay layer when gallery aspect changes. */
export function remapSectionsForAspect(
  sections: PenSectionContent[],
  fromAspect: GalleryAspect,
  toAspect: GalleryAspect
): PenSectionContent[] {
  if (fromAspect === toAspect) return sections;
  const from = canvasSizeForAspect(fromAspect);
  const to = canvasSizeForAspect(toAspect);
  return sections.map((sec) => ({
    ...sec,
    layers: (sec.layers || []).map((l) => remapLayer(l, from, to))
  }));
}
