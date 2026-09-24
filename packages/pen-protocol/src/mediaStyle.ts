/**
 * CSS helpers for image/video layer media edits (filter, crop, mask).
 */

import type {
  PenMediaCrop,
  PenMediaFilter,
  PenMediaMask,
  PenPageLayer
} from './types.js';

export const DEFAULT_MEDIA_FILTER: Required<PenMediaFilter> = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hueRotate: 0
};

export const FULL_MEDIA_CROP: PenMediaCrop = { x: 0, y: 0, w: 1, h: 1 };

/** Clamp crop to valid 0–1 box with min size. */
export function clampMediaCrop(crop: PenMediaCrop | null | undefined): PenMediaCrop {
  if (!crop) return { ...FULL_MEDIA_CROP };
  const min = 0.05;
  let w = Math.min(1, Math.max(min, Number(crop.w) || 1));
  let h = Math.min(1, Math.max(min, Number(crop.h) || 1));
  let x = Math.min(1 - w, Math.max(0, Number(crop.x) || 0));
  let y = Math.min(1 - h, Math.max(0, Number(crop.y) || 0));
  w = Math.min(w, 1 - x);
  h = Math.min(h, 1 - y);
  return { x, y, w, h };
}

export function mergeMediaFilter(
  partial?: PenMediaFilter | null
): Required<PenMediaFilter> {
  return {
    brightness: partial?.brightness ?? DEFAULT_MEDIA_FILTER.brightness,
    contrast: partial?.contrast ?? DEFAULT_MEDIA_FILTER.contrast,
    saturation: partial?.saturation ?? DEFAULT_MEDIA_FILTER.saturation,
    hueRotate: partial?.hueRotate ?? DEFAULT_MEDIA_FILTER.hueRotate
  };
}

/** CSS `filter` for media grade + optional layer blur (px). */
export function mediaFilterCss(
  layer: Pick<PenPageLayer, 'mediaFilter' | 'blur'> | null | undefined
): string | undefined {
  if (!layer) return undefined;
  const f = mergeMediaFilter(layer.mediaFilter);
  const parts: string[] = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
  if (f.hueRotate !== 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (layer.blur && layer.blur > 0) parts.push(`blur(${layer.blur}px)`);
  return parts.length ? parts.join(' ') : undefined;
}

export function mediaMaskClipCss(
  mask: PenMediaMask | null | undefined
): string | undefined {
  if (!mask || mask === 'none') return undefined;
  if (mask === 'circle') return 'circle(50% at 50% 50%)';
  if (mask === 'rounded') return 'inset(0 round 12%)';
  return undefined;
}

/**
 * Clip-path inset for a normalized crop window (0–1).
 * Full frame returns undefined.
 */
export function mediaCropClipCss(
  crop: PenMediaCrop | null | undefined
): string | undefined {
  const c = clampMediaCrop(crop);
  if (c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1) return undefined;
  const top = c.y * 100;
  const right = (1 - c.x - c.w) * 100;
  const bottom = (1 - c.y - c.h) * 100;
  const left = c.x * 100;
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

/** Object-style helper returning clipPath for crop. */
export function mediaCropObjectStyle(
  crop: PenMediaCrop | null | undefined
): { clipPath?: string } {
  const clipPath = mediaCropClipCss(crop);
  return clipPath ? { clipPath } : {};
}

/** True when crop is not the full frame. */
export function mediaCropIsActive(crop: PenMediaCrop | null | undefined): boolean {
  const c = clampMediaCrop(crop);
  return !(c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1);
}

export const MEDIA_FILTER_PRESETS: Record<string, PenMediaFilter> = {
  none: { brightness: 100, contrast: 100, saturation: 100, hueRotate: 0 },
  fade: { brightness: 110, contrast: 85, saturation: 70, hueRotate: 0 },
  contrast: { brightness: 105, contrast: 130, saturation: 100, hueRotate: 0 },
  cool: { brightness: 100, contrast: 105, saturation: 90, hueRotate: 200 },
  warm: { brightness: 105, contrast: 105, saturation: 115, hueRotate: 15 }
};
