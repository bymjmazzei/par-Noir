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
  hueRotate: 0,
  temp: 0,
  tint: 0,
  exposure: 0,
  highlight: 0,
  shadow: 0,
  whites: 0,
  blacks: 0,
  brilliance: 0,
  sharpen: 0,
  clarity: 0,
  particles: 0,
  fade: 0,
  vignette: 0
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
  const next: Required<PenMediaFilter> = { ...DEFAULT_MEDIA_FILTER };
  if (!partial) return next;
  (Object.keys(DEFAULT_MEDIA_FILTER) as Array<keyof PenMediaFilter>).forEach((key) => {
    const value = partial[key];
    if (value !== undefined && Number.isFinite(value)) next[key] = value;
  });
  return next;
}

/** CSS `filter` for media grade + optional layer blur (px). */
export function mediaFilterCss(
  layer: Pick<PenPageLayer, 'mediaFilter' | 'blur'> | null | undefined
): string | undefined {
  if (!layer) return undefined;
  const f = mergeMediaFilter(layer.mediaFilter);
  const parts: string[] = [];
  const brightness = f.brightness * (1 + f.exposure / 200);
  if (Math.abs(brightness - 100) > 0.05) parts.push(`brightness(${Math.round(brightness * 10) / 10}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  const saturation = f.saturation * (1 - f.fade / 200);
  if (Math.abs(saturation - 100) > 0.05) parts.push(`saturate(${Math.round(saturation * 10) / 10}%)`);
  if (f.hueRotate !== 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.temp !== 0) {
    parts.push(`sepia(${Math.min(1, Math.abs(f.temp) / 100)})`);
    parts.push(`hue-rotate(${f.temp > 0 ? -10 : 190}deg)`);
  }
  if (f.tint !== 0) parts.push(`hue-rotate(${f.tint * 0.4}deg)`);
  if (layer.blur && layer.blur > 0) parts.push(`blur(${layer.blur}px)`);
  return parts.length ? parts.join(' ') : undefined;
}

const TONAL_KEYS = ['highlight', 'shadow', 'whites', 'blacks', 'brilliance', 'sharpen', 'clarity'] as const;

/** True when the frame needs the single tonal shader pass. */
export function tonalGradeActive(filter: PenMediaFilter | null | undefined): boolean {
  const merged = mergeMediaFilter(filter);
  return TONAL_KEYS.some((key) => merged[key] !== 0);
}

export function mediaMaskClipCss(
  mask: PenMediaMask | null | undefined,
  size?: number
): string | undefined {
  if (!mask || mask === 'none') return undefined;
  const amount = Math.min(100, Math.max(0, size ?? 100));
  if (mask === 'circle') return `circle(${amount / 2}% at 50% 50%)`;
  const inset = (100 - amount) / 2;
  if (mask === 'rect') return `inset(${inset}%)`;
  return `inset(${inset}% round 12%)`;
}

/** Scale, offset, rotation, and mirror for the picture inside the frame. */
export function mediaTransformCss(layer: {
  mediaScale?: number;
  mediaX?: number;
  mediaY?: number;
  mediaRotate?: number;
  mediaMirror?: boolean;
} | null | undefined): string | undefined {
  if (!layer) return undefined;
  const scale = (layer.mediaScale ?? 100) / 100;
  const x = layer.mediaX ?? 0;
  const y = layer.mediaY ?? 0;
  const rotate = layer.mediaRotate ?? 0;
  const flip = layer.mediaMirror ? -1 : 1;
  if (scale === 1 && x === 0 && y === 0 && rotate === 0 && flip === 1) return undefined;
  return `translate(${x}%, ${y}%) rotate(${rotate}deg) scale(${scale * flip}, ${scale})`;
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
