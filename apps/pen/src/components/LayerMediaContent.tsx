/**
 * Renders an image or video layer with crop / mask / filter / paint overlay.
 * One-shot aspect report (cached) — never re-probes on every resize.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  editorPlaybackSrc,
  mediaCropClipCss,
  mediaFilterCss,
  mediaMaskClipCss,
  mediaTransformCss,
  mergeMediaFilter,
  publishPlaybackSrc,
  tonalGradeActive,
  type PenPageLayer
} from '@par-noir/pen-protocol';
import { paintGradedFrame, peekPenMediaController, PenMediaPlayer, type TonalGrade } from '@par-noir/feed-tile';
import { usePlaybackMode } from '../hooks/usePlaybackMode';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { cachedMediaAspect, probeMediaAspect } from '../services/penMediaAspect';
import type { PenSession } from '../services/penSession';

const ASPECT_SLACK = 0.03;
const PARTICLE_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><circle cx='6' cy='10' r='0.7' fill='white'/><circle cx='28' cy='22' r='0.5' fill='white'/><circle cx='52' cy='8' r='0.6' fill='white'/><circle cx='70' cy='36' r='0.5' fill='white'/><circle cx='18' cy='48' r='0.6' fill='white'/><circle cx='44' cy='58' r='0.4' fill='white'/><circle cx='64' cy='66' r='0.6' fill='white'/><circle cx='36' cy='40' r='0.4' fill='white'/></svg>\")";

function GradedStill({
  src,
  fit,
  grade,
  style
}: {
  src: string;
  fit: string;
  grade: TonalGrade;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round((rect.width || 1) * dpr));
      const height = Math.max(1, Math.round((rect.height || 1) * dpr));
      node.width = width;
      node.height = height;
      paintGradedFrame(node, img, width, height, fit, grade);
    };
    img.src = src;
  }, [
    src,
    fit,
    grade.highlight,
    grade.shadow,
    grade.whites,
    grade.blacks,
    grade.brilliance,
    grade.sharpen,
    grade.clarity
  ]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={style} />;
}

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
  const playback = usePlaybackMode();
  const isVideo =
    layer.kind === 'video' ||
    Boolean(layer.videoSrc) ||
    (Boolean(layer.backgroundVideo) && layer.kind !== 'image');
  const src = isVideo
    ? playback === 'publish'
      ? publishPlaybackSrc(layer)
      : editorPlaybackSrc(layer)
    : layer.kind === 'image'
      ? layer.imageSrc || layer.backgroundImage
      : layer.backgroundImage;
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

  useEffect(() => {
    if (!isVideo || !resolved) return;
    const ctrl = peekPenMediaController(`pen-layer:${layer.id}`);
    if (!ctrl) return;
    ctrl.setPlaybackRate(layer.playbackRate ?? 1);
    ctrl.setClipAudio((layer.mediaGain ?? 100) / 100, layer.mediaMuted === false);
  }, [isVideo, resolved, layer.id, layer.playbackRate, layer.mediaGain, layer.mediaMuted]);

  if (!src || !resolved) return null;

  const grade = mergeMediaFilter(layer.mediaFilter);
  const filter = mediaFilterCss(layer);
  const cropClip = mediaCropClipCss(layer.mediaCrop);
  const maskClip = mediaMaskClipCss(layer.mediaMask, layer.mediaMaskSize);
  const transform = mediaTransformCss(layer);
  const tonal: TonalGrade | null = tonalGradeActive(grade)
    ? {
        highlight: grade.highlight,
        shadow: grade.shadow,
        whites: grade.whites,
        blacks: grade.blacks,
        brilliance: grade.brilliance,
        sharpen: grade.sharpen,
        clarity: grade.clarity
      }
    : null;

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
      data-pen-playback={isVideo ? playback : undefined}
      className={`relative h-full w-full min-h-0 min-w-0 ${className || ''}`}
      style={outerStyle}
    >
      <div className="absolute inset-0" style={transform ? { transform } : undefined}>
        {isVideo ? (
          <PenMediaPlayer
            src={resolved}
            syncKey={`pen-layer:${layer.id}`}
            autoPlay={false}
            className="absolute inset-0 bg-transparent"
            videoStyle={innerStyle}
            tapToToggle={selected}
            grade={tonal}
          />
        ) : tonal ? (
          <GradedStill src={resolved} fit="contain" grade={tonal} style={innerStyle} />
        ) : (
          <img
            src={resolved}
            alt=""
            className="absolute inset-0"
            style={innerStyle}
            draggable={false}
          />
        )}
      </div>
      {grade.vignette > 0 ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, transparent ${Math.max(15, 72 - grade.vignette * 0.4)}%, rgba(0,0,0,${Math.min(0.85, grade.vignette / 120)}) 100%)`
          }}
        />
      ) : null}
      {grade.particles > 0 ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: grade.particles / 100,
            backgroundImage: PARTICLE_NOISE,
            backgroundSize: '80px 80px'
          }}
        />
      ) : null}
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
