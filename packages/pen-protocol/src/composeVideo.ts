/**
 * Detect when a Pen doc must export as a composed on-device video
 * (visible overlay video layer present).
 */

import type { PenPageLayer, PenSectionContent } from './types.js';

/** Overlay video layer that participates in compose-video export. */
export function isVisibleVideoLayer(layer: PenPageLayer | null | undefined): boolean {
  if (!layer) return false;
  if (layer.kind !== 'video') return false;
  if (layer.visible === false) return false;
  const src = typeof layer.videoSrc === 'string' ? layer.videoSrc.trim() : '';
  return Boolean(src);
}

export function sectionHasVisibleVideoLayer(
  section: PenSectionContent | null | undefined
): boolean {
  const layers = section?.layers || [];
  return layers.some(isVisibleVideoLayer);
}

/** True when Connect-to-feed should compose/encode a video instead of a Note. */
export function docRequiresComposedVideoExport(
  sections: PenSectionContent[] | null | undefined
): boolean {
  if (!sections?.length) return false;
  return sections.some(sectionHasVisibleVideoLayer);
}

/** Longest visible video layer (for duration), or null. */
export function primaryVisibleVideoLayer(
  sections: PenSectionContent[] | null | undefined
): PenPageLayer | null {
  if (!sections?.length) return null;
  for (const sec of sections) {
    for (const layer of sec.layers || []) {
      if (isVisibleVideoLayer(layer)) return layer;
    }
  }
  return null;
}
