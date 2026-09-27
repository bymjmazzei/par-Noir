/**
 * Per-page composed video: only sections with a visible overlay video layer
 * become video pages. Other pages stay Notes. Whole-doc video only when the
 * publishable surface is a single video page.
 */

import { docToPlainText, normalizeSection } from './richDoc.js';
import type { PenPageLayer, PenSectionContent } from './types.js';
import { sectionWithoutActionLayers } from './actionPartition.js';
import { getClass } from './classes.js';

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
  if (!section) return false;
  const layers = sectionWithoutActionLayers(normalizeSection(section)).layers || [];
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
    const sec = sectionWithoutActionLayers(normalizeSection(raw));
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

/** A section the feed can show as its own collection page. */
export function sectionIsFeedPage(section: PenSectionContent | null | undefined): boolean {
  if (!section) return false;
  const sec = normalizeSection(section);
  if (sectionHasVisibleVideoLayer(sec)) return true;
  if (sectionHasNoteContent(sec)) return true;
  for (const layer of sec.layers || []) {
    if (layer.visible === false) continue;
    if (layer.kind === 'image' && String(layer.imageSrc || '').trim()) return true;
    if (layer.kind === 'text' && docToPlainText(layer.textDoc).trim()) return true;
  }
  return false;
}

/** Plain text for a collection page: body first, then text layers. */
export function feedPagePlainText(section: PenSectionContent): string {
  const sec = normalizeSection(section);
  const fromDoc = docToPlainText(sec.doc).trim();
  if (fromDoc) return fromDoc;
  const bits: string[] = [];
  for (const layer of sec.layers || []) {
    if (layer.visible === false || layer.kind !== 'text') continue;
    const text = docToPlainText(layer.textDoc).trim();
    if (text) bits.push(text);
  }
  return bits.join('\n\n').trim();
}

/**
 * Social posts with more than one feed page publish as a collection.
 * A note template stays a note until the author adds a page that is not
 * one of that template's own sections. Collection templates always do.
 * One composed video stays a single media post.
 */
export function shouldPublishSocialAsCollection(input: {
  classId?: string;
  publishContentClass?: 'note' | 'media' | 'collection';
  templateSectionSlugs?: string[];
  sections: PenSectionContent[] | null | undefined;
}): boolean {
  if (getClass(input.classId || '')?.parentId !== 'social') return false;
  const sections = input.sections || [];
  if (shouldPublishAsSingleComposedVideo(sections)) return false;
  const pages = sections.filter(sectionIsFeedPage);
  if (pages.length < 2) return false;
  if (shouldPublishAsMixedPages(sections)) return true;
  if (input.publishContentClass === 'collection') return true;
  const known = new Set(input.templateSectionSlugs || []);
  if (known.size === 0) return true;
  return pages.some((page) => !known.has(page.slug));
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
