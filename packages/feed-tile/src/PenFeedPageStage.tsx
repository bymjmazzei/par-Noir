import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildActionOverlayAtTime,
  collectFontFamiliesFromLayers,
  isDirectImageSrc,
  layerMediaSource,
  penViewerGroupKey,
  pollCountsFromWidgetView,
  scoreCaption,
  emptyPenViewerState,
  isTapBehavior,
  penViewerButtonFace,
  pressPenAction,
  timeLayerCaption,
  trackingWidgetId,
  voteFaceForLayer,
  type PenActionEffect,
  type PenActionTrack,
  type PenFeedLayerMedia,
  type PenFeedPagePayload,
  type PenPageLayer,
  type PenSectionContent,
  type PenViewerState,
  type WidgetViewPayload
} from '@par-noir/pen-protocol';
import type { CSSProperties } from 'react';
import { DEFAULT_FEED_PLAYBACK, FeedLoopVideo, type FeedPlayback } from './FeedLoopVideo.js';
import { LeaveSheet, needsLeaveSheet, type LeaveEffect } from './LeaveSheet.js';
import { PenLayerFace } from './PenLayerFace.js';
import { ensureGoogleFontsLoaded } from './penGoogleFonts.js';
import { layerFrameStyle } from './penLayerStyle.js';

/** Resolves a published layer media file to an address the stage can draw. */
export type ResolveLayerMedia = (fileId: string, kind: PenFeedLayerMedia['kind']) => Promise<string>;

/** Poll result that replaces the label, or a live counter shown after it. */
function buttonRuntime(
  layer: PenPageLayer,
  state: PenViewerState,
  allLayers: PenPageLayer[],
  docId: string,
  widgetViews: Record<string, WidgetViewPayload>
): { runtimeLabel?: string; labelSuffix?: string } {
  if (layer.behavior === 'poll.vote' && docId) {
    const widgetId = trackingWidgetId(docId, allLayers, layer);
    const view = widgetId ? widgetViews[widgetId] : undefined;
    const groupKey = penViewerGroupKey(layer);
    const voted =
      (typeof view?.myResponse?.optionId === 'string' ? view.myResponse.optionId : '') ||
      state.voted[groupKey] ||
      null;
    const section: PenSectionContent = {
      slug: 'feed-action',
      doc: { type: 'doc', content: [] },
      layers: allLayers
    };
    const runtime = voteFaceForLayer(
      section,
      layer,
      voted,
      pollCountsFromWidgetView(view),
      undefined,
      view?.phase
    ).text;
    return runtime ? { runtimeLabel: runtime } : {};
  }
  const live = penViewerButtonFace(layer, state);
  return live ? { labelSuffix: live } : {};
}

/** Face px scaled by the layer's group zoom (tailwind text-sm is 14px, text-xs 12px). */
function faceFontPx(layer: PenPageLayer, basePx: number): string | undefined {
  const scale = layer.contentScale ?? 1;
  return scale === 1 ? undefined : `${basePx * scale}px`;
}

type StageCanvas = { w: number; h: number; inset: number };

