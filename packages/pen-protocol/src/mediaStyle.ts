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

/**
 * Move the layer frame to the next crop window.
 * Source pixels keep their workspace position: the frame changes, the picture does not.
 */
export function applyCropWindow(
  layer: { x: number; y: number; w: number; h: number; mediaCrop?: PenMediaCrop | null },
  nextCrop: PenMediaCrop
): { x: number; y: number; w: number; h: number; mediaCrop: PenMediaCrop } {
  const prev = clampMediaCrop(layer.mediaCrop);
  const next = clampMediaCrop(nextCrop);
  const pixelX = layer.w / prev.w;
  const pixelY = layer.h / prev.h;
  return {
    x: layer.x + (next.x - prev.x) * pixelX,
    y: layer.y + (next.y - prev.y) * pixelY,
    w: Math.max(8, next.w * pixelX),
    h: Math.max(8, next.h * pixelY),
    mediaCrop: next
  };
}

/** Place the full picture so the layer frame shows only the crop window. */
export function mediaCropFrameStyle(
  crop: PenMediaCrop | null | undefined
): { left: string; top: string; width: string; height: string } | undefined {
  const c = clampMediaCrop(crop);
  if (c.x <= 0.0001 && c.y <= 0.0001 && c.w >= 0.999 && c.h >= 0.999) return undefined;
  return {
    left: `${(-c.x / c.w) * 100}%`,
    top: `${(-c.y / c.h) * 100}%`,
    width: `${100 / c.w}%`,
    height: `${100 / c.h}%`
  };
}

/** How much of each edge the crop window cuts away, in 0–1. */
export function mediaCropEdges(crop: PenMediaCrop | null | undefined): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const c = clampMediaCrop(crop);
  return {
    left: c.x,
    top: c.y,
    right: 1 - c.x - c.w,
    bottom: 1 - c.y - c.h
  };
}

/** Build a crop window from edge cuts. The edge being moved keeps the opposite edge. */
export function mediaCropFromEdges(
  edges: { left: number; top: number; right: number; bottom: number },
  moved?: 'left' | 'right' | 'top' | 'bottom'
): PenMediaCrop {
  const min = 0.05;
  const next = {
    left: Math.max(0, edges.left),
    top: Math.max(0, edges.top),
    right: Math.max(0, edges.right),
    bottom: Math.max(0, edges.bottom)
  };
  const fit = (
    a: 'left' | 'top',
    b: 'right' | 'bottom'
  ) => {
    if (next[a] + next[b] <= 1 - min) return;
    if (moved === b) next[b] = Math.max(0, 1 - min - next[a]);
    else next[a] = Math.max(0, 1 - min - next[b]);
  };
  fit('left', 'right');
  fit('top', 'bottom');
  return clampMediaCrop({
    x: next.left,
    y: next.top,
    w: 1 - next.left - next.right,
    h: 1 - next.top - next.bottom
  });
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

/** Clip path for simple shapes, SVG mask for split, filmstrip, and text. */
export function mediaMaskStyle(
  mask: PenMediaMask | null | undefined,
  size?: number,
  options?: { angle?: number; feather?: number; text?: string }
): {
  clipPath?: string;
  maskImage?: string;
  WebkitMaskImage?: string;
  maskSize?: string;
  WebkitMaskSize?: string;
  maskRepeat?: string;
  WebkitMaskRepeat?: string;
  maskPosition?: string;
  WebkitMaskPosition?: string;
  maskMode?: string;
} {
  if (!mask || mask === 'none') return {};
  const amount = Math.max(0, size ?? 100);
  if (mask === 'split' || mask === 'filmstrip' || mask === 'text') {
    const image = maskUri(maskSvg(mask, amount, options));
    return {
      maskImage: image,
      WebkitMaskImage: image,
      maskSize: '100% 100%',
      WebkitMaskSize: '100% 100%',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
      maskMode: 'alpha'
    };
  }
  const clipPath = mediaMaskClipCss(mask, size);
  return clipPath ? { clipPath } : {};
}

function maskUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function maskSvg(
  mask: 'split' | 'filmstrip' | 'text',
  amount: number,
  options?: { angle?: number; feather?: number; text?: string }
): string {
  if (mask === 'filmstrip') {
    const bar = Math.max(6, Math.min(22, amount / 6));
    const gap = Math.max(4, bar / 2);
    const step = bar + gap;
    const bars = Array.from({ length: 5 }, (_, index) => {
      const y = index * step;
      return `<rect x='0' y='${y}' width='100' height='${bar}' fill='white'/>`;
    }).join('');
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${bars}</svg>`;
  }
  if (mask === 'text') {
    const word = (options?.text || 'Text').replace(/[<>&'"]/g, '');
    const font = Math.max(12, Math.min(72, amount * 0.6));
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 80'><text x='120' y='58' text-anchor='middle' font-size='${font}' font-family='Georgia, serif' font-weight='700' fill='white'>${word}</text></svg>`;
  }
  const pane = Math.min(46, Math.max(8, amount / 2));
  const feather = Math.min(pane, Math.max(0, options?.feather ?? 0) / 2);
  const angle = options?.angle ?? 0;
  const softIn = Math.max(0, pane - feather);
  const softOut = Math.min(100, 100 - pane + feather);
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='seam' gradientUnits='userSpaceOnUse' x1='0' y1='50' x2='100' y2='50' gradientTransform='rotate(${angle} 50 50)'><stop offset='0%' stop-color='white' stop-opacity='1'/><stop offset='${softIn}%' stop-color='white' stop-opacity='1'/><stop offset='${pane}%' stop-color='white' stop-opacity='0'/><stop offset='${100 - pane}%' stop-color='white' stop-opacity='0'/><stop offset='${softOut}%' stop-color='white' stop-opacity='1'/><stop offset='100%' stop-color='white' stop-opacity='1'/></linearGradient></defs><rect width='100' height='100' fill='url(#seam)'/></svg>`;
}

export function mediaMaskClipCss(
  mask: PenMediaMask | null | undefined,
  size?: number
): string | undefined {
  if (!mask || mask === 'none' || mask === 'split' || mask === 'filmstrip' || mask === 'text') return undefined;
  const amount = Math.max(0, size ?? 100);
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
  const flip = layer.mediaMirror ? -1 : 1;
  if (scale === 1 && x === 0 && y === 0 && flip === 1) return undefined;
  return `translate(${x}%, ${y}%) scale(${scale * flip}, ${scale})`;
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
  vivid: { brightness: 105, contrast: 115, saturation: 160 },
  punch: { brightness: 102, contrast: 140, saturation: 130 },
  fade: { brightness: 110, contrast: 85, saturation: 70, fade: 25 },
  matte: { brightness: 112, contrast: 82, saturation: 75, fade: 15 },
  warm: { brightness: 105, contrast: 105, saturation: 115, temp: 45 },
  cool: { brightness: 100, contrast: 108, saturation: 90, temp: -40 },
  sepia: { brightness: 105, contrast: 95, saturation: 40, temp: 70 },
  noir: { brightness: 95, contrast: 140, saturation: 0 },
  mono: { brightness: 100, contrast: 110, saturation: 0 },
  bleach: { brightness: 125, contrast: 85, saturation: 35 },
  film: { brightness: 102, contrast: 118, saturation: 85, temp: 18, fade: 12 },
  vintage: { brightness: 108, contrast: 88, saturation: 65, temp: 35, fade: 20 },
  chrome: { brightness: 108, contrast: 125, saturation: 70, temp: -20 }
};
