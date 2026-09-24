/**
 * Renders an image or video layer with crop / mask / filter / paint overlay.
 * One-shot aspect report (cached) — never re-probes on every resize.
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
import { cachedMediaAspect, probeMediaAspect } from '../services/penMediaAspect';
import type { PenSession } from '../services/penSession';

const ASPECT_SLACK = 0.03;

export function LayerMediaContent({
  layer,
  className,
  onActivate: _onActivate,
  docId,
  session,
  onNaturalAspect,
  /** When true (selected layer / media panel), tap toggles play/pause. */
  selected = true
}: {
  layer: PenPageLayer;
  className?: string;
  onActivate?: () => void;
  docId?: string;
  session?: PenSession | null;
  onNaturalAspect?: (aspect: number) => void;
  selected?: boolean;
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
  /** One report per media src — reshape must not re-trigger probing. */
  const reportedSrc = useRef<string | null>(null);
  const onNaturalAspectRef = useRef(onNaturalAspect);
  onNaturalAspectRef.current = onNaturalAspect;
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const isVideo =
    layer.kind === 'video' ||
    Boolean(layer.videoSrc) ||
    (Boolean(layer.backgroundVideo) && layer.kind !== 'image');

  useEffect(() => {
    if (!resolved || !onNaturalAspectRef.current) return;
    if (reportedSrc.current === resolved) return;

    let cancelled = false;
    const kind = isVideo ? 'video' : 'image';

    void (async () => {
      const cached = cachedMediaAspect(resolved);
      const aspect = cached ?? (await probeMediaAspect(resolved, kind));
      if (cancelled || !(aspect > 0)) return;
      reportedSrc.current = resolved;
      const l = layerRef.current;
      const layerAspect = l.w / Math.max(1, l.h);
      if (Math.abs(layerAspect - aspect) / aspect <= ASPECT_SLACK) return;
      onNaturalAspectRef.current?.(aspect);
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit layer.w/h — reshape must not re-enter this effect.
  }, [resolved, isVideo]);

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
      className={`relative h-full w-full min-h-0 min-w-0 ${className || ''}`}
      style={outerStyle}
    >
      {isVideo ? (
        <PenMediaPlayer
          src={resolved}
          className="absolute inset-0 bg-transparent"
          videoStyle={innerStyle}
          tapToToggle={selected}
        />
      ) : (
        <img
          src={resolved}
          alt=""
          className="absolute inset-0"
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
