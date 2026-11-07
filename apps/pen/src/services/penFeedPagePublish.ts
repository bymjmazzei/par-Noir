/** Build penFeedPage metadata for feed publish. */

import {
  canvasSizeForAspect,
  defaultEditorPagePresentation,
  exportActionSectionForFeed,
  layerMediaSource,
  mergePagePresentation,
  normalizeGalleryAspect,
  normalizeSection,
  resolvePagePaddingPx,
  resolveTimelineDuration,
  type PenTimelineContext,
  type PenDocManifest,
  type PenFeedLayerMedia,
  type PenFeedPagePayload,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { isPenMediaSrcRef } from '@par-noir/pen-media';

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

/**
 * Feed overlay payload for one page.
 * `layerMedia` maps Pen media refs to their public copies (see publishActionLayerMedia).
 */
export function penFeedPageForSection(
  section: PenSectionContent,
  manifest: PenDocManifest,
  mediaByRef?: Record<string, PenFeedLayerMedia>
): PenFeedPagePayload {
  const sec = normalizeSection(section);
  const canvas = canvasSizeForAspect(normalizeGalleryAspect(manifest.galleryAspect));
  const ctx = timelineCtxFromManifest(manifest);
  const actionSection = exportActionSectionForFeed(sec, ctx);
  const timelineDurationSec = resolveTimelineDuration(sec, undefined, ctx);
  const presentation = mergePagePresentation(defaultEditorPagePresentation(), manifest.pagePresentation);
  const contentInsetPx = resolvePagePaddingPx(presentation.padding);
  const fontFamily = presentation.fontFamily?.trim();
  const layerMedia: Record<string, PenFeedLayerMedia> = {};
  for (const layer of actionSection.layers) {
    const src = layerMediaSource(layer)?.src;
    const media = src ? mediaByRef?.[src] : undefined;
    if (media) layerMedia[layer.id] = media;
  }
  return {
    slug: sec.slug,
    canvas,
    contentInsetPx,
    ...(timelineDurationSec > 0 ? { timelineDurationSec } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(Object.keys(layerMedia).length ? { layerMedia } : {}),
    actionSection
  };
}

/** Pen media refs painted by a section's feed action layers (deduped). */
export function actionLayerMediaRefs(
  sections: PenSectionContent[],
  manifest: Pick<PenDocManifest, 'pagePresentation'>
): Array<{ src: string; kind: PenFeedLayerMedia['kind'] }> {
  const ctx = timelineCtxFromManifest(manifest);
  const seen = new Map<string, PenFeedLayerMedia['kind']>();
  for (const section of sections) {
    const { layers } = exportActionSectionForFeed(normalizeSection(section), ctx);
    for (const layer of layers) {
      const source = layerMediaSource(layer);
      if (source && isPenMediaSrcRef(source.src) && !seen.has(source.src)) {
        seen.set(source.src, source.kind);
      }
    }
  }
  return [...seen].map(([src, kind]) => ({ src, kind }));
}
