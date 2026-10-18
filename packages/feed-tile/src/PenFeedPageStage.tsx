import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildActionOverlayAtTime,
  docToHtml,
  docToPlainText,
  scoreCaption,
  emptyPenViewerState,
  penViewerButtonFace,
  pressPenAction,
  timeLayerCaption,
  type PenActionEffect,
  type PenFeedPagePayload,
  type PenPageLayer,
  type PenViewerState
} from '@par-noir/pen-protocol';
import type { CSSProperties } from 'react';
import { DEFAULT_FEED_PLAYBACK, FeedLoopVideo, type FeedPlayback } from './FeedLoopVideo.js';
import { LeaveSheet, needsLeaveSheet, type LeaveEffect } from './LeaveSheet.js';

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

/** Face px scaled by the layer's group zoom (tailwind text-sm is 14px, text-xs 12px). */
function faceFontPx(layer: PenPageLayer, basePx: number): string | undefined {
  const scale = layer.contentScale ?? 1;
  return scale === 1 ? undefined : `${basePx * scale}px`;
}

function layerShellStyle(layer: PenPageLayer, canvas: { w: number; h: number }): CSSProperties {
  const scale = layer.contentScale ?? 1;
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
    borderRadius: layer.cornerRadius != null ? `${layer.cornerRadius * scale}px` : undefined,
    fontSize: faceFontPx(layer, 14)
  };
}

/** Clock or countdown face; a countdown ticks every second. */
function TimeFace({ layer, shell }: { layer: PenPageLayer; shell: CSSProperties }) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = (layer.timeFace ?? (layer.closesAt ? 'countdown' : 'blank')) === 'countdown';
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  const caption = timeLayerCaption(layer, now);
  if (!caption) return null;
  return (
    <div
      className="pointer-events-none flex items-center justify-center overflow-hidden whitespace-nowrap text-xs tabular-nums"
      style={{ ...shell, fontSize: faceFontPx(layer, 12) }}
      data-pen-layer={layer.id}
      data-pen-time="1"
    >
      {caption}
    </div>
  );
}

function OverlayLayer({
  layer,
  canvas,
  state,
  allLayers,
  onPress,
  onInput
}: {
  layer: PenPageLayer;
  canvas: { w: number; h: number };
  state: PenViewerState;
  allLayers: PenPageLayer[];
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
  if (layer.widgetElement === 'time') {
    return <TimeFace layer={layer} shell={shell} />;
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
  if (layer.widgetElement === 'score') {
    const text = scoreCaption(allLayers, state, layer.parentGroupId || null);
    if (!text) return null;
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm font-semibold tabular-nums"
        style={shell}
        data-pen-layer={layer.id}
        data-pen-score="1"
      >
        {text}
      </div>
    );
  }
  if (layer.kind === 'text' && layer.textDoc) {
    const html = docToHtml(layer.textDoc);
    return (
      <div
        className="pen-rich-html overflow-hidden p-2 text-sm"
        style={shell}
        data-pen-layer={layer.id}
        dangerouslySetInnerHTML={{ __html: html || docToPlainText(layer.textDoc) }}
      />
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
  onReportLink,
  actorId,
  fit = 'cover',
  playback = DEFAULT_FEED_PLAYBACK
}: {
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
  penFeedPage: PenFeedPagePayload;
  /** Editor preview: drive overlay from timeline scrubber. */
  externalClockSec?: number;
  /**
   * Side effect of a button press (open, vote, sheet row…). Local state stays here.
   * Open, email, and Messaging effects arrive only after the viewer confirms the leave sheet.
   */
  onEffect?: (effect: PenActionEffect) => void;
  /** Report link on the leave sheet. Omit where there is nothing to report to. */
  onReportLink?: (url: string) => void;
  /** Hashed viewer id stamped on sheet rows. */
  actorId?: string;
  fit?: 'cover' | 'contain';
  playback?: FeedPlayback;
}) {
  const [videoTime, setVideoTime] = useState(0);
  const [viewer, setViewer] = useState<PenViewerState>(emptyPenViewerState);
  const [leaving, setLeaving] = useState<LeaveEffect | null>(null);
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
    if (result.effect.kind === 'none') return;
    if (needsLeaveSheet(result.effect)) {
      setLeaving(result.effect);
      return;
    }
    onEffect?.(result.effect);
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
    if (mediaKind === 'video') return;
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
    () =>
      buildActionOverlayAtTime(
        penFeedPage.actionSection,
        overlayTime,
        { revealed: viewer.revealed, hidden: viewer.hidden, steps: viewer.steps },
        viewer
      ),
    [penFeedPage.actionSection, overlayTime, viewer]
  );

  const isVideo = mediaKind === 'video' && Boolean(mediaSrc);
  const mediaClass =
    fit === 'contain'
      ? 'absolute inset-0 h-full w-full object-contain'
      : 'absolute inset-0 h-full w-full object-cover';

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {mediaSrc ? (
        isVideo ? (
          <FeedLoopVideo
            src={mediaSrc}
            fit={fit}
            active={playback.active}
            paused={playback.paused}
            muted={playback.muted}
            onLoop={playback.onLoop}
            onTime={(t) => {
              if (externalClockSec == null) setVideoTime(Math.min(duration, t));
            }}
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
              allLayers={penFeedPage.actionSection.layers}
              onPress={press}
              onInput={typeInput}
            />
          ))}
        </div>
      </div>
      {leaving ? (
        <LeaveSheet
          effect={leaving}
          onCancel={() => setLeaving(null)}
          onContinue={() => {
            setLeaving(null);
            onEffect?.(leaving);
          }}
          onReportLink={
            onReportLink
              ? (url) => {
                  setLeaving(null);
                  onReportLink(url);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
