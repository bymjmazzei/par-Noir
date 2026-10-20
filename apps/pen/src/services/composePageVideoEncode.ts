/**
 * Shared shapes for the on-device page export (see encodePageVideo).
 * Output size comes from the publish tier, never from the on-screen preview size.
 *
 * Only blob:/data: video masters are drawn — MediaStream mirrors and
 * cross-origin http frames taint the canvas.
 */

import { feedPreviewTargetSize, type EncodedPreview, type PublishTierNotch } from '@par-noir/aggregator-domain';

export type ComposePageVideoResult = {
  poster: EncodedPreview;
  sd: EncodedPreview;
  hd?: EncodedPreview;
};

/** Largest composed variant — the canonical file (Drive envelope, download, gallery). */
export function composedMaster(result: ComposePageVideoResult): EncodedPreview {
  return result.hd ?? result.sd;
}

export function isUntaintedMediaUrl(src: string): boolean {
  return src.startsWith('blob:') || src.startsWith('data:');
}

/**
 * Prefer the blob-backed master video over a captureStream mirror viewer.
 * Returns null when no untainted drawable exists (caller must not draw).
 */
export function resolveUntaintedDrawableVideo(viewer: HTMLElement): HTMLVideoElement | null {
  const key = viewer.dataset.penMediaKey;
  if (key) {
    const master = document.querySelector(
      `video[data-pen-media-drawable="1"][data-pen-media-key="${CSS.escape(key)}"]`
    );
    if (master instanceof HTMLVideoElement) {
      const src = master.currentSrc || master.src || '';
      if (isUntaintedMediaUrl(src)) return master;
    }
  }
  if (viewer instanceof HTMLVideoElement) {
    const own = viewer.currentSrc || viewer.src || '';
    if (isUntaintedMediaUrl(own) && !viewer.srcObject) return viewer;
  }
  return null;
}

/**
 * Output pixel sizes for a compose of `root`: master (HD when the tier allows it,
 * else SD) and SD, both at the root's aspect. On-screen size only sets the aspect.
 */
export function composeOutputSizes(
  rootW: number,
  rootH: number,
  tier: PublishTierNotch
): { master: { w: number; h: number }; sd: { w: number; h: number }; hdOn: boolean } {
  const hdOn = tier.allowHd;
  const sd = feedPreviewTargetSize('sd', tier, rootW, rootH);
  const master = hdOn ? feedPreviewTargetSize('hd', tier, rootW, rootH) : sd;
  return { master, sd, hdOn };
}
