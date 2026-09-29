/**
 * Section clock. Each non-guide layer is a track. Keys live on the layer.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  acquirePenMediaController,
  peekPenMediaController,
  type PenMediaController
} from '@par-noir/feed-tile';
import {
  applyTransitionPreset,
  defaultLayerName,
  editorPlaybackSrc,
  KEYFRAME_EPSILON_SEC,
  layerSampleTime,
  publishPlaybackSrc,
  resolveTimelineDuration,
  sampleLayerAt,
  setKeyframeEase,
  spanLeavingKey,
  toggleKeyframeAt,
  upsertLayer,
  wrapTime,
  type PenKeyframeEase,
  type PenPageLayer,
  type PenSectionContent,
  type PenTransitionPreset
} from '@par-noir/pen-protocol';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { usePlaybackMode } from '../hooks/usePlaybackMode';
import type { PenSession } from '../services/penSession';

const GRAPH_CURVES: Array<{ id: PenKeyframeEase; label: string; d: string }> = [
  { id: 'hold', label: 'Original', d: 'M2 14 H10 V2 H14' },
  { id: 'linear', label: 'Linear', d: 'M2 14 L14 2' },
  { id: 'easeIn', label: 'Ease In', d: 'M2 14 C2 14 12 14 14 2' },
  { id: 'quadIn', label: 'Quad In', d: 'M2 14 C4 14 12 12 14 2' },
  { id: 'cubicIn', label: 'Cubic In', d: 'M2 14 C2 14 14 12 14 2' },
  { id: 'easeOut', label: 'Ease Out', d: 'M2 14 C2 2 14 2 14 2' },
  { id: 'quadOut', label: 'Quad Out', d: 'M2 14 C2 6 8 2 14 2' },
  { id: 'cubicOut', label: 'Cubic Out', d: 'M2 14 C2 4 4 2 14 2' },
  { id: 'easeInOut', label: 'Ease In Out', d: 'M2 14 C6 14 10 2 14 2' }
];

function DiamondMark({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M7 1.5 12.5 7 7 12.5 1.5 7 Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function trackRows(section: PenSectionContent): Array<{ layer: PenPageLayer; depth: number }> {
  const layers = (section.layers || []).filter((layer) => layer.kind !== 'guide');
  const top = layers
    .filter((layer) => !layer.parentGroupId)
    .sort((a, b) => a.zIndex - b.zIndex);
  const rows: Array<{ layer: PenPageLayer; depth: number }> = [];
  for (const layer of top) {
    rows.push({ layer, depth: 0 });
    if (layer.kind !== 'group') continue;
    const kids = layers
      .filter((item) => item.parentGroupId === layer.id)
      .sort((a, b) => a.zIndex - b.zIndex);
    for (const kid of kids) rows.push({ layer: kid, depth: 1 });
  }
  return rows;
}

function rowDuration(section: PenSectionContent, layer: PenPageLayer, pageDuration: number): number {
  if (layer.kind === 'group' && layer.durationSec && layer.durationSec > 0) return layer.durationSec;
  if (layer.parentGroupId) {
    const group = (section.layers || []).find((item) => item.id === layer.parentGroupId);
    if (group?.durationSec && group.durationSec > 0) return group.durationSec;
  }
  return pageDuration;
}

function AudioLane({
  src,
  docId,
  session,
  gain,
  muted = false,
  offsetSec,
  time,
  playing
}: {
  src: string;
  docId?: string;
  session?: PenSession | null;
  gain: number;
  muted?: boolean;
  offsetSec: number;
  time: number;
  playing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !resolved) return;
    el.volume = muted ? 0 : Math.min(1, Math.max(0, gain / 100));
    const at = Math.max(0, time - offsetSec);
    if (Math.abs(el.currentTime - at) > 0.35) {
      try {
        el.currentTime = at;
      } catch {
        /* ignore seek before metadata */
      }
    }
    if (playing && time >= offsetSec) void el.play().catch(() => undefined);
    else el.pause();
  }, [resolved, gain, muted, offsetSec, time, playing]);
  if (!resolved) return null;
  return <audio ref={audioRef} src={resolved} preload="metadata" />;
}

function placeVideo(master: HTMLVideoElement, at: number) {
  const dur = master.duration;
  if (!dur || !Number.isFinite(dur)) return;
  const target = Math.min(dur, Math.max(0, at));
  if (Math.abs((master.currentTime || 0) - target) <= 0.35) return;
  try {
    master.currentTime = target;
  } catch {
    /* metadata not ready */
  }
}

