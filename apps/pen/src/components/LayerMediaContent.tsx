/**
 * Renders an image or video layer with crop / mask / filter / paint overlay.
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  mediaCropClipCss,
  mediaFilterCss,
  mediaMaskClipCss,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { PenMediaPlayer } from '@par-noir/feed-tile';

export function LayerMediaContent({
  layer,
  className,
  onActivate
}: {
  layer: PenPageLayer;
  className?: string;
  /** Select this layer without starting a drag (video/image pointer down). */
  onActivate?: () => void;
}): ReactNode {
  const src =
    layer.kind === 'video'
      ? layer.videoSrc || layer.backgroundVideo
      : layer.kind === 'image'
        ? layer.imageSrc || layer.backgroundImage
        : layer.backgroundVideo || layer.backgroundImage;
  if (!src) return null;

  const isVideo =
    layer.kind === 'video' ||
    Boolean(layer.videoSrc) ||
    (Boolean(layer.backgroundVideo) && layer.kind !== 'image');

  const filter = mediaFilterCss(layer);
  const cropClip = mediaCropClipCss(layer.mediaCrop);
  const maskClip = mediaMaskClipCss(layer.mediaMask);

  const outerStyle: CSSProperties = {
    clipPath: maskClip,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a'
  };
  const innerStyle: CSSProperties = {
    ...(filter ? { filter } : {}),
    ...(cropClip ? { clipPath: cropClip } : {}),
    width: '100%',
    height: '100%',
    objectFit: 'contain'
  };

  return (
    <div
      className={`relative h-full w-full min-h-0 min-w-0 ${className || ''}`}
      style={outerStyle}
      onPointerDown={(e) => {
        // Keep selection working; prevent LayoutSurface from starting a move-drag on the media.
        e.stopPropagation();
        onActivate?.();
      }}
    >
      {isVideo ? (
        <PenMediaPlayer src={src} className="absolute inset-0" videoStyle={innerStyle} />
      ) : (
        <img src={src} alt="" className="absolute inset-0" style={innerStyle} draggable={false} />
      )}
      {layer.paintOverlaySrc ? (
        <img
          src={layer.paintOverlaySrc}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={cropClip ? { clipPath: cropClip } : undefined}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
