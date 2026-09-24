/**
 * Per-page composed video: only sections with a visible overlay video layer
 * become video pages. Other pages stay Notes. Whole-doc video only when the
 * publishable surface is a single video page.
 */

import { docToPlainText, normalizeSection } from './richDoc.js';
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

/** Section has Body prose worth publishing as a Note page. */
export function sectionHasNoteContent(
  section: PenSectionContent | null | undefined
): boolean {
  if (!section) return false;
  const n = normalizeSection(section);
  return Boolean(docToPlainText(n.doc).trim());
}

export type PublishSectionPartition = {
  /** Slugs / sections that should encode as composed video pages. */
  videoSections: PenSectionContent[];
  /** Sections with prose and no video layer — stay Note pages. */
  noteSections: PenSectionContent[];
};

/**
 * Split sections for feed publish. A section with both prose and a video layer
 * is treated as a **video page** (composed encode includes the prose on-canvas).
 */
export function partitionSectionsForPublish(
  sections: PenSectionContent[] | null | undefined
): PublishSectionPartition {
  const videoSections: PenSectionContent[] = [];
  const noteSections: PenSectionContent[] = [];
  for (const raw of sections || []) {
    const sec = normalizeSection(raw);
    if (sectionHasVisibleVideoLayer(sec)) {
      videoSections.push(sec);
    } else if (sectionHasNoteContent(sec)) {
      noteSections.push(sec);
    }
  }
  return { videoSections, noteSections };
}

/**
 * True when Connect-to-feed should produce a single media/video item
 * (one video page, no sibling Note pages).
 */
export function shouldPublishAsSingleComposedVideo(
  sections: PenSectionContent[] | null | undefined
): boolean {
  const { videoSections, noteSections } = partitionSectionsForPublish(sections);
  return videoSections.length === 1 && noteSections.length === 0;
}

/**
 * True when at least one page needs composed video (single or mixed).
 * @deprecated Prefer shouldPublishAsSingleComposedVideo / partitionSectionsForPublish.
 */
export function docRequiresComposedVideoExport(
  sections: PenSectionContent[] | null | undefined
): boolean {
  return partitionSectionsForPublish(sections).videoSections.length > 0;
}

/** True when the post mixes Note pages and video pages (or multiple videos). */
export function shouldPublishAsMixedPages(
  sections: PenSectionContent[] | null | undefined
): boolean {
  const { videoSections, noteSections } = partitionSectionsForPublish(sections);
  if (videoSections.length === 0) return false;
  if (noteSections.length > 0) return true;
  return videoSections.length > 1;
}

/** First visible video layer in a section (for duration), or null. */
export function primaryVisibleVideoLayerInSection(
  section: PenSectionContent | null | undefined
): PenPageLayer | null {
  for (const layer of section?.layers || []) {
    if (isVisibleVideoLayer(layer)) return layer;
  }
  return null;
}

/** @deprecated Use primaryVisibleVideoLayerInSection / partition. */
export function primaryVisibleVideoLayer(
  sections: PenSectionContent[] | null | undefined
): PenPageLayer | null {
  for (const sec of sections || []) {
    const hit = primaryVisibleVideoLayerInSection(sec);
    if (hit) return hit;
  }
  return null;
}
