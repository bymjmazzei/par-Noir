/** Build penFeedPage metadata for feed publish. */

import {
  canvasSizeForAspect,
  exportActionSectionForFeed,
  normalizeGalleryAspect,
  normalizeSection,
  resolveTimelineDuration,
  type PenTimelineContext,
  type PenDocManifest,
  type PenFeedPagePayload,
  type PenSectionContent
} from '@par-noir/pen-protocol';

export function timelineCtxFromManifest(
  manifest: Pick<PenDocManifest, 'pagePresentation'>
): PenTimelineContext {
  const video = manifest.pagePresentation?.backgroundVideo?.trim();
  return video ? { pageBackgroundVideo: video } : {};
}

export function penPresentationFields(
  manifest: PenDocManifest
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (manifest.pageView) out.pageView = manifest.pageView;
  if (manifest.pageSwipeAxis) out.pageSwipeAxis = manifest.pageSwipeAxis;
  if (manifest.galleryAspect) out.galleryAspect = manifest.galleryAspect;
  return out;
}

export function penFeedPageForSection(
  section: PenSectionContent,
  manifest: PenDocManifest
): PenFeedPagePayload {
  const sec = normalizeSection(section);
  const canvas = canvasSizeForAspect(normalizeGalleryAspect(manifest.galleryAspect));
  const ctx = timelineCtxFromManifest(manifest);
  const actionSection = exportActionSectionForFeed(sec, ctx);
  const timelineDurationSec = resolveTimelineDuration(sec, undefined, ctx);
  return {
    slug: sec.slug,
    canvas,
    ...(timelineDurationSec > 0 ? { timelineDurationSec } : {}),
    actionSection
  };
}
