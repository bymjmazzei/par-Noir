import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildActionOverlayAtTime,
  docToPlainText,
  emptyPenViewerState,
  penViewerButtonFace,
  pressPenAction,
  type PenActionEffect,
  type PenFeedPagePayload,
  type PenPageLayer,
  type PenViewerState
} from '@par-noir/pen-protocol';
import type { CSSProperties } from 'react';

function buttonLabel(layer: PenPageLayer, state: PenViewerState): string {
  const face = layer.textDoc ? docToPlainText(layer.textDoc).trim() : '';
  const authored = face || layer.label || 'Button';
  const live = penViewerButtonFace(layer, state);
  return live ? `${authored} · ${live}` : authored;
}

function displayableSrc(src: string | undefined): string | undefined {
  const value = (src || '').trim();
  return /^(https?:|blob:|data:image\/)/i.test(value) ? value : undefined;
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
  state,
  revealed,
  onPress,
  onInput
}: {
  layer: PenPageLayer;
  canvas: { w: number; h: number };
  state: PenViewerState;
  revealed: boolean;
  onPress: (layerId: string) => void;
  onInput: (layerId: string, value: string) => void;
}) {
  const shell = layerShellStyle(layer, canvas);
  if (layer.kind === 'interactive' && layer.behavior) {
    return (
      <button
        type="button"
        className="flex h-full w-full items-center justify-center overflow-hidden px-2 text-sm font-medium"
        style={shell}
        data-pen-layer={layer.id}
        data-pen-behavior={layer.behavior}
        onClick={(e) => {
          e.stopPropagation();
          onPress(layer.id);
        }}
      >
        {buttonLabel(layer, state)}
      </button>
    );
  }
  if (layer.kind === 'interactive') {
    return (
      <button type="button" className="flex h-full w-full items-center justify-center text-sm font-medium" style={shell}>
        {buttonLabel(layer, state)}
      </button>
    );
  }
  if (layer.widgetElement === 'input') {
    return (
      <input
        type="text"
        className="h-full w-full px-2 text-sm"
        style={{ ...shell, color: layer.textColor || '#141414', backgroundColor: layer.backgroundColor || '#ffffff' }}
        data-pen-layer={layer.id}
        placeholder={layer.label || layer.name || ''}
        value={state.inputs[layer.id] || ''}
        onChange={(e) => onInput(layer.id, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  }
  if (!revealed) return null;
  if (layer.kind === 'text' && layer.textDoc) {
    return (
      <div
        className="overflow-hidden whitespace-pre-wrap break-words p-2 text-sm"
        style={shell}
        data-pen-layer={layer.id}
      >
        {docToPlainText(layer.textDoc)}
      </div>
    );
  }
  const src = layer.kind === 'image' ? displayableSrc(layer.imageSrc) : undefined;
  if (src) {
    return (
      <div className="overflow-hidden" style={shell} data-pen-layer={layer.id}>
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return null;
}

export function PenFeedPageStage({
  mediaSrc,
  mediaKind = 'image',
  penFeedPage,
  externalClockSec,
  onEffect,
  actorId,
  fit = 'cover'
}: {
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
  penFeedPage: PenFeedPagePayload;
  /** Editor preview: drive overlay from timeline scrubber. */
  externalClockSec?: number;
  /** Side effect of a button press (open, vote, sheet row…). Local state stays here. */
  onEffect?: (effect: PenActionEffect) => void;
  /** Hashed viewer id stamped on sheet rows. */
  actorId?: string;
  fit?: 'cover' | 'contain';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [viewer, setViewer] = useState<PenViewerState>(emptyPenViewerState);
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  const press = (layerId: string) => {
    const result = pressPenAction({
      layers: penFeedPage.actionSection.layers,
      layerId,
      state: viewerRef.current,
      actorId
    });
    viewerRef.current = result.state;
    setViewer(result.state);
    if (result.effect.kind !== 'none') onEffect?.(result.effect);
  };

  const typeInput = (layerId: string, value: string) => {
    const next = { ...viewerRef.current, inputs: { ...viewerRef.current.inputs, [layerId]: value } };
    viewerRef.current = next;
    setViewer(next);
  };
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
    () => buildActionOverlayAtTime(penFeedPage.actionSection, overlayTime, viewer.revealed),
    [penFeedPage.actionSection, overlayTime, viewer.revealed]
  );
  const revealed = useMemo(() => new Set(viewer.revealed), [viewer.revealed]);

  const isVideo = mediaKind === 'video' && Boolean(mediaSrc);
  const mediaClass =
    fit === 'contain'
      ? 'absolute inset-0 h-full w-full object-contain'
      : 'absolute inset-0 h-full w-full object-cover';

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {mediaSrc ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={mediaSrc}
            className={mediaClass}
            muted
            loop
            playsInline
            autoPlay
          />
        ) : (
          <img src={mediaSrc} alt="" className={mediaClass} />
        )
      ) : null}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto relative h-full w-full">
          {layers.map((layer) => (
            <OverlayLayer
              key={layer.id}
              layer={layer}
              canvas={canvas}
              state={viewer}
              revealed={revealed.has(layer.id)}
              onPress={press}
              onInput={typeInput}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