function layerShellStyle(layer: PenPageLayer, canvas: StageCanvas): CSSProperties {
  return {
    ...layerFrameStyle(layer),
    position: 'absolute',
    boxSizing: 'border-box',
    left: `${((layer.x + canvas.inset) / canvas.w) * 100}%`,
    top: `${((layer.y + canvas.inset) / canvas.h) * 100}%`,
    width: `${(layer.w / canvas.w) * 100}%`,
    height: `${(layer.h / canvas.h) * 100}%`,
    zIndex: layer.zIndex,
    transform: layer.rotate ? `rotate(${layer.rotate}deg)` : undefined,
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
  return (
    <PenLayerFace
      layer={layer}
      style={{ ...shell, fontSize: faceFontPx(layer, 12) }}
      paintScale={layer.contentScale}
      caption={timeLayerCaption(layer, now)}
    />
  );
}

function OverlayLayer({
  layer,
  canvas,
  state,
  allLayers,
  docId,
  widgetViews,
  fontFamily,
  mediaSrc,
  playback,
  onPress,
  onInput
}: {
  layer: PenPageLayer;
  canvas: StageCanvas;
  state: PenViewerState;
  allLayers: PenPageLayer[];
  docId: string;
  widgetViews: Record<string, WidgetViewPayload>;
  fontFamily?: string;
  mediaSrc?: string;
  playback: FeedPlayback;
  onPress: (layerId: string) => void;
  onInput: (layerId: string, value: string) => void;
}) {
  const shell = layerShellStyle(layer, canvas);
  if (layer.widgetElement === 'time') {
    return <TimeFace layer={layer} shell={shell} />;
  }
  const runtime =
    layer.kind === 'interactive' ? buttonRuntime(layer, state, allLayers, docId, widgetViews) : {};
  const caption =
    layer.widgetElement === 'score'
      ? scoreCaption(allLayers, state, layer.parentGroupId || null)
      : undefined;
  return (
    <PenLayerFace
      layer={layer}
      style={shell}
      paintScale={layer.contentScale}
      fontFamily={fontFamily}
      {...runtime}
      caption={caption}
      inputValue={state.inputs[layer.id]}
      onInput={onInput}
      onPress={layer.kind === 'interactive' && layer.behavior ? onPress : undefined}
      mediaSrc={mediaSrc}
      playback={playback}
    />
  );
}

/** Published layer media resolved through the host, keyed by layer id. */
function useLayerMediaSrc(
  layerMedia: PenFeedPagePayload['layerMedia'],
  resolve: ResolveLayerMedia | undefined
): Record<string, string> {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const key = layerMedia ? JSON.stringify(layerMedia) : '';
  useEffect(() => {
    const entries = Object.entries(layerMedia || {});
    if (!resolve || !entries.length) {
      setResolved({});
      return;
    }
    let cancel = false;
    void Promise.all(
      entries.map(async ([layerId, media]) => {
        try {
          return [layerId, await resolve(media.fileId, media.kind)] as const;
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      if (cancel) return;
      const next: Record<string, string> = {};
      for (const row of rows) if (row) next[row[0]] = row[1];
      setResolved(next);
    });
    return () => {
      cancel = true;
    };
    // layerMedia is compared by value through key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resolve]);
  return resolved;
}

export function PenFeedPageStage({
  mediaSrc,
  mediaKind = 'image',
  penFeedPage,
  docId = '',
  widgetViews = {},
  externalClockSec,
  onEffect,
  onTrack,
  onPressBlocked,
  onReportLink,
  resolveLayerMedia,
  actorId,
  fit = 'cover',
  playback = DEFAULT_FEED_PLAYBACK
}: {
  mediaSrc?: string;
  mediaKind?: 'image' | 'video';
  penFeedPage: PenFeedPagePayload;
  docId?: string;
  widgetViews?: Record<string, WidgetViewPayload>;
  /** Editor preview: drive overlay from timeline scrubber. */
  externalClockSec?: number;
  /**
   * Side effect of a button press (open, vote, sheet row…). Local state stays here.
   * Open, email, and Messaging effects arrive only after the viewer confirms the leave sheet.
   */
  onEffect?: (effect: PenActionEffect) => void | Promise<void>;
  /** Open, go-to-page, and calendar taps for the doc's Taps widget, sent on press. */
  onTrack?: (track: PenActionTrack) => void;
  /** Viewer must unlock before responding to backend widgets. */
  onPressBlocked?: () => void;
  /** Report link on the leave sheet. Omit where there is nothing to report to. */
  onReportLink?: (url: string) => void;
  /** Loads `penFeedPage.layerMedia` files. Pass a stable function. */
  resolveLayerMedia?: ResolveLayerMedia;
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
  const layerMediaSrc = useLayerMediaSrc(penFeedPage.layerMedia, resolveLayerMedia);

  useEffect(() => {
    ensureGoogleFontsLoaded(
      collectFontFamiliesFromLayers(penFeedPage.actionSection.layers, penFeedPage.fontFamily)
    );
  }, [penFeedPage.actionSection.layers, penFeedPage.fontFamily]);

  const press = (layerId: string) => {
    const layers = penFeedPage.actionSection.layers;
    const layer = layers.find((item) => item.id === layerId);
    if (layer && docId && !isTapBehavior(layer.behavior)) {
      const widgetId = trackingWidgetId(docId, layers, layer);
      const phase = widgetId ? widgetViews[widgetId]?.phase : undefined;
      if (phase === 'locked') {
        onPressBlocked?.();
        return;
      }
    }
    const result = pressPenAction({
      layers,
      layerId,
      state: viewerRef.current,
      actorId,
      docId
    });
    viewerRef.current = result.state;
    setViewer(result.state);
    if (result.track) onTrack?.(result.track);
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
  const canvas: StageCanvas = { ...penFeedPage.canvas, inset: penFeedPage.contentInsetPx ?? 0 };

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
          {layers.map((layer) => {
            const own = layerMediaSource(layer)?.src;
            return (
              <OverlayLayer
                key={layer.id}
                layer={layer}
                canvas={canvas}
                state={viewer}
                allLayers={penFeedPage.actionSection.layers}
                docId={docId}
                widgetViews={widgetViews}
                fontFamily={penFeedPage.fontFamily}
                mediaSrc={layerMediaSrc[layer.id] || (isDirectImageSrc(own) ? own : undefined)}
                playback={playback}
                onPress={press}
                onInput={typeInput}
              />
            );
          })}
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
