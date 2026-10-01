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
  layerClockSpan,
  layerClips,
  layerMediaTime,
  layerSampleTime,
  deleteClipAt,
  detachClipAsLayer,
  joinLayerToTrack,
  publishPlaybackSrc,
  reorderTimelineLayer,
  resolveTimelineDuration,
  sampleLayerAt,
  setKeyframeEase,
  spanLeavingKey,
  splitLayerAt,
  trackJoinPoints,
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

function playheadBetweenKeys(layer: PenPageLayer, time: number): boolean {
  const sorted = [...(layer.motion?.keys || [])]
    .filter((key) => Number.isFinite(key.t))
    .sort((a, b) => a.t - b.t);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i]!.t;
    const end = sorted[i + 1]!.t;
    if (time > start + KEYFRAME_EPSILON_SEC && time < end - KEYFRAME_EPSILON_SEC) return true;
  }
  return false;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Mute column (w-6) plus the row gap, so the playhead shares the lane's time axis. */
const TRACK_GUTTER = '1.75rem';

function trackLeft(time: number, span: number): string {
  const ratio = time / Math.max(span, 0.01);
  return `calc(${TRACK_GUTTER} + (100% - ${TRACK_GUTTER}) * ${ratio})`;
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

/** A group is one track. A layer that is not in a group is its own track. Members stay on the group row. */
function widgetTracks(section: PenSectionContent): Array<{
  trackId: string;
  depth: number;
  layers: PenPageLayer[];
}> {
  const layers = (section.layers || []).filter((layer) => layer.kind !== 'guide');
  const top = layers
    .filter((layer) => !layer.parentGroupId)
    .sort((a, b) => a.zIndex - b.zIndex);
  return top.map((layer) => {
    if (layer.kind !== 'group') {
      return { trackId: layer.id, depth: 0, layers: [layer] };
    }
    const kids = layers
      .filter((item) => item.parentGroupId === layer.id)
      .sort((a, b) => a.zIndex - b.zIndex);
    return { trackId: layer.id, depth: 0, layers: [layer, ...kids] };
  });
}

function groupTracks(rows: Array<{ layer: PenPageLayer; depth: number }>): Array<{
  trackId: string;
  depth: number;
  layers: PenPageLayer[];
}> {
  const order: string[] = [];
  const map = new Map<string, { depth: number; layers: PenPageLayer[] }>();
  for (const row of rows) {
    const trackId = row.layer.timelineTrackId || row.layer.id;
    const hit = map.get(trackId);
    if (!hit) {
      order.push(trackId);
      map.set(trackId, { depth: row.depth, layers: [row.layer] });
    } else hit.layers.push(row.layer);
  }
  return order.map((trackId) => ({ trackId, depth: map.get(trackId)!.depth, layers: map.get(trackId)!.layers }));
}

function formatMark(sec: number, minor: number): string {
  if (minor >= 1) return formatTime(sec);
  if (minor < 0.2) {
    const frames = Math.round(sec * 30);
    const whole = Math.floor(frames / 30);
    const frame = frames % 30;
    return `${whole}:${String(frame).padStart(2, '0')}`;
  }
  return `${Math.round(sec * 10) / 10}s`;
}

function timelineMarks(span: number, zoom: number): Array<{ t: number; major: boolean; label: string }> {
  const frame = 1 / 30;
  const pxPerSec = (Math.max(zoom, 1) * 480) / Math.max(span, 0.01);
  const ladder = [frame, frame * 2, frame * 5, 0.5, 1, 2, 5, 10, 30];
  let minor = 30;
  for (const step of ladder) {
    if (pxPerSec * step >= 8) {
      minor = step;
      break;
    }
  }
  const majorEvery = minor < 0.2 ? 15 : minor < 1 ? Math.round(1 / minor) : 1;
  const marks: Array<{ t: number; major: boolean; label: string }> = [];
  const limit = Math.min(480, Math.ceil(span / minor) + 1);
  for (let i = 0; i < limit; i += 1) {
    const t = Math.round(i * minor * 1000) / 1000;
    if (t > span + 0.001) break;
    const major = i % majorEvery === 0;
    marks.push({ t, major, label: major ? formatMark(t, minor) : '' });
  }
  return marks;
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M2.5 6.2h2.2L8 3.6v8.8L4.7 9.8H2.5z" fill="currentColor" />
      {muted ? (
        <path d="M10.2 6.2 13.6 9.6M13.6 6.2 10.2 9.6" stroke="currentColor" strokeWidth="1.3" />
      ) : (
        <path
          d="M10.2 6.1a2.6 2.6 0 0 1 0 3.8M11.8 4.6a4.6 4.6 0 0 1 0 6.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}

const TRANSITION_PRESETS: Array<{ id: PenTransitionPreset; label: string }> = [
  { id: 'crossfade', label: 'Fade' },
  { id: 'slide', label: 'Slide' },
  { id: 'push', label: 'Push' },
  { id: 'dip', label: 'Dip' },
  { id: 'zoom', label: 'Zoom' }
];

const decorCache = new Map<string, { frames: string[]; wave: number[] }>();

function seekVideo(master: HTMLVideoElement, at: number): Promise<void> {
  return new Promise((resolve) => {
    const limit = Number.isFinite(master.duration) ? master.duration : at;
    const target = Math.min(Math.max(0, at), limit);
    if (Math.abs((master.currentTime || 0) - target) < 0.05) {
      resolve();
      return;
    }
    const done = () => {
      master.removeEventListener('seeked', done);
      resolve();
    };
    master.addEventListener('seeked', done);
    try {
      master.currentTime = target;
    } catch {
      master.removeEventListener('seeked', done);
      resolve();
      return;
    }
    window.setTimeout(done, 400);
  });
}

async function readWave(url: string): Promise<number[]> {
  try {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    const audio = await context.decodeAudioData(bytes.slice(0));
    await context.close();
    const channel = audio.getChannelData(0);
    const bars = 48;
    const size = Math.max(1, Math.floor(channel.length / bars));
    const wave: number[] = [];
    for (let i = 0; i < bars; i += 1) {
      let peak = 0;
      for (let j = 0; j < size; j += 1) peak = Math.max(peak, Math.abs(channel[i * size + j] || 0));
      wave.push(peak);
    }
    return wave;
  } catch {
    return [];
  }
}

async function readFrames(master: HTMLVideoElement): Promise<string[]> {
  const dur = master.duration;
  if (!dur || !Number.isFinite(dur) || dur < 0.05) return [];
  const saved = master.currentTime || 0;
  const count = Math.min(8, Math.max(1, Math.round(dur)));
  const canvas = document.createElement('canvas');
  const sourceWidth = master.videoWidth || 16;
  const sourceHeight = master.videoHeight || 9;
  canvas.height = 64;
  canvas.width = Math.max(32, Math.round(64 * (sourceWidth / sourceHeight)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const frames: string[] = [];
  try {
    for (let i = 0; i < count; i += 1) {
      await seekVideo(master, ((i + 0.5) / count) * Math.max(0.05, dur - 0.05));
      ctx.drawImage(master, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.82));
    }
  } catch {
    /* keep the frames already drawn */
  }
  await seekVideo(master, saved);
  return frames;
}

function WaveLine({ values }: { values: number[] }) {
  if (!values.length) return null;
  const d = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 70 - value * 55;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      data-clip-wave
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full"
      aria-hidden
    >
      <path d={d} fill="none" stroke="#2563eb" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TransitionSketch({ preset }: { preset: PenTransitionPreset }) {
  const slide = preset === 'slide' || preset === 'push';
  return (
    <span className="relative block h-8 w-10 overflow-hidden bg-white">
      <span
        className="absolute inset-y-1 left-1 w-4 bg-blue-700"
        style={{
          opacity: preset === 'dip' ? 0.2 : 0.55,
          transform: slide ? 'translateX(-6px)' : undefined
        }}
      />
      <span
        className="absolute inset-y-1 right-1 w-4 bg-blue-300"
        style={{ transform: preset === 'zoom' ? 'scale(0.7)' : slide ? 'translateX(6px)' : undefined }}
      />
    </span>
  );
}

function ClipDecor({
  src,
  still,
  docId,
  session,
  playing,
  onReady
}: {
  src?: string;
  still?: boolean;
  docId?: string;
  session?: PenSession | null;
  playing: boolean;
  onReady: (resolved: string) => HTMLVideoElement | null;
}) {
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [decor, setDecor] = useState<{ frames: string[]; wave: number[] } | null>(null);
  useEffect(() => {
    if (!resolved || playing || still) return;
    const cached = decorCache.get(resolved);
    if (cached) {
      setDecor(cached);
      return;
    }
    let cancel = false;
    const master = readyRef.current(resolved);
    void (async () => {
      const [wave, frames] = await Promise.all([
        readWave(resolved),
        master ? readFrames(master) : Promise.resolve([])
      ]);
      if (cancel) return;
      const next = { frames, wave };
      decorCache.set(resolved, next);
      setDecor(next);
    })();
    return () => {
      cancel = true;
    };
  }, [resolved, playing, still]);
  if (still && resolved) {
    return (
      <img
        data-clip-frames
        src={resolved}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  if (!decor) return null;
  return (
    <>
      {decor.frames.length ? (
        <span data-clip-frames className="pointer-events-none absolute inset-0 flex overflow-hidden">
          {decor.frames.map((frame, index) => (
            <img
              key={index}
              src={frame}
              alt=""
              className="h-full min-w-0 flex-1 object-cover"
              draggable={false}
            />
          ))}
        </span>
      ) : null}
      <WaveLine values={decor.wave} />
    </>
  );
}

function LaneWave({
  src,
  docId,
  session
}: {
  src?: string;
  docId?: string;
  session?: PenSession | null;
}) {
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  const [wave, setWave] = useState<number[]>([]);
  useEffect(() => {
    if (!resolved) return;
    const cached = decorCache.get(resolved);
    if (cached?.wave.length) {
      setWave(cached.wave);
      return;
    }
    let cancel = false;
    void readWave(resolved).then((values) => {
      if (cancel) return;
      const prev = decorCache.get(resolved) || { frames: [], wave: [] };
      decorCache.set(resolved, { ...prev, wave: values });
      setWave(values);
    });
    return () => {
      cancel = true;
    };
  }, [resolved]);
  return <WaveLine values={wave} />;
}

function Magnify({ plus }: { plus: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7h4" stroke="currentColor" strokeWidth="1.4" />
      {plus ? <path d="M7 5v4" stroke="currentColor" strokeWidth="1.4" /> : null}
    </svg>
  );
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

function placeVideo(master: HTMLVideoElement, at: number, force = false) {
  const dur = master.duration;
  if (!dur || !Number.isFinite(dur)) return;
  const target = Math.min(dur, Math.max(0, at));
  if (!force && Math.abs((master.currentTime || 0) - target) <= 0.35) return;
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
  onSectionChange,
  onReverse,
  mode = 'media'
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
  onReverse?: () => void;
  /** Widget rows are one group or one ungrouped layer. Media keeps clip joins. */
  mode?: 'media' | 'widget';
}) {
  const widget = mode === 'widget';
  const duration = resolveTimelineDuration(section);
  const rows = trackRows(section);
  const groups = widget ? widgetTracks(section) : groupTracks(rows);
  const playback = usePlaybackMode();
  const active =
    (section.layers || []).find((layer) => layer.id === activeLayerId && layer.kind !== 'guide') ??
    null;
  const activeLocal = active ? layerSampleTime(section, active, playheadSec) : playheadSec;
  const playheadOnKey = (active?.motion?.keys || []).some(
    (key) => Math.abs(key.t - activeLocal) <= KEYFRAME_EPSILON_SEC
  );
  const graphsReady = Boolean(active && playheadBetweenKeys(active, activeLocal));
  const leaving = active ? spanLeavingKey(active, activeLocal) : null;
  const [zoom, setZoom] = useState(1);
  const [graphsOpen, setGraphsOpen] = useState(false);
  const graphsRef = useRef<HTMLDivElement>(null);
  const [joinMenu, setJoinMenu] = useState<null | {
    trackId: string;
    atSec: number;
    fromId: string;
    toId: string;
  }>(null);
  const playheadRef = useRef(playheadSec);
  const playingRef = useRef(playing);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!graphsReady) setGraphsOpen(false);
  }, [graphsReady]);
  useEffect(() => {
    if (!graphsOpen) return;
    function onDoc(event: MouseEvent) {
      if (graphsRef.current?.contains(event.target as Node)) return;
      setGraphsOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [graphsOpen]);
  useEffect(() => {
    if (!joinMenu) return;
    function onDoc(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !rootRef.current?.contains(target)) {
        setJoinMenu(null);
        return;
      }
      if (target instanceof Element && target.closest('[data-transition-join], [data-transition-menu]')) {
        return;
      }
      setJoinMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [joinMenu]);
  const videoSrcs = useRef(new Map<string, string>());
  const ownedVideos = useRef(new Map<string, PenMediaController>());
  playingRef.current = playing;
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
      const mediaAt = layerMediaTime(layer, at, rate, layerClockSpan(section, layer));
      if (layer.mediaReversed) {
        ctrl.pause();
        placeVideo(ctrl.master, mediaAt, true);
        continue;
      }
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
      if (!playingRef.current) return;
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(duration, playheadRef.current + dt);
      playheadRef.current = next;
      onPlayhead(next);
      driveRef.current(next >= duration ? 'pause' : 'tick', next);
      if (next >= duration) {
        playingRef.current = false;
        onPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, onPlayhead, onPlaying]);

  function seekTo(time: number) {
    const next = Math.min(duration, Math.max(0, time));
    playingRef.current = false;
    playheadRef.current = next;
    onPlaying(false);
    onPlayhead(next);
    driveVideos('seek', next);
    driveVideos('pause', next);
  }

  function seekClientX(clientX: number, scale: HTMLElement) {
    const lane = scale.querySelector('[data-clip-lane]');
    const rect = lane instanceof HTMLElement ? lane.getBoundingClientRect() : scale.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    seekTo(Math.min(1, Math.max(0, ratio)) * duration);
  }

  function beginScrub(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const scale = event.currentTarget.closest('[data-timeline-scale]');
    if (!(scale instanceof HTMLElement)) return;
    seekClientX(event.clientX, scale);
    const move = (ev: PointerEvent) => seekClientX(ev.clientX, scale);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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

  function setGroupDuration(layer: PenPageLayer, value: number) {
    const durationSec = Number.isFinite(value) && value > 0 ? value : undefined;
    onSectionChange(upsertLayer(section, { ...layer, durationSec }));
  }

  function setTrim(layer: PenPageLayer, edge: 'in' | 'out', ratio: number, clipId?: string) {
    const span = layerClockSpan(section, layer);
    const minGap = 0.1;
    const clips = layer.clips?.length ? layer.clips : null;
    if (clips && clipId) {
      const clip = clips.find((item) => item.id === clipId);
      if (!clip) return;
      const nextClips =
        edge === 'in'
          ? clips.map((item) => {
              if (item.id !== clip.id) return item;
              const at = Math.min(item.outSec - minGap, Math.max(0, ratio * span));
              const source = Math.max(0, (item.sourceInSec ?? 0) + (at - item.inSec));
              return { ...item, inSec: at, sourceInSec: source > 0 ? source : undefined };
            })
          : clips.map((item) => {
              if (item.id !== clip.id) return item;
              const at = Math.max(item.inSec + minGap, Math.min(span, Math.max(0, ratio * span)));
              return { ...item, outSec: at };
            });
      onSectionChange(
        upsertLayer(section, {
          ...layer,
          clips: nextClips,
          inSec: Math.min(...nextClips.map((item) => item.inSec)),
          outSec: Math.max(...nextClips.map((item) => item.outSec))
        })
      );
      return;
    }
    const inn = layer.inSec ?? 0;
    const out = layer.outSec ?? span;
    if (edge === 'in') {
      const at = Math.min(out - minGap, Math.max(0, ratio * span));
      const source = Math.max(0, (layer.sourceInSec ?? 0) + (at - inn));
      onSectionChange(
        upsertLayer(section, {
          ...layer,
          inSec: at,
          sourceInSec: source > 0 ? source : undefined
        })
      );
      return;
    }
    const at = Math.max(inn + minGap, Math.min(span, Math.max(0, ratio * span)));
    onSectionChange(upsertLayer(section, { ...layer, outSec: at }));
  }

  function beginTrim(
    event: ReactPointerEvent<HTMLButtonElement>,
    layer: PenPageLayer,
    edge: 'in' | 'out',
    clipId?: string
  ) {
    event.stopPropagation();
    event.preventDefault();
    const lane = event.currentTarget.closest('[data-clip-lane]');
    if (!lane) return;
    const move = (ev: PointerEvent) => {
      const rect = lane.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / Math.max(1, rect.width);
      setTrim(layer, edge, ratio, clipId);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const cutSpan = active ? layerClockSpan(section, active) : duration;
  const cutClips = active ? layerClips(active, cutSpan) : [];
  const canCut = Boolean(
    active &&
      active.kind !== 'guide' &&
      active.kind !== 'group' &&
      cutClips.some((clip) => playheadSec > clip.inSec + 0.05 && playheadSec < clip.outSec - 0.05)
  );

  function cutClip() {
    if (!activeLayerId || !canCut) return;
    const next = splitLayerAt(section, activeLayerId, playheadSec);
    if (next === section) return;
    onSectionChange(next);
  }

  function deleteClip() {
    if (!activeLayerId) return;
    onSectionChange(deleteClipAt(section, activeLayerId, playheadSec));
  }

  function beginMove(
    event: ReactPointerEvent<HTMLElement>,
    layer: PenPageLayer,
    clipId?: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) moved = true;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        onSelectLayer(layer.id);
        return;
      }
      const root = rootRef.current;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track-row]');
      const trackId = hit?.getAttribute('data-track-row');
      const own = layer.timelineTrackId || layer.id;
      const rows = [...(root?.querySelectorAll('[data-track-row]') || [])];
      const ids = rows.map((row) => row.getAttribute('data-track-row') || '');
      const y =
        hit instanceof HTMLElement
          ? (ev.clientY - hit.getBoundingClientRect().top) / Math.max(1, hit.getBoundingClientRect().height)
          : null;
      const offRow = y == null || y <= 0.28 || y >= 0.72;
      const piece =
        clipId && (layer.clips?.length || 0) > 1
          ? detachClipAsLayer(section, layer.id, clipId)
          : null;
      if (piece && offRow) {
        let next = piece.section;
        if (!hit || !trackId || !(hit instanceof HTMLElement)) {
          next = reorderTimelineLayer(next, piece.layerId, null);
        } else {
          const index = ids.indexOf(trackId);
          const before = (y ?? 1) < 0.5 ? trackId : ids[index + 1] || null;
          next = reorderTimelineLayer(next, piece.layerId, before);
        }
        onSectionChange(next);
        onSelectLayer(piece.layerId);
        return;
      }
      if (!hit || !trackId || !(hit instanceof HTMLElement)) {
        onSectionChange(reorderTimelineLayer(section, layer.id, null));
        return;
      }
      if (trackId !== own && y != null && y > 0.28 && y < 0.72) {
        onSectionChange(joinLayerToTrack(section, layer.id, trackId));
        return;
      }
      const index = ids.indexOf(trackId);
      const before = (y ?? 0) < 0.5 ? trackId : ids[index + 1] || null;
      if (before === own) return;
      onSectionChange(reorderTimelineLayer(section, layer.id, before));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function assignJoin(preset: PenTransitionPreset) {
    if (!joinMenu) return;
    onSectionChange(
      applyTransitionPreset(section, joinMenu.fromId, joinMenu.toId, preset, {
        atSec: joinMenu.atSec,
        durationSec: 0.5
      })
    );
    const start = Math.max(0, joinMenu.atSec - 0.05);
    playheadRef.current = start;
    playingRef.current = true;
    onPlayhead(start);
    onPlaying(true);
    driveVideos('play', start);
    setJoinMenu(null);
  }

  function toggleMute(layer: PenPageLayer) {
    if (layer.kind === 'video') {
      const mediaMuted = layer.mediaMuted === false ? true : false;
      peekPenMediaController(`pen-layer:${layer.id}`)?.setClipAudio(
        (layer.mediaGain ?? 100) / 100,
        mediaMuted === false
      );
      onSectionChange(upsertLayer(section, { ...layer, mediaMuted }));
      return;
    }
    onSectionChange(
      upsertLayer(section, { ...layer, visible: layer.visible === false ? true : false })
    );
  }

  return (
    <div
      ref={rootRef}
      data-media-timeline
      className="min-w-0 shrink-0 select-none border-t border-stone-200 bg-stone-50"
    >
      <div data-timeline-toolbar className="flex flex-nowrap items-center gap-1 overflow-x-auto px-2 py-0.5">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-600"
          onClick={() => {
            const next = !playing;
            const at = next && playheadSec >= duration - 0.05 ? 0 : playheadSec;
            playheadRef.current = at;
            playingRef.current = next;
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
        <span className="shrink-0 text-[13px] tabular-nums text-stone-700">
          {formatTime(playheadSec)} / {formatTime(duration)}
        </span>
        {widget ? null : (
          <button
            type="button"
            aria-label="Split clip"
            title="Split clip"
            disabled={!canCut}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${canCut ? 'text-stone-700' : 'text-stone-300'}`}
            onClick={cutClip}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="4.2" cy="4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="4.2" cy="12" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M5.4 5.2 13 12.2M5.4 10.8 13 3.8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        )}
        <button
          type="button"
          aria-label="Keyframe"
          title="Keyframe"
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${
            playheadOnKey ? 'font-semibold text-stone-800' : 'text-stone-400'
          }`}
          onClick={toggleKey}
        >
          <DiamondMark filled={playheadOnKey} />
        </button>
        <div ref={graphsRef} className="relative">
          <button
            type="button"
            aria-label="Graph"
            title="Graph"
            aria-expanded={graphsOpen}
            disabled={!graphsReady}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${
              graphsReady ? 'text-stone-700' : 'text-stone-300'
            }`}
            onClick={() => {
              if (!graphsReady) return;
              setGraphsOpen((open) => !open);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 14 C6 14 10 2 14 2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          {graphsOpen && leaving ? (
            <div
              data-keyframe-graphs
              className="absolute bottom-full left-0 z-30 mb-1 flex max-w-[16rem] gap-1 overflow-x-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg"
            >
              {GRAPH_CURVES.map((curve) => {
                const selected = (leaving.ease ?? 'linear') === curve.id;
                return (
                  <button
                    key={curve.id}
                    type="button"
                    aria-pressed={selected}
                    className={`flex w-14 shrink-0 flex-col items-center gap-0.5 px-1 py-1 text-[11px] ${
                      selected ? 'font-semibold text-stone-700' : 'text-stone-400'
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
        </div>
        <div className="flex items-center gap-1 text-stone-500">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center"
            onClick={() => setZoom((value) => Math.max(1, Math.round((value - 0.5) * 10) / 10))}
          >
            <Magnify plus={false} />
          </button>
          <input
            aria-label="Zoom"
            title="Zoom"
            type="range"
            min={1}
            max={Math.max(8, Math.ceil(duration / 2))}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 w-14 shrink-0 cursor-pointer appearance-none bg-stone-300 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-stone-500"
          />
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center"
            onClick={() =>
              setZoom((value) =>
                Math.min(Math.max(8, Math.ceil(duration / 2)), Math.round((value + 0.5) * 10) / 10)
              )
            }
          >
            <Magnify plus />
          </button>
        </div>
        <div className="ml-auto inline-flex shrink-0 items-center gap-1 text-stone-500">
          {widget ? null : (
            <>
              <button
                type="button"
                aria-label="Mirror"
                title="Mirror"
                aria-pressed={Boolean(active?.mediaMirror)}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${active?.mediaMirror ? 'text-stone-800' : ''}`}
                onClick={() => {
                  if (!active) return;
                  onSectionChange(upsertLayer(section, { ...active, mediaMirror: !active.mediaMirror }));
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M8 1.5v13" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.6 4.2 2.2 8l4.4 3.8z" fill="currentColor" />
                  <path d="M9.4 4.2 13.8 8l-4.4 3.8z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Reverse"
                title="Reverse"
                aria-pressed={Boolean(active?.mediaReversed)}
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${active?.mediaReversed ? 'text-stone-800' : ''}`}
                onClick={() => onReverse?.()}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M12.5 2.5 3.5 8l9 5.5V2.5z" fill="currentColor" />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="Delete clip"
            title="Delete clip"
            disabled={!activeLayerId}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${
              activeLayerId ? 'text-stone-700' : 'text-stone-300'
            }`}
            onClick={deleteClip}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M3 4h10M6 4V3h4v1M5 4l.6 9h4.8L11 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </div>
      </div>
      <div className="max-h-64 min-w-0 overflow-x-auto overflow-y-auto px-2 pb-2">
        <div
          data-timeline-scale
          className="relative"
          style={{ width: `${Math.max(duration, 0.01) * 96 * zoom}px`, minWidth: '100%' }}
        >
          <div className="relative mb-1 h-6 cursor-ew-resize" onPointerDown={beginScrub}>
            {timelineMarks(duration, zoom).map((mark) => (
              <span
                key={mark.t}
                data-tick={mark.major ? 'major' : 'minor'}
                className="absolute top-0"
                style={{ left: trackLeft(mark.t, duration) }}
              >
                <span className={`block w-px ${mark.major ? 'h-2.5 bg-stone-500' : 'h-1.5 bg-stone-300'}`} />
                {mark.major ? (
                  <span className="absolute top-2.5 -translate-x-1/2 text-[10px] tabular-nums text-stone-400">
                    {mark.label}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <div className="space-y-1">
        {groups.map(({ trackId, depth, layers: trackLayers }) => {
          const groupLayer = trackLayers.find((item) => item.kind === 'group');
          const layer = trackLayers.find((item) => item.id === activeLayerId) ?? trackLayers[0]!;
          const rowDur = layerClockSpan(section, layer);
          const clock = widget ? duration : rowDur;
          const local = layer.kind === 'group' ? wrapTime(playheadSec, rowDur) : layerSampleTime(section, layer, playheadSec);
          const posed = sampleLayerAt(layer, local);
          const clips = widget
            ? []
            : trackLayers.flatMap((item) =>
                item.kind === 'group' ? [] : layerClips(item, rowDur).map((clip) => ({ clip, owner: item }))
              );
          const keys = trackLayers.flatMap((item) =>
            (item.motion?.keys || []).map((key) => ({ key, ownerId: item.id }))
          );
          const host = groupLayer ?? layer;
          return (
            <div
              key={trackId}
              data-track-row={trackId}
              data-sampled-x={posed.x}
              className="space-y-1"
              style={{ paddingLeft: depth ? 12 : 0 }}
            >
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  aria-label={`Mute ${layer.id}`}
                  title={
                    (layer.kind === 'video' ? layer.mediaMuted !== false : layer.visible === false)
                      ? 'Unmute'
                      : 'Mute'
                  }
                  aria-pressed={layer.kind === 'video' ? layer.mediaMuted !== false : layer.visible === false}
                  className={`inline-flex w-6 shrink-0 items-center justify-center self-center ${
                    (layer.kind === 'video' ? layer.mediaMuted !== false : layer.visible === false)
                      ? 'text-stone-700'
                      : 'text-stone-400'
                  }`}
                  onClick={() => toggleMute(layer)}
                >
                  <SpeakerIcon
                    muted={layer.kind === 'video' ? layer.mediaMuted !== false : layer.visible === false}
                  />
                </button>
                <div
                  data-clip-lane
                  className="relative h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-blue-600 bg-white"
                  onPointerDown={beginScrub}
                >
                {widget ? (
                  <span
                    data-clip-title={defaultLayerName(host, section.layers || [])}
                    className="pointer-events-none absolute left-1 top-0.5 z-[1] max-w-[90%] truncate text-[11px] text-stone-500"
                  >
                    {defaultLayerName(host, section.layers || [])}
                  </span>
                ) : null}
                {clips.map(({ clip, owner }) => {
                  const playbackSrc =
                    owner.kind === 'video'
                      ? playback === 'publish'
                        ? publishPlaybackSrc(owner)
                        : editorPlaybackSrc(owner)
                      : owner.kind === 'image'
                        ? owner.imageSrc
                        : undefined;
                  const name = defaultLayerName(owner, section.layers || []);
                  return (
                  <div
                    key={`${owner.id}-${clip.id}`}
                    className="absolute bottom-0 top-0 overflow-hidden border border-blue-600 bg-white"
                    style={{
                      left: `${(clip.inSec / Math.max(rowDur, 0.01)) * 100}%`,
                      width: `${Math.max(4, ((clip.outSec - clip.inSec) / Math.max(rowDur, 0.01)) * 100)}%`
                    }}
                    onPointerDown={(e) =>
                      beginMove(e, owner, (owner.clips?.length || 0) > 1 ? clip.id : undefined)
                    }
                  >
                    <ClipDecor
                      src={playbackSrc}
                      still={owner.kind === 'image'}
                      docId={docId}
                      session={session}
                      playing={playing}
                      onReady={(resolved) => {
                        videoSrcs.current.set(owner.id, resolved);
                        return videoController(owner, true)?.master ?? null;
                      }}
                    />
                    <span
                      data-clip-title={name}
                      className={`pointer-events-none absolute left-3 top-0.5 z-[1] max-w-[90%] truncate text-[11px] ${
                        owner.id === activeLayerId ? 'font-semibold text-stone-800' : 'text-stone-500'
                      }`}
                    >
                      {name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Trim start ${clip.id}`}
                      className="absolute bottom-0 left-0 top-0 w-1.5 cursor-ew-resize bg-blue-600"
                      onPointerDown={(e) => beginTrim(e, owner, 'in', clip.id)}
                    />
                    <button
                      type="button"
                      aria-label={`Trim end ${clip.id}`}
                      className="absolute bottom-0 right-0 top-0 w-1.5 cursor-ew-resize bg-blue-600"
                      onPointerDown={(e) => beginTrim(e, owner, 'out', clip.id)}
                    />
                  </div>
                  );
                })}
                {trackJoinPoints(section)
                  .filter((point) => point.trackId === trackId)
                  .map((point) => (
                    <button
                      key={`${point.fromId}-${point.toId}`}
                      type="button"
                      data-transition-join=""
                      aria-label="Transition"
                      title="Transition"
                      className="absolute top-1/2 z-10 h-5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-blue-600 bg-white"
                      style={{
                        left: `${(point.atSec / Math.max(rowDur, 0.01)) * 100}%`,
                        width: `${Math.max(2, (point.durationSec / Math.max(rowDur, 0.01)) * 100)}%`
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setJoinMenu(point);
                      }}
                    />
                  ))}
                {joinMenu?.trackId === trackId ? (
                  <div
                    data-transition-menu=""
                    className="absolute bottom-full z-30 mb-1 flex -translate-x-1/2 gap-1 rounded-md border border-stone-200 bg-white p-1 shadow-lg"
                    style={{ left: `${(joinMenu.atSec / Math.max(rowDur, 0.01)) * 100}%` }}
                  >
                    {TRANSITION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="flex w-12 flex-col items-center gap-0.5 text-[10px] text-stone-600"
                        onClick={() => assignJoin(preset.id)}
                      >
                        <TransitionSketch preset={preset.id} />
                        {preset.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {keys.map(({ key, ownerId }) => {
                  const selected = Math.abs(key.t - local) <= KEYFRAME_EPSILON_SEC;
                  return (
                    <button
                      key={`${ownerId}-${key.t}`}
                      type="button"
                      data-keyframe={`${ownerId}:${key.t}`}
                      aria-label={`Keyframe ${key.t}`}
                      className={`absolute top-1/2 z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${
                        selected ? 'text-stone-700' : 'text-stone-400'
                      }`}
                      style={{ left: `${(key.t / Math.max(clock, 0.01)) * 100}%` }}
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
                </div>
              </div>
              {groupLayer ? (
                <label className="flex items-center gap-1 text-[13px] text-stone-600">
                  Loop
                  <input
                    aria-label={`Loop ${groupLayer.id}`}
                    className="w-14 rounded-md border border-stone-200 bg-white px-1.5 py-0.5 text-[13px] tabular-nums"
                    type="number"
                    min={0}
                    step={0.1}
                    value={groupLayer.durationSec ?? ''}
                    onChange={(e) => setGroupDuration(groupLayer, Number(e.target.value))}
                  />
                </label>
              ) : null}
              {trackLayers.map((item) => {
                const playbackSrc = playback === 'publish' ? publishPlaybackSrc(item) : editorPlaybackSrc(item);
                if (item.kind !== 'video' || !playbackSrc) return null;
                return (
                  <RememberVideoSrc
                    key={item.id}
                    layerId={item.id}
                    src={playbackSrc}
                    docId={docId}
                    session={session}
                    srcs={videoSrcs}
                  />
                );
              })}
              {trackLayers.flatMap((owner) => (owner.audioTracks || []).map((track) => {
                const offset = track.offsetSec || 0;
                return (
                  <div key={track.id} data-audio-lane={track.id} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      className={`inline-flex w-6 shrink-0 items-center justify-center self-center ${track.muted ? 'text-stone-700' : 'text-stone-400'}`}
                      aria-label={`Mute ${track.id}`}
                      title={track.muted ? 'Unmute' : 'Mute'}
                      aria-pressed={Boolean(track.muted)}
                      onClick={() => {
                        const next = (owner.audioTracks || []).map((lane) =>
                          lane.id === track.id ? { ...lane, muted: !lane.muted } : lane
                        );
                        onSectionChange(upsertLayer(section, { ...owner, audioTracks: next }));
                      }}
                    >
                      <SpeakerIcon muted={Boolean(track.muted)} />
                    </button>
                    <div
                      className="relative h-5 min-w-0 flex-1 cursor-pointer overflow-hidden rounded-md border border-blue-600 bg-white"
                      onPointerDown={beginScrub}
                    >
                      <div
                        className="absolute bottom-0 top-0 bg-white"
                        style={{
                          left: `${(offset / Math.max(rowDur, 0.01)) * 100}%`,
                          width: `${Math.max(8, 100 - (offset / Math.max(rowDur, 0.01)) * 100)}%`
                        }}
                      >
                        <LaneWave src={track.src} docId={docId} session={session} />
                        <span className="pointer-events-none absolute left-1 top-0.5 truncate text-[11px] text-stone-500">
                          {track.licensedDocId ? 'Licensed' : 'Audio'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="absolute right-1 top-0.5 text-[11px] text-stone-400"
                        aria-label={`Remove ${track.id}`}
                        title="Remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          const next = (owner.audioTracks || []).filter((lane) => lane.id !== track.id);
                          onSectionChange(
                            upsertLayer(section, { ...owner, audioTracks: next.length ? next : undefined })
                          );
                        }}
                      >
                        Remove
                      </button>
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
              }))}
            </div>
          );
        })}
          </div>
          <div
            data-timeline-playhead
            title="Playhead"
            className="absolute bottom-0 top-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize"
            style={{ left: trackLeft(playheadSec, duration) }}
            onPointerDown={beginScrub}
          >
            <div className="pointer-events-none mx-auto h-full w-1 bg-stone-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
