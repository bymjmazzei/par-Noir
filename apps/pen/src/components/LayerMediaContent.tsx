/**
 * Renders an image or video layer with crop / mask / filter / paint overlay.
 * Reports display (orientation-aware) media aspect so the frame hugs the video.
 */

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  mediaCropClipCss,
  mediaFilterCss,
  mediaMaskClipCss,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { PenMediaPlayer } from '@par-noir/feed-tile';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { readOrientedAspect } from '../services/penAttach';
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
   * Fired when display aspect is known and differs from the layer frame —
   * editor should reshape the layer so the selection ring hugs the media.
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
  const lastReport = useRef<{ key: string; aspect: number } | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;
  const onNaturalAspectRef = useRef(onNaturalAspect);
  onNaturalAspectRef.current = onNaturalAspect;

  const isVideo =
    layer.kind === 'video' ||
    Boolean(layer.videoSrc) ||
    (Boolean(layer.backgroundVideo) && layer.kind !== 'image');

  const reportAspect = useCallback((aspect: number, key: string) => {
    if (!(aspect > 0) || !onNaturalAspectRef.current) return;
    const l = layerRef.current;
    const layerAspect = l.w / Math.max(1, l.h);
    if (Math.abs(layerAspect - aspect) / aspect <= ASPECT_SLACK) {
      lastReport.current = { key, aspect };
      return;
    }
    const prev = lastReport.current;
    if (
      prev &&
      prev.key === key &&
      Math.abs(prev.aspect - aspect) / aspect <= ASPECT_SLACK
    ) {
      return;
    }
    lastReport.current = { key, aspect };
    onNaturalAspectRef.current(aspect);
  }, []);

  const onDisplayAspect = useCallback(
    (aspect: number) => {
      if (!resolved) return;
      reportAspect(aspect, `${layer.id}:${resolved}`);
    },
    [layer.id, resolved, reportAspect]
  );

  useEffect(() => {
    if (!resolved || !onNaturalAspect) return;
    const key = `${layer.id}:${resolved}`;
    let cancelled = false;

    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      const run = async () => {
        await new Promise<void>((done) => {
          video.addEventListener('loadeddata', () => done(), { once: true });
          video.addEventListener('error', () => done(), { once: true });
          video.src = resolved;
          void video.load();
          window.setTimeout(() => done(), 800);
        });
        if (cancelled) return;
        const aspect = await readOrientedAspect(video);
        if (!cancelled && aspect) reportAspect(aspect, key);
      };
      void run();
      return () => {
        cancelled = true;
      };
    }

    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0) reportAspect(w / h, key);
    };
    img.src = resolved;
    return () => {
      cancelled = true;
    };
  }, [resolved, isVideo, layer.id, layer.w, layer.h, onNaturalAspect, reportAspect]);

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
          onDisplayAspect={onDisplayAspect}
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