/** Holds a resolved clip URL so Play can start the shared player in the click. */
function RememberVideoSrc({
  layerId,
  src,
  docId,
  session,
  srcs
}: {
  layerId: string;
  src: string;
  docId?: string;
  session?: PenSession | null;
  srcs: { current: Map<string, string> };
}) {
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  useEffect(() => {
    if (!resolved) return;
    srcs.current.set(layerId, resolved);
    return () => {
      srcs.current.delete(layerId);
    };
  }, [resolved, layerId, srcs]);
  return null;
}

export function SectionTimeline({
  section,
  activeLayerId,
  playheadSec,
  playing,
  docId,
  session,
  onPlayhead,
  onPlaying,
  onSelectLayer,
  onSectionChange
}: {
  section: PenSectionContent;
  activeLayerId: string | null;
  playheadSec: number;
  playing: boolean;
  docId?: string;
  session?: PenSession | null;
  onPlayhead: (time: number) => void;
  onPlaying: (playing: boolean) => void;
  onSelectLayer: (id: string) => void;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const duration = resolveTimelineDuration(section);
  const rows = trackRows(section);
  const playback = usePlaybackMode();
  const active = rows.find((row) => row.layer.id === activeLayerId)?.layer ?? null;
  const activeLocal = active ? layerSampleTime(section, active, playheadSec) : playheadSec;
  const playheadOnKey = (active?.motion?.keys || []).some(
    (key) => Math.abs(key.t - activeLocal) <= KEYFRAME_EPSILON_SEC
  );
  const leaving = active ? spanLeavingKey(active, activeLocal) : null;
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const playheadRef = useRef(playheadSec);
  const videoSrcs = useRef(new Map<string, string>());
  const ownedVideos = useRef(new Map<string, PenMediaController>());
  if (!playing) playheadRef.current = playheadSec;

  function videoController(layer: PenPageLayer, create: boolean): PenMediaController | null {
    if (layer.kind !== 'video') return null;
    const raw = layer.videoSrc || layer.backgroundVideo;
    if (!raw) return null;
    const key = `pen-layer:${layer.id}`;
    const live = peekPenMediaController(key);
    if (live) return live;
    const src = videoSrcs.current.get(layer.id);
    const held = ownedVideos.current.get(key);
    if (held && src && held.src === src) return held;
    if (!create || !src) return null;
    const created = acquirePenMediaController(key, src, { autoPlay: false });
    ownedVideos.current.set(key, created);
    return created;
  }

  function driveVideos(mode: 'play' | 'pause' | 'seek' | 'tick', at: number) {
    for (const { layer } of rows) {
      const ctrl = videoController(layer, mode === 'play');
      if (!ctrl) continue;
      if (mode === 'pause') {
        ctrl.pause();
        continue;
      }
      const rate = layer.playbackRate && layer.playbackRate > 0 ? layer.playbackRate : 1;
      ctrl.setPlaybackRate(rate);
      const mediaAt = Math.max(0, at - (layer.inSec || 0)) * rate;
      if (mode === 'tick') {
        placeVideo(ctrl.master, mediaAt);
        continue;
      }
      placeVideo(ctrl.master, mediaAt);
      if (mode === 'play') void ctrl.ensurePlaying();
    }
  }

  const driveRef = useRef(driveVideos);
  driveRef.current = driveVideos;

  useEffect(() => {
    return () => {
      for (const ctrl of ownedVideos.current.values()) ctrl.release();
      ownedVideos.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(duration, playheadRef.current + dt);
      playheadRef.current = next;
      onPlayhead(next);
      driveRef.current(next >= duration ? 'pause' : 'tick', next);
      if (next >= duration) {
        onPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, onPlayhead, onPlaying]);

  function seekRatio(ratio: number, rowDur: number) {
    const next = Math.min(rowDur, Math.max(0, ratio * rowDur));
    onPlaying(false);
    onPlayhead(next);
    driveVideos('seek', next);
    driveVideos('pause', next);
  }

  function onBarDown(e: ReactPointerEvent<HTMLDivElement>, rowDur: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    seekRatio(ratio, rowDur);
  }

  function toggleKey() {
    const layer = (section.layers || []).find((item) => item.id === activeLayerId);
    if (!layer || layer.kind === 'guide') return;
    const time = layerSampleTime(section, layer, playheadSec);
    onSectionChange(upsertLayer(section, toggleKeyframeAt(layer, time)));
  }

  function chooseEase(ease: PenKeyframeEase) {
    if (!active) return;
    onSectionChange(upsertLayer(section, setKeyframeEase(active, activeLocal, ease)));
  }

  function applyTransition(preset: PenTransitionPreset) {
    if (!activeLayerId || !partnerId) return;
    onSectionChange(applyTransitionPreset(section, activeLayerId, partnerId, preset, { atSec: playheadSec }));
  }

  function setGroupDuration(layer: PenPageLayer, value: number) {
    const durationSec = Number.isFinite(value) && value > 0 ? value : undefined;
    onSectionChange(upsertLayer(section, { ...layer, durationSec }));
  }

  function setTrim(layer: PenPageLayer, edge: 'in' | 'out', ratio: number) {
    const span = rowDuration(section, layer, duration);
    const at = Math.min(span, Math.max(0, ratio * span));
    if (edge === 'in') {
      const out = layer.outSec ?? span;
      onSectionChange(upsertLayer(section, { ...layer, inSec: Math.min(at, out) }));
      return;
    }
    const inn = layer.inSec ?? 0;
    onSectionChange(upsertLayer(section, { ...layer, outSec: Math.max(at, inn) }));
  }

  return (
    <div data-media-timeline className="shrink-0 border-t border-stone-200 bg-stone-50">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-white"
          onClick={() => {
            const next = !playing;
            const at = next && playheadSec >= duration ? 0 : playheadSec;
            if (at !== playheadSec) onPlayhead(at);
            onPlaying(next);
            driveVideos(next ? 'play' : 'pause', at);
          }}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <rect x="1" y="1" width="3.5" height="10" rx="0.5" fill="currentColor" />
              <rect x="7.5" y="1" width="3.5" height="10" rx="0.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 1.5v9l7.5-4.5L3 1.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="text-[13px] tabular-nums text-stone-700">
          {formatTime(playheadSec)} / {formatTime(duration)}
        </span>
        <button
          type="button"
          aria-label="Keyframe"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
            playheadOnKey ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-200'
          }`}
          onClick={toggleKey}
        >
          <DiamondMark filled={playheadOnKey} />
        </button>
        <div className="ml-auto inline-flex overflow-hidden rounded-full bg-white">
          {(['cut', 'crossfade', 'slide'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={!activeLayerId || !partnerId}
              className="px-2.5 py-1 text-[13px] capitalize text-stone-700 enabled:hover:bg-stone-100 disabled:text-stone-300"
              onClick={() => applyTransition(preset)}
            >
              {preset === 'crossfade' ? 'Fade' : preset}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-40 space-y-1 overflow-auto px-2 pb-2">
        {rows.map(({ layer, depth }) => {
          const rowDur = rowDuration(section, layer, duration);
          const local = layer.kind === 'group' ? wrapTime(playheadSec, rowDur) : layerSampleTime(section, layer, playheadSec);
          const posed = sampleLayerAt(layer, local);
          const head = (local / Math.max(rowDur, 0.01)) * 100;
          const inn = layer.inSec ?? 0;
          const out = layer.outSec ?? rowDur;
          const playbackSrc =
            playback === 'publish' ? publishPlaybackSrc(layer) : editorPlaybackSrc(layer);
          const keys = layer.motion?.keys || [];
          return (
            <div
              key={layer.id}
              data-track-row={layer.id}
              data-sampled-x={posed.x}
              className="space-y-1"
              style={{ paddingLeft: depth ? 12 : 0 }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`w-24 truncate text-left text-[13px] ${
                    layer.id === activeLayerId ? 'text-stone-900' : 'text-stone-500'
                  }`}
                  onClick={(e) => {
                    if (e.shiftKey) setPartnerId(layer.id);
                    else onSelectLayer(layer.id);
                  }}
                >
                  {defaultLayerName(layer, section.layers || [])}
                  {layer.id === partnerId ? ' with' : ''}
                </button>
                {layer.kind === 'group' && (
                  <label className="ml-auto flex items-center gap-1 text-[13px] text-stone-600">
                    Loop
                    <input
                      aria-label={`Loop ${layer.id}`}
                      className="w-14 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[13px] tabular-nums"
                      type="number"
                      min={0}
                      step={0.1}
                      value={layer.durationSec ?? ''}
                      onChange={(e) => setGroupDuration(layer, Number(e.target.value))}
                    />
                  </label>
                )}
              </div>
              <div
                className="relative h-7 cursor-pointer rounded-md bg-stone-200/80"
                onPointerDown={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
                  const edge = e.clientX - rect.left < 8 ? 'in' : rect.right - e.clientX < 8 ? 'out' : null;
                  if (edge && (layer.kind === 'image' || layer.kind === 'video')) {
                    setTrim(layer, edge, ratio);
                    return;
                  }
                  onBarDown(e, rowDur);
                }}
              >
                {(layer.kind === 'image' || layer.kind === 'video') && (
                  <div
                    className="absolute bottom-1 top-1 rounded-md bg-stone-500"
                    style={{
                      left: `${(inn / Math.max(rowDur, 0.01)) * 100}%`,
                      width: `${Math.max(4, ((out - inn) / Math.max(rowDur, 0.01)) * 100)}%`
                    }}
                  />
                )}
                {keys.map((key) => {
                  const selected = Math.abs(key.t - local) <= KEYFRAME_EPSILON_SEC;
                  return (
                    <button
                      key={`${layer.id}-${key.t}`}
                      type="button"
                      data-keyframe={`${layer.id}:${key.t}`}
                      aria-label={`Keyframe ${key.t}`}
                      className={`absolute top-1/2 z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${
                        selected ? 'text-stone-900' : 'text-amber-500'
                      }`}
                      style={{ left: `${(key.t / Math.max(rowDur, 0.01)) * 100}%` }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onPlaying(false);
                        onPlayhead(key.t);
                        driveVideos('seek', key.t);
                        driveVideos('pause', key.t);
                      }}
                    >
                      <DiamondMark filled={selected} />
                    </button>
                  );
                })}
                <div className="absolute bottom-0 top-0 w-px bg-stone-900" style={{ left: `${head}%` }} />
              </div>
              {layer.id === activeLayerId && leaving ? (
                <div className="flex gap-1 overflow-x-auto pb-1" data-keyframe-graphs>
                  {GRAPH_CURVES.map((curve) => {
                    const selected = (leaving.ease ?? 'linear') === curve.id;
                    return (
                      <button
                        key={curve.id}
                        type="button"
                        aria-pressed={selected}
                        className={`flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[11px] ${
                          selected ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-200'
                        }`}
                        onClick={() => chooseEase(curve.id)}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                          <path
                            d={curve.d}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {curve.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {(layer.kind === 'video' && playbackSrc) ? (
                <RememberVideoSrc
                  layerId={layer.id}
                  src={playbackSrc}
                  docId={docId}
                  session={session}
                  srcs={videoSrcs}
                />
              ) : null}
              {(layer.audioTracks || []).map((track) => {
                const offset = track.offsetSec || 0;
                return (
                  <div key={track.id} data-audio-lane={track.id} className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2 text-[13px] text-stone-500">
                      <span className="truncate">
                        {track.licensedDocId ? 'Licensed' : 'Audio'}
                      </span>
                      <button
                        type="button"
                        className="text-stone-400 hover:text-stone-900"
                        aria-label={`Remove ${track.id}`}
                        onClick={() => {
                          const next = (layer.audioTracks || []).filter((item) => item.id !== track.id);
                          onSectionChange(
                            upsertLayer(section, { ...layer, audioTracks: next.length ? next : undefined })
                          );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <div
                      className="relative h-7 cursor-pointer rounded-md bg-teal-100"
                      onPointerDown={(e) => onBarDown(e, rowDur)}
                    >
                      <div
                        className="absolute bottom-1 top-1 rounded-md bg-teal-500/80"
                        style={{
                          left: `${(offset / Math.max(rowDur, 0.01)) * 100}%`,
                          width: `${Math.max(8, 100 - (offset / Math.max(rowDur, 0.01)) * 100)}%`
                        }}
                      />
                      <div className="absolute bottom-0 top-0 w-px bg-stone-900" style={{ left: `${head}%` }} />
                    </div>
                    {track.src ? (
                      <AudioLane
                        src={track.src}
                        docId={docId}
                        session={session}
                        gain={track.gain ?? 100}
                        muted={Boolean(track.muted)}
                        offsetSec={offset}
                        time={playheadSec}
                        playing={playing}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
