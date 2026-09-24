/**
 * Renders an image or video layer with crop / mask / filter / paint overlay.
 * Reports natural media aspect so the frame can match the video exactly.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  mediaCropClipCss,
  mediaFilterCss,
  mediaMaskClipCss,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { PenMediaPlayer } from '@par-noir/feed-tile';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import type { PenSession } from '../services/penSession';

const ASPECT_SLACK = 0.02;

export function LayerMediaContent({
  layer,
  className,
  onActivate: _onActivate,
  docId,
  session,
  onNaturalAspect
}: {
  layer: PenPageLayer;
  className?: string;
  /** Select this layer without starting a drag (video/image pointer down). */
  onActivate?: () => void;
  docId?: string;
  session?: PenSession | null;
  /**
   * Fired once when intrinsic media aspect is known and differs from the layer
   * frame — editor should reshape the layer to match.
   */
  onNaturalAspect?: (aspect: number) => void;
}): ReactNode {
  const src =
    layer.kind === 'video'
      ? layer.videoSrc || layer.backgroundVideo
      : layer.kind === 'image'
        ? layer.imageSrc || layer.backgroundImage
        : layer.backgroundVideo || layer.backgroundImage;
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  const { resolved: overlayResolved } = useResolvedMediaSrc(layer.paintOverlaySrc, {
    docId,
    session
  });
  const reportedFor = useRef<string | null>(null);

  const isVideo =
    layer.kind === 'video' ||
    Boolean(layer.videoSrc) ||
    (Boolean(layer.backgroundVideo) && layer.kind !== 'image');

  useEffect(() => {
    if (!resolved || !onNaturalAspect) return;
    const key = `${layer.id}:${resolved}`;
    if (reportedFor.current === key) return;

    let cancelled = false;
    const report = (aspect: number) => {
      if (cancelled || !(aspect > 0)) return;
      const layerAspect = layer.w / Math.max(1, layer.h);
      if (Math.abs(layerAspect - aspect) / aspect <= ASPECT_SLACK) {
        reportedFor.current = key;
        return;
      }
      reportedFor.current = key;
      onNaturalAspect(aspect);
    };

    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      const read = () => {
        const w = video.videoWidth || 0;
        const h = video.videoHeight || 0;
        if (w > 0 && h > 0) report(w / h);
      };
      video.addEventListener('loadedmetadata', read);
      video.addEventListener('loadeddata', read);
      video.src = resolved;
      void video.load();
      return () => {
        cancelled = true;
        video.removeEventListener('loadedmetadata', read);
        video.removeEventListener('loadeddata', read);
      };
    }

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0) report(w / h);
    };
    img.src = resolved;
    return () => {
      cancelled = true;
    };
  }, [resolved, isVideo, layer.id, layer.w, layer.h, onNaturalAspect]);

  if (!src || !resolved) return null;

  const filter = mediaFilterCss(layer);
  const cropClip = mediaCropClipCss(layer.mediaCrop);
  const maskClip = mediaMaskClipCss(layer.mediaMask);

  const outerStyle: CSSProperties = {
    clipPath: maskClip,
    overflow: 'hidden',
    backgroundColor: 'transparent'
  };
  const innerStyle: CSSProperties = {
    ...(filter ? { filter } : {}),
    ...(cropClip ? { clipPath: cropClip } : {}),
    width: '100%',
    height: '100%',
    // Frame is sized to media aspect — contain fills without cropping or letterbox.
    objectFit: 'contain'
  };

  return (
    <div
      className={`pointer-events-none relative h-full w-full min-h-0 min-w-0 ${className || ''}`}
      style={outerStyle}
    >
      {isVideo ? (
        <PenMediaPlayer
          src={resolved}
          className="absolute inset-0 bg-transparent"
          videoStyle={innerStyle}
          allowDragThrough
        />
      ) : (
        <img
          src={resolved}
          alt=""
          className="pointer-events-none absolute inset-0"
          style={innerStyle}
          draggable={false}
        />
      )}
      {overlayResolved ? (
        <img
          src={overlayResolved}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={cropClip ? { clipPath: cropClip } : undefined}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
