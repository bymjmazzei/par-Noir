import type { CSSProperties } from 'react';
import { layerChromeStyle, layerPaintStyle, type PenPageLayer } from '@par-noir/pen-protocol';

/** Opacity, blend, blur, shadow, and stroke for the layer's frame. */
export function layerFrameStyle(layer: PenPageLayer): CSSProperties {
  return layerChromeStyle(layer) as CSSProperties;
}

/** Fill for the clipped face inside the frame. */
export function layerFaceStyle(
  layer: PenPageLayer,
  opts?: { scale?: number; backgroundImageSrc?: string }
): CSSProperties {
  return layerPaintStyle(layer, opts) as CSSProperties;
}
