import type { CSSProperties } from 'react';
import { layerChromeStyle, layerPaintStyle, type PenPageLayer } from '@par-noir/pen-protocol';

/** Opacity, blend, blur, shadow, and stroke for the layer's frame. */
export function layerFrameStyle(layer: PenPageLayer): CSSProperties {
  return layerChromeStyle(layer) as CSSProperties;
}

/** The editor's frame: an unstroked group gets a dashed outline the feed never draws. */
export function editorLayerFrameStyle(layer: PenPageLayer): CSSProperties {
  const frame = layerFrameStyle(layer);
  if (layer.kind !== 'group' || frame.border) return frame;
  return { ...frame, border: '1px dashed rgba(0,0,0,0.25)' };
}

/** Fill for the clipped face inside the frame. */
export function layerFaceStyle(
  layer: PenPageLayer,
  opts?: { scale?: number; backgroundImageSrc?: string }
): CSSProperties {
  return layerPaintStyle(layer, opts) as CSSProperties;
}
