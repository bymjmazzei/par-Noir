/**
 * How an overlay layer is painted, shared by the Pen editor and feed playback.
 * Chrome sits on the layer's frame; paint fills the clipped face inside it.
 */

import { layerShadowCss, layerStrokeStyle } from './layers.js';
import { publishPlaybackSrc } from './playbackSrc.js';
import type { PenPageLayer } from './types.js';

export type PenLayerMediaSource = { src: string; kind: 'image' | 'video' };

/**
 * The one image or video a layer paints: the picture of an image/video layer,
 * or the background video / image behind an Art fill or text box.
 */
export function layerMediaSource(layer: PenPageLayer): PenLayerMediaSource | null {
  if (layer.kind === 'group') return null;
  if (layer.kind === 'image') {
    const src = (layer.imageSrc || layer.backgroundImage || '').trim();
    return src ? { src, kind: 'image' } : null;
  }
  const video = layer.kind === 'video' || layer.backgroundVideo?.trim() ? publishPlaybackSrc(layer) : undefined;
  if (video) return { src: video, kind: 'video' };
  const image = (layer.backgroundImage || '').trim();
  return image ? { src: image, kind: 'image' } : null;
}

export type PenLayerPaint = {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  borderRadius?: string;
  color?: string;
};

export type PenLayerChrome = {
  opacity?: number;
  mixBlendMode?: string;
  filter?: string;
  boxShadow?: string;
  border?: string;
  outline?: string;
  outlineOffset?: number;
};

/** Fill when an object layer has no background of its own. */
export const DEFAULT_LAYER_FILL = 'rgba(255,255,255,0.95)';

/** True for addresses a viewer can load as-is; Pen media refs need resolving first. */
export function isDirectImageSrc(src: string | null | undefined): boolean {
  const value = (src || '').trim();
  return Boolean(value) && !/^pen(local|media):/.test(value);
}

function isMediaLayer(layer: PenPageLayer): boolean {
  return layer.kind === 'image' || layer.kind === 'video';
}

/**
 * Fill on the clipped face.
 * `backgroundImageSrc` is a resolved address for a Pen media `backgroundImage`.
 * `scale` multiplies the corner radius (feed tiles pass the group zoom).
 */
export function layerPaintStyle(
  layer: PenPageLayer,
  opts: { scale?: number; backgroundImageSrc?: string } = {}
): PenLayerPaint {
  if (layer.kind === 'group') return { backgroundColor: 'transparent' };
  if (isMediaLayer(layer)) return { backgroundColor: layer.backgroundColor || 'transparent' };
  const paint: PenLayerPaint = {};
  if (layer.cornerRadius) paint.borderRadius = `${layer.cornerRadius * (opts.scale ?? 1)}px`;
  // A text layer's color lives in its text document.
  if (layer.textColor && layer.kind !== 'text') paint.color = layer.textColor;
  const image = opts.backgroundImageSrc ||
    (isDirectImageSrc(layer.backgroundImage) ? layer.backgroundImage!.trim() : '');
  if (layer.backgroundGradient) {
    paint.backgroundImage = layer.backgroundGradient;
  } else if (image) {
    paint.backgroundImage = `url(${image})`;
    paint.backgroundSize = 'cover';
    paint.backgroundPosition = 'center';
  } else if (layer.backgroundColor) {
    paint.backgroundColor = layer.backgroundColor;
  } else if (layer.backgroundVideo?.trim()) {
    paint.backgroundColor = 'transparent';
  } else {
    paint.backgroundColor = DEFAULT_LAYER_FILL;
  }
  return paint;
}

/** Opacity, blend, blur, shadow, and stroke on the layer's frame. */
export function layerChromeStyle(layer: PenPageLayer): PenLayerChrome {
  const shadow = layerShadowCss(layer);
  const stroke = layerStrokeStyle(layer);
  const opacityPct = Math.max(0, Math.min(100, layer.opacity ?? 100));
  const blended = Boolean(layer.mixBlendMode && layer.mixBlendMode !== 'normal');
  const blendAmt = (layer.blendAmount ?? 100) / 100;
  const boxShadow =
    stroke.boxShadow && shadow ? `${stroke.boxShadow}, ${shadow}` : stroke.boxShadow || shadow;
  const chrome: PenLayerChrome = {
    opacity: (opacityPct / 100) * (blended ? blendAmt : 1),
    mixBlendMode: layer.mixBlendMode || undefined,
    filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
    boxShadow,
    border: stroke.border,
    outline: stroke.outline,
    outlineOffset: stroke.outlineOffset
  };
  return chrome;
}
