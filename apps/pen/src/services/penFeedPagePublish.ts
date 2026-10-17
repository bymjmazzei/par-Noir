/** Build penFeedPage metadata and compose helpers for feed publish. */

import {
  canvasSizeForAspect,
  defaultPagePresentation,
  exportActionSectionForFeed,
  mergePagePresentation,
  normalizeGalleryAspect,
  normalizeSection,
  resolveTimelineDuration,
  type PenDocManifest,
  type PenFeedPagePayload,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { composePageToVideo, type ComposePageVideoResult } from './composePageVideoEncode';
import { actionLayerIds, hideActionLayers } from './penDownload';

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
  const actionSection = exportActionSectionForFeed(sec);
  const timelineDurationSec = resolveTimelineDuration(sec);
  return {
    slug: sec.slug,
    canvas,
    timelineDurationSec,
    actionSection
  };
}

/** Flat still for action-only collection pages (overlay carries widgets). */
export async function minimalOverlayStillBlob(manifest: PenDocManifest): Promise<Blob> {
  const pres = mergePagePresentation(
    defaultPagePresentation(),
    manifest.pagePresentation || undefined
  );
  const { w, h } = canvasSizeForAspect(normalizeGalleryAspect(manifest.galleryAspect));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.fillStyle = pres.backgroundColor || '#000000';
  ctx.fillRect(0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('overlay_still_failed'))),
      'image/jpeg',
      0.92
    );
  });
}

export async function composePageVideoWithoutActions(
  root: HTMLElement,
  sections: PenSectionContent[],
  opts?: Parameters<typeof composePageToVideo>[1]
): Promise<ComposePageVideoResult> {
  const restore = hideActionLayers(root, actionLayerIds(sections));
  try {
    return await composePageToVideo(root, opts);
  } finally {
    restore();
  }
}
