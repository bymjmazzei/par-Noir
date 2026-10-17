import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildActionOverlayAtTime,
  docToPlainText,
  type PenFeedPagePayload,
  type PenPageLayer,
  type PenActionMessage
} from '@par-noir/pen-protocol';
import type { CSSProperties } from 'react';

function buttonLabel(layer: PenPageLayer): string {
  const face = layer.textDoc ? docToPlainText(layer.textDoc).trim() : '';
  return face || layer.label || 'Button';
}

function layerShellStyle(layer: PenPageLayer, canvas: { w: number; h: number }): CSSProperties {
  return {
    position: 'absolute',
    boxSizing: 'border-box',
    left: `${(layer.x / canvas.w) * 100}%`,
    top: `${(layer.y / canvas.h) * 100}%`,
    width: `${(layer.w / canvas.w) * 100}%`,
    height: `${(layer.h / canvas.h) * 100}%`,
    zIndex: layer.zIndex,
    backgroundColor: layer.backgroundColor || undefined,
    color: layer.textColor || undefined,
    opacity: layer.opacity != null ? Math.max(0, Math.min(100, layer.opacity)) / 100 : undefined,
    transform: layer.rotate ? `rotate(${layer.rotate}deg)` : undefined,
    borderRadius: layer.cornerRadius != null ? `${layer.cornerRadius}px` : undefined
  };
}

function OverlayLayer({
  layer,
  canvas,
  onAction
}: {
  layer: PenPageLayer;
  canvas: { w: number; h: number };
  onAction?: (message: PenActionMessage) => void;
}) {
  const shell = layerShellStyle(layer, canvas);
  if (layer.kind === 'interactive' && layer.behavior) {
    return (
      <button
        type="button"
        className="flex h-full w-full items-center justify-center overflow-hidden px-2 text-sm font-medium"
        style={shell}
        data-pen-layer={layer.id}
        onClick={() =>
          onAction?.({
            type: 'pen-action',
            layerId: layer.id,
            behavior: layer.behavior || '',
            bindRowId: layer.bindRowId || ''
          })
        }
      >
        {buttonLabel(layer)}
      </button>
    );
  }
  if (layer.kind === 'interactive') {
    return (
      <button type="button" className="flex h-full w-full items-center justify-center text-sm font-medium" style={shell}>
        {buttonLabel(layer)}
      </button>
    );
  }
  return null;
}

export function PenFeedPageStage({
  mediaSrc,
  mediaKind = 'image',
  penFeedPage,
  externalClockSec,
  onAction
}: {
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
  penFeedPage: PenFeedPagePayload;
  /** Editor preview: drive overlay from timeline scrubber. */
  externalClockSec?: number;
  onAction?: (message: PenActionMessage) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  const duration = penFeedPage.timelineDurationSec ?? penFeedPage.actionSection.timelineDurationSec ?? 5;
  const canvas = penFeedPage.canvas;

  useEffect(() => {
    if (externalClockSec != null) return;
    if (mediaKind === 'video') {
      const video = videoRef.current;
      if (!video) return;
      const onTime = () => {
        const t = video.currentTime;
        setVideoTime(Number.isFinite(t) ? Math.min(duration, t) : 0);
      };
      video.addEventListener('timeupdate', onTime);
      return () => video.removeEventListener('timeupdate', onTime);
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = ((performance.now() - start) / 1000) % Math.max(duration, 0.01);
      setVideoTime(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [externalClockSec, mediaKind, duration, mediaSrc]);

  const overlayTime = externalClockSec != null ? externalClockSec : videoTime;

  const layers = useMemo(
    () => buildActionOverlayAtTime(penFeedPage.actionSection, overlayTime),
    [penFeedPage.actionSection, overlayTime]
  );

  const isVideo = mediaKind === 'video' && Boolean(mediaSrc);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {mediaSrc ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={mediaSrc}
            className="absolute inset-0 h-full w-full object-cover"
            muted
            loop
            playsInline
            autoPlay
          />
        ) : (
          <img src={mediaSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : null}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto relative h-full w-full">
          {layers.map((layer) => (
            <OverlayLayer key={layer.id} layer={layer} canvas={canvas} onAction={onAction} />
          ))}
        </div>
      </div>
    </div>
  );
}
