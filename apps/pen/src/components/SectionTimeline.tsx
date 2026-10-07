/**
 * Section clock. Each non-guide layer is a track. Keys live on the layer.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import {
  acquirePenMediaController,
  peekPenMediaController,
  type PenMediaController
} from '@par-noir/feed-tile';
import {
  MOTION_PRESET_SEC,
  readLayerAnimation,
  setAnimationDuration,
  setLayerAnimation,
  applyTransitionPreset,
  clearClipTransition,
  closeTrackGaps,
  applyVideoFileDuration,
  defaultLayerName,
  docToPlainText,
  editorPlaybackSrc,
  getTextLayerDoc,
  KEYFRAME_EPSILON_SEC,
  layerClockSpan,
  layerClips,
  layerMediaTime,
  layerSampleTime,
  deleteClipAt,
  moveClipBy,
  moveClipToTrack,
  publishPlaybackSrc,
  reorderTimelineLayer,
  raiseTimelineTo,
  resolveTimelineDuration,
  sampleLayerAt,
  sanitizeWidgetMarkup,
  setKeyframeEase,
  spanLeavingKey,
  splitLayerAt,
  trackJoinPoints,
  type TrackJoinPoint,
  timeLayerCaption,
  toggleKeyframeAt,
  upsertLayer,
  wrapTime,
  type PenAnimationSlot,
  type PenAnimationStyle,
  type PenKeyframeEase,
  type PenPageLayer,
  type PenSectionContent,
  type PenTransitionPreset
} from '@par-noir/pen-protocol';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { usePlaybackMode } from '../hooks/usePlaybackMode';
import type { PenSession } from '../services/penSession';
import lookSwatch from '../assets/look-apple.jpg';

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

/** Eye, mute, and grabber (each w-6) plus the row gaps, so the playhead shares the lane's time axis. */
const TRACK_GUTTER = '5.25rem';

function trackLeft(time: number, span: number): string {
  const ratio = time / Math.max(span, 0.01);
  return `calc(${TRACK_GUTTER} + (100% - ${TRACK_GUTTER}) * ${ratio})`;
}

type TimelineTrack = {
  trackId: string;
  layers: PenPageLayer[];
  compound: boolean;
};

/**
 * Front-first tracks. On the page, a group is one compound track.
 * Inside a group, that group's children are the tracks.
 */
function timelineTracks(section: PenSectionContent, scopeGroupId: string | null): TimelineTrack[] {
  const layers = (section.layers || []).filter((layer) => layer.kind !== 'guide');
  const pool = scopeGroupId
    ? layers.filter((layer) => layer.parentGroupId === scopeGroupId)
    : layers.filter((layer) => !layer.parentGroupId);
  const sorted = [...pool].sort((a, b) => b.zIndex - a.zIndex);
  const order: string[] = [];
  const map = new Map<string, PenPageLayer[]>();
  const compound = new Set<string>();
  for (const layer of sorted) {
    const isGroup = layer.kind === 'group';
    const trackId = isGroup ? layer.id : layer.timelineTrackId || layer.id;
    if (!map.has(trackId)) {
      order.push(trackId);
      map.set(trackId, []);
    }
    map.get(trackId)!.push(layer);
    if (isGroup) compound.add(trackId);
  }
  for (const layer of layers) {
    if (!layer.parentGroupId || !compound.has(layer.parentGroupId)) continue;
    map.get(layer.parentGroupId)!.push(layer);
  }
  return order.map((trackId) => ({
    trackId,
    layers: map.get(trackId) || [],
    compound: compound.has(trackId)
  }));
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

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M2 2.5 14 13.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M3 6.2A8 8 0 0 0 1.5 8s2.4 4 6.5 4c.8 0 1.5-.1 2.2-.4M6.2 4.3A8 8 0 0 1 8 4c4.1 0 6.5 4 6.5 4a8 8 0 0 1-1.6 1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function GrabberIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M5 3.5h.01M5 8h.01M5 12.5h.01M9 3.5h.01M9 8h.01M9 12.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const TRANSITION_PRESETS: Array<{ id: PenTransitionPreset; label: string }> = [
  { id: 'crossfade', label: 'Fade' },
  { id: 'slide', label: 'Slide' },
  { id: 'push', label: 'Push' },
  { id: 'dip', label: 'Dip' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'unfold', label: 'Unfold' }
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

/**
 * Filmstrip thumbs use their own element. Seeking the shared master jumps the
 * layer preview while the timeline is trying to play it.
 */
async function readFrames(src: string, cancelled: () => boolean): Promise<string[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (src.startsWith('http://') || src.startsWith('https://')) video.crossOrigin = 'anonymous';
  video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      const ok = () => resolve();
      const bad = () => reject(new Error('frames'));
      video.addEventListener('loadeddata', ok, { once: true });
      video.addEventListener('error', bad, { once: true });
    });
    if (cancelled()) return [];
    const dur = video.duration;
    if (!dur || !Number.isFinite(dur) || dur < 0.05) return [];
    const count = Math.min(8, Math.max(1, Math.round(dur)));
    const canvas = document.createElement('canvas');
    const sourceWidth = video.videoWidth || 16;
    const sourceHeight = video.videoHeight || 9;
    canvas.height = 64;
    canvas.width = Math.max(32, Math.round(64 * (sourceWidth / sourceHeight)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const frames: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if (cancelled()) return frames;
      await seekVideo(video, ((i + 0.5) / count) * Math.max(0.05, dur - 0.05));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.82));
    }
    return frames;
  } catch {
    return [];
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

/** Forward playback keeps the element's own clock. Scrub, play, and reverse seek. */
export function shouldSeekTimelineVideo(
  mode: 'play' | 'pause' | 'seek' | 'tick',
  reversed: boolean
): boolean {
  if (mode === 'pause') return false;
  if (mode === 'tick') return reversed;
  return true;
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

function MotionTile({
  label,
  motion,
  slot,
  selected,
  onClick
}: {
  label: string;
  motion: string;
  slot?: PenAnimationSlot;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      data-motion={motion}
      data-slot={slot}
      className="pen-motion-tile pen-editor-tile text-left"
      onClick={onClick}
    >
      <span
        data-look-tile="square"
        className={`pen-editor-square bg-stone-300 ${selected ? 'outline outline-2 outline-stone-600' : ''}`}
      >
        <img src={lookSwatch} alt="" className="pen-motion-still h-full w-full object-cover" draggable={false} />
      </span>
      <span className={`block h-3 shrink-0 truncate text-[10px] leading-3 ${selected ? 'font-semibold text-stone-700' : 'text-stone-400'}`}>
        {label.replace(/^(Animation|Transition) /, '')}
      </span>
    </button>
  );
}

function clipFace(layer: PenPageLayer): { text: string; svg?: string } {
  if (layer.widgetElement === 'svg' && layer.svgSrc) return { text: '', svg: layer.svgSrc };
  if (layer.widgetElement === 'time') return { text: timeLayerCaption(layer) };
  if (layer.widgetElement === 'html') {
    return {
      text: (layer.htmlSource || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    };
  }
  if (layer.kind === 'text') return { text: docToPlainText(getTextLayerDoc(layer)).trim() };
  if (layer.kind === 'interactive') return { text: layer.label || '' };
  return { text: '' };
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
    readyRef.current(resolved);
    void (async () => {
      const [wave, frames] = await Promise.all([
        readWave(resolved),
        readFrames(resolved, () => cancel)
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

/** Reads a video file's length once so the clip is the file, not the clock. */
function VideoFileDuration({
  layerId,
  src,
  docId,
  session,
  onDuration
}: {
  layerId: string;
  src: string;
  docId?: string;
  session?: PenSession | null;
  onDuration: (layerId: string, seconds: number) => void;
}) {
  const { resolved } = useResolvedMediaSrc(src, { docId, session });
  const report = useRef(onDuration);
  report.current = onDuration;
  useEffect(() => {
    if (!resolved) return;
    const video = document.createElement('video');
    video.preload = 'metadata';
    const finish = () => {
      const seconds = video.duration;
      if (Number.isFinite(seconds) && seconds > 0) report.current(layerId, seconds);
    };
    video.addEventListener('loadedmetadata', finish);
    video.src = resolved;
    return () => {
      video.removeEventListener('loadedmetadata', finish);
      video.removeAttribute('src');
      video.load();
    };
  }, [resolved, layerId]);
  return null;
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

/** One clip lane is h-8. space-y-1 is the gap between rows. */
export const TIMELINE_LANE_PX = 32;
export const TIMELINE_GAP_PX = 4;
export const TIMELINE_VISIBLE_TRACKS = 3;

/** Null while every track fits. Four or more keep a three-track window until the user drags. */
export function timelineTracksMaxPx(trackCount: number): number | null {
  const count = Math.max(0, Math.round(trackCount) || 0);
  if (count <= TIMELINE_VISIBLE_TRACKS) return null;
  return (
    TIMELINE_VISIBLE_TRACKS * TIMELINE_LANE_PX +
    (TIMELINE_VISIBLE_TRACKS - 1) * TIMELINE_GAP_PX
  );
}

const ANIMATION_STYLES: Array<[PenAnimationStyle, string]> = [
  ['fade', 'Fade'],
  ['rise', 'Rise'],
  ['drop', 'Drop'],
  ['slideLeft', 'Slide left'],
  ['slideRight', 'Slide right'],
  ['zoom', 'Zoom'],
  ['pop', 'Pop'],
  ['unfold', 'Unfold']
];

const ANIMATION_SLOTS: Array<[PenAnimationSlot, string]> = [
  ['in', 'In'],
  ['out', 'Out'],
  ['both', 'Both']
];

function AnimationSlotIcon({ slot }: { slot: PenAnimationSlot }) {
  if (slot === 'in') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          d="M3 3v10M6 8h7M10 5l3 3-3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (slot === 'out') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          d="M13 3v10M10 8H3M6 5 3 8l3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3 3v10M13 3v10M5.5 8h5M7.5 6 5.5 8l2 2M8.5 6l2 2-2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** In edits the entrance. Out edits the exit. Both edits both. */
export function animationLengthEditable(slot: PenAnimationSlot, edge: 'in' | 'out'): boolean {
  return slot === 'both' || slot === edge;
}

function DurationSecondsInput({
  label,
  value,
  disabled = false,
  onCommit,
  className,
  fallbackSec = MOTION_PRESET_SEC,
  marker = 'animation-seconds'
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
  className?: string;
  fallbackSec?: number;
  marker?: 'animation-seconds' | 'transition-seconds';
}) {
  const tone = disabled ? 'text-stone-300' : 'text-stone-700';
  const markerProps =
    marker === 'transition-seconds' ? { 'data-transition-seconds': '' } : { 'data-animation-seconds': '' };
  return (
    <label
      {...markerProps}
      className={`relative inline-block text-[11px] tabular-nums ${tone} ${className ?? ''}`}
    >
      <input
        aria-label={label}
        type="number"
        min={0.1}
        step={0.1}
        disabled={disabled}
        value={value}
        className={`h-4 w-11 bg-transparent pr-3 text-right outline-none [appearance:textfield] disabled:text-stone-300 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${tone}`}
        onChange={(event) => {
          onCommit(Math.max(1 / 30, Number(event.target.value) || fallbackSec));
        }}
      />
      <span className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2" aria-hidden>
        s
      </span>
    </label>
  );
}

export function AnimationPicker({
  layer,
  section,
  onSectionChange
}: {
  layer: PenPageLayer;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
}) {
  const [slot, setSlot] = useState<PenAnimationSlot>('in');
  const spec = readLayerAnimation(layer.motion?.animation);
  const selected = spec.both ? (slot === 'both' ? spec.both : undefined) : spec[slot];
  const inSec = spec.durationSec ?? MOTION_PRESET_SEC;
  const outSec = spec.outDurationSec ?? spec.durationSec ?? MOTION_PRESET_SEC;
  function setEdge(edge: 'in' | 'out', next: number) {
    onSectionChange(upsertLayer(section, setAnimationDuration(layer, edge, next)));
  }
  return (
    <div data-animation-picker="" className="flex h-full min-w-0 items-stretch gap-2">
      <div
        className="grid h-full shrink-0 grid-cols-[1.25rem_auto] grid-rows-3 content-center items-center"
        role="tablist"
      >
        {ANIMATION_SLOTS.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-label={`Animation ${label}`}
            aria-selected={slot === id}
            className={`col-start-1 flex h-5 w-5 items-center justify-center ${slot === id ? 'text-stone-700' : 'text-stone-400'} ${index === 0 ? 'row-start-1' : index === 1 ? 'row-start-2' : 'row-start-3'}`}
            onClick={() => setSlot(id)}
          >
            <AnimationSlotIcon slot={id} />
          </button>
        ))}
        <DurationSecondsInput
          className="col-start-2 row-start-1"
          label="Animation In length"
          value={inSec}
          disabled={!animationLengthEditable(slot, 'in')}
          onCommit={(next) => setEdge('in', next)}
        />
        <DurationSecondsInput
          className="col-start-2 row-start-2"
          label="Animation Out length"
          value={outSec}
          disabled={!animationLengthEditable(slot, 'out')}
          onCommit={(next) => setEdge('out', next)}
        />
      </div>
      <div className="pen-editor-tiles">
        <button
          type="button"
          aria-label="Animation None"
          aria-pressed={!selected}
          className={`pen-editor-tile text-left ${selected ? 'text-stone-400' : 'font-semibold text-stone-700'}`}
          onClick={() => onSectionChange(upsertLayer(section, setLayerAnimation(layer, slot, null)))}
        >
          <span className="pen-editor-square bg-stone-200" />
          <span className="block h-3 shrink-0 truncate text-[10px] leading-3">None</span>
        </button>
        {ANIMATION_STYLES.map(([style, label]) => (
          <MotionTile
            key={style}
            label={`Animation ${label}`}
            motion={style}
            slot={slot}
            selected={selected === style}
            onClick={() => onSectionChange(upsertLayer(section, setLayerAnimation(layer, slot, style)))}
          />
        ))}
      </div>
    </div>
  );
}

export function TransitionSettings({
  join,
  section,
  onSectionChange,
  onPreview
}: {
  join: TrackJoinPoint;
  section: PenSectionContent;
  onSectionChange: (next: PenSectionContent) => void;
  onPreview?: (time: number) => void;
}) {
  const incoming = (section.layers || []).find((item) => item.id === join.toId);
  const current = incoming?.transitionIn?.preset;
  const durationSec = incoming?.transitionIn?.durationSec ?? join.durationSec;
  function apply(preset: PenTransitionPreset, duration = durationSec) {
    const next = applyTransitionPreset(section, join.fromId, join.toId, preset, {
      atSec: join.atSec,
      durationSec: duration
    });
    onSectionChange(next);
    const start = Math.max(0, join.atSec - 0.05);
    onPreview?.(start);
  }
  return (
    <div className="flex h-full min-w-0 items-stretch gap-2">
      <label className="flex shrink-0 flex-col items-center justify-center gap-0.5 text-center text-[12px] text-stone-500">
        Length
        <DurationSecondsInput
          label="Transition length"
          value={durationSec}
          fallbackSec={0.5}
          marker="transition-seconds"
          onCommit={(next) => apply(current && current !== 'cut' ? current : 'crossfade', next)}
        />
      </label>
      <div className="pen-editor-tiles">
        <button
          type="button"
          aria-label="Transition None"
          aria-pressed={!current || current === 'cut'}
          className="pen-editor-tile text-left text-stone-500"
          onClick={() => onSectionChange(clearClipTransition(section, join.toId))}
        >
          <span className="pen-editor-square bg-stone-200" />
          <span className="block h-3 shrink-0 truncate text-[10px] leading-3">None</span>
        </button>
        {TRANSITION_PRESETS.map((preset) => (
          <MotionTile
            key={preset.id}
            label={`Transition ${preset.label}`}
            motion={preset.id === 'crossfade' ? 'fade' : preset.id}
            selected={current === preset.id}
            onClick={() => apply(preset.id)}
          />
        ))}
      </div>
    </div>
  );
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
  mode = 'media',
  scopeGroupId = null,
  onEnterGroup,
  showAnimations = true,
  onJoinSelect
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
  /** Widget rows hide clip tools. Both modes collapse a group to one track until you enter it. */
  mode?: 'media' | 'widget';
  /** When set, the timeline is that group's own tracks. */
  scopeGroupId?: string | null;
  onEnterGroup?: (id: string | null) => void;
  /** Media editor shows these on its Animations tab instead. */
  showAnimations?: boolean;
  /** Media editor opens its Transitions tab from the selected join. */
  onJoinSelect?: (point: TrackJoinPoint | null) => void;
}) {
  const widget = mode === 'widget';
  const duration = resolveTimelineDuration(section);
  const groups = timelineTracks(section, scopeGroupId);
  const mainTrackId = groups[groups.length - 1]?.trackId ?? null;
  const scopeGroup = scopeGroupId
    ? (section.layers || []).find((layer) => layer.id === scopeGroupId && layer.kind === 'group')
    : null;
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
  const scaleHostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(0);
  useEffect(() => {
    const el = scaleHostRef.current;
    if (!el) return;
    const measure = () => setHostWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const introSec =
    scopeGroup?.durationSec && scopeGroup.durationSec > 0 ? scopeGroup.durationSec : duration;
  const playSpan = widget ? introSec : duration;
  const layerLoops =
    widget &&
    (section.layers || []).some((item) => Boolean(item.motion?.loop) && (item.motion?.keys?.length || 0) > 0);
  const pxPerSec = 96 * zoom;
  const naturalPx = Math.max(playSpan, 0.01) * pxPerSec;
  const scaleWidthPx = Math.max(hostWidth, naturalPx);
  const viewSpan = scaleWidthPx / Math.max(pxPerSec, 0.01);
  const [graphsOpen, setGraphsOpen] = useState(false);
  const graphsRef = useRef<HTMLDivElement>(null);
  const graphPopRef = useRef<HTMLDivElement>(null);
  const [graphAnchor, setGraphAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [joinMenu, setJoinMenu] = useState<TrackJoinPoint | null>(null);
  const [animOpen, setAnimOpen] = useState(false);
  const [animAnchor, setAnimAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const animRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef(playheadSec);
  const playingRef = useRef(playing);
  const rootRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const [dragTracksPx, setDragTracksPx] = useState<number | null>(null);
  const [measuredCap, setMeasuredCap] = useState<number | null>(null);
  useEffect(() => {
    if (groups.length <= TIMELINE_VISIBLE_TRACKS) {
      setMeasuredCap(null);
      return;
    }
    const root = tracksRef.current;
    if (!root) return;
    const rows = [...root.querySelectorAll(':scope > [data-track-row]')].slice(
      0,
      TIMELINE_VISIBLE_TRACKS
    );
    if (rows.length < TIMELINE_VISIBLE_TRACKS) return;
    const next = Math.ceil(
      rows[rows.length - 1]!.getBoundingClientRect().bottom - rows[0]!.getBoundingClientRect().top
    );
    if (next > 0) setMeasuredCap((prev) => (prev === next ? prev : next));
  }, [groups.length, section]);
  useEffect(() => {
    if (!graphsReady) setGraphsOpen(false);
  }, [graphsReady]);
  useEffect(() => {
    if (!graphsOpen) {
      setGraphAnchor(null);
      return;
    }
    const root = rootRef.current;
    const anchor = graphsRef.current;
    if (!root || !anchor) return;
    const place = () => {
      const rootBox = root.getBoundingClientRect();
      const box = anchor.getBoundingClientRect();
      setGraphAnchor({
        left: box.left - rootBox.left,
        bottom: rootBox.bottom - box.top + 4
      });
    };
    place();
    const toolbar = anchor.closest('[data-timeline-toolbar]');
    toolbar?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      toolbar?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [graphsOpen]);
  useEffect(() => {
    if (!graphsOpen) return;
    function onDoc(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (graphsRef.current?.contains(target) || graphPopRef.current?.contains(target)) return;
      setGraphsOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [graphsOpen]);
  useEffect(() => {
    if (!animOpen) return;
    function onDoc(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (animRef.current?.contains(target) || target instanceof Element && target.closest('[data-animation-picker]')) {
        return;
      }
      setAnimOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [animOpen]);
  useEffect(() => {
    if (!joinMenu) return;
    function onDoc(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        target instanceof Element &&
        target.closest('[data-transition-join], [data-transition-settings], [data-transition-tab], [data-media-settings], [data-media-tabs]')
      ) {
        return;
      }
      setJoinMenu(null);
      onJoinSelect?.(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [joinMenu, onJoinSelect]);
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
    const seen = new Set<string>();
    for (const group of groups) {
      for (const layer of group.layers) {
        if (seen.has(layer.id)) continue;
        seen.add(layer.id);
        const ctrl = videoController(layer, mode === 'play');
        if (!ctrl) continue;
        if (mode === 'pause') {
          ctrl.pause();
          ctrl.master.loop = true;
          continue;
        }
        const rate = layer.playbackRate && layer.playbackRate > 0 ? layer.playbackRate : 1;
        ctrl.setPlaybackRate(rate);
        const mediaAt = layerMediaTime(layer, at, rate, layerClockSpan(section, layer));
        const reversed = Boolean(layer.mediaReversed);
        if (mode === 'play') ctrl.master.loop = false;
        if (!shouldSeekTimelineVideo(mode, reversed)) continue;
        if (reversed) {
          ctrl.pause();
          placeVideo(ctrl.master, mediaAt, true);
          continue;
        }
        placeVideo(ctrl.master, mediaAt, true);
        if (mode === 'play') void ctrl.ensurePlaying();
      }
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
      const raw = playheadRef.current + dt;
      if (layerLoops) {
        playheadRef.current = raw;
        onPlayhead(raw);
        driveRef.current('tick', raw);
        frame = requestAnimationFrame(tick);
        return;
      }
      const next = Math.min(playSpan, raw);
      playheadRef.current = next;
      onPlayhead(next);
      driveRef.current(next >= playSpan ? 'pause' : 'tick', next);
      if (next >= playSpan) {
        playingRef.current = false;
        onPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, playSpan, layerLoops, onPlayhead, onPlaying]);

  function seekTo(time: number) {
    const next = Math.min(viewSpan, Math.max(0, time));
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
    seekTo(Math.min(1, Math.max(0, ratio)) * viewSpan);
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

  function commitTrack(next: PenSectionContent, trackId: string) {
    onSectionChange(trackId === mainTrackId ? closeTrackGaps(next, trackId) : next);
  }

  function setTrim(layer: PenPageLayer, edge: 'in' | 'out', ratio: number, clipId?: string) {
    const span = viewSpan;
    const minGap = 0.1;
    const trackId = layer.timelineTrackId || layer.id;
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
      const trimmed = upsertLayer(section, {
        ...layer,
        clips: nextClips,
        inSec: Math.min(...nextClips.map((item) => item.inSec)),
        outSec: Math.max(...nextClips.map((item) => item.outSec))
      });
      const end = Math.max(...nextClips.map((item) => item.outSec));
      commitTrack(edge === 'out' ? raiseTimelineTo(trimmed, end) : trimmed, trackId);
      return;
    }
    const inn = layer.inSec ?? 0;
    const out = layer.outSec ?? span;
    if (edge === 'in') {
      const at = Math.min(out - minGap, Math.max(0, ratio * span));
      const source = Math.max(0, (layer.sourceInSec ?? 0) + (at - inn));
      commitTrack(
        upsertLayer(section, {
          ...layer,
          inSec: at,
          sourceInSec: source > 0 ? source : undefined
        }),
        trackId
      );
      return;
    }
    const at = Math.max(inn + minGap, Math.max(0, ratio * span));
    commitTrack(raiseTimelineTo(upsertLayer(section, { ...layer, outSec: at }), at), trackId);
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

  function dropBefore(ev: PointerEvent): string | null {
    const root = rootRef.current;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track-row]');
    const trackId = hit?.getAttribute('data-track-row');
    const rows = [...(root?.querySelectorAll('[data-track-row]') || [])];
    const ids = rows.map((row) => row.getAttribute('data-track-row') || '');
    if (!hit || !trackId || !(hit instanceof HTMLElement)) return null;
    const y = (ev.clientY - hit.getBoundingClientRect().top) / Math.max(1, hit.getBoundingClientRect().height);
    const index = ids.indexOf(trackId);
    return y < 0.5 ? trackId : ids[index + 1] || null;
  }

  function beginGrab(event: ReactPointerEvent<HTMLElement>, layer: PenPageLayer, trackId: string) {
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
      onSelectLayer(layer.id);
      if (!moved) return;
      const before = dropBefore(ev);
      if (before === trackId) return;
      onSectionChange(reorderTimelineLayer(section, layer.id, before, scopeGroupId, false));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function beginClipDrag(
    event: ReactPointerEvent<HTMLElement>,
    layer: PenPageLayer,
    clipId: string,
    span: number
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const lane = event.currentTarget.closest('[data-clip-lane]');
    const width = lane instanceof HTMLElement ? lane.getBoundingClientRect().width : 1;
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
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track-row]');
      const trackId = hit?.getAttribute('data-track-row');
      const own = scopeGroupId && layer.kind === 'group' ? layer.id : layer.timelineTrackId || layer.id;
      if (trackId && trackId !== own) {
        let next = moveClipToTrack(section, layer.id, clipId, trackId);
        if (own === mainTrackId) next = closeTrackGaps(next, own);
        if (trackId === mainTrackId) next = closeTrackGaps(next, trackId);
        onSectionChange(next);
        return;
      }
      const delta = ((ev.clientX - startX) / Math.max(1, width)) * span;
      const shifted = moveClipBy(section, layer.id, clipId, delta);
      onSectionChange(own === mainTrackId ? closeTrackGaps(shifted, own) : shifted);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startH =
      tracksRef.current?.getBoundingClientRect().height ??
      timelineTracksMaxPx(groups.length) ??
      TIMELINE_LANE_PX;
    const panel = rootRef.current?.parentElement;
    const panelH = panel?.getBoundingClientRect().height ?? startH + 160;
    const timelineH = rootRef.current?.getBoundingClientRect().height ?? startH;
    const chrome = Math.max(0, timelineH - startH);
    const maxH = Math.max(TIMELINE_LANE_PX, panelH - chrome - 48);
    const move = (ev: PointerEvent) => {
      const next = startH + (startY - ev.clientY);
      setDragTracksPx(Math.min(maxH, Math.max(TIMELINE_LANE_PX, next)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function toggleVisible(layer: PenPageLayer) {
    onSectionChange(upsertLayer(section, { ...layer, visible: layer.visible === false }));
  }

  function toggleMute(layer: PenPageLayer) {
    if (layer.kind !== 'video') return;
    const mediaMuted = layer.mediaMuted === false ? true : false;
    peekPenMediaController(`pen-layer:${layer.id}`)?.setClipAudio(
      (layer.mediaGain ?? 100) / 100,
      mediaMuted === false
    );
    onSectionChange(upsertLayer(section, { ...layer, mediaMuted }));
  }

  const tracksMax = timelineTracksMaxPx(groups.length);
  const tracksStyle: CSSProperties | undefined =
    dragTracksPx != null
      ? { height: dragTracksPx }
      : tracksMax != null
        ? { maxHeight: measuredCap ?? tracksMax }
        : undefined;

  return (
    <div
      ref={rootRef}
      data-media-timeline
      className="relative min-w-0 shrink-0 select-none bg-stone-50"
    >
      <div
        data-timeline-resize
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        title="Drag to resize the timeline"
        className="relative z-30 h-px shrink-0 cursor-ns-resize border-t border-stone-300 before:absolute before:-top-1.5 before:left-0 before:right-0 before:h-3 before:content-['']"
        onPointerDown={beginResize}
      />
      <div data-timeline-toolbar className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 overflow-x-auto px-2 py-0.5">
        <div className="flex min-w-0 items-center gap-1">
        {scopeGroup ? (
          <button
            type="button"
            aria-label="Leave group"
            title="Leave group"
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1 text-[12px] text-stone-700"
            onClick={() => onEnterGroup?.(null)}
          >
            <span aria-hidden>‹</span>
            {defaultLayerName(scopeGroup, section.layers || [])}
          </button>
        ) : null}
        {widget ? null : (
          <>
            <button
              type="button"
              aria-label="Mirror"
              title="Mirror"
              aria-pressed={Boolean(active?.mediaMirror)}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${active?.mediaMirror ? 'text-stone-800' : 'text-stone-500'}`}
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
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center ${active?.mediaReversed ? 'text-stone-800' : 'text-stone-500'}`}
              onClick={() => onReverse?.()}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M12.5 2.5 3.5 8l9 5.5V2.5z" fill="currentColor" />
              </svg>
            </button>
          </>
        )}
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
        </div>
        {showAnimations && active && active.kind !== 'guide' ? (
          <div ref={animRef} className="relative">
            <button
              type="button"
              aria-label="Animations"
              aria-expanded={animOpen}
              className={`inline-flex h-6 shrink-0 items-center px-1 text-[12px] ${
                animOpen ? 'font-semibold text-stone-800' : 'text-stone-500'
              }`}
              onClick={() => {
                const root = rootRef.current?.getBoundingClientRect();
                const box = animRef.current?.getBoundingClientRect();
                if (root && box) {
                  setAnimAnchor({
                    left: box.left - root.left,
                    bottom: root.bottom - box.top + 4
                  });
                }
                setAnimOpen((open) => !open);
              }}
            >
              Animations
            </button>
          </div>
        ) : null}
        {widget ? (
          <label className="flex items-center gap-1 text-[12px] text-stone-600">
            Intro
            <input
              aria-label="Intro length"
              type="number"
              min={0.1}
              step={0.1}
              className="w-14 rounded border border-stone-200 bg-white px-1 py-0.5 tabular-nums"
              value={Math.round(playSpan * 10) / 10}
              onChange={(event) => {
                const value = Number(event.target.value);
                const next = Number.isFinite(value) && value > 0 ? value : undefined;
                if (scopeGroup) {
                  setGroupDuration(scopeGroup, value);
                  return;
                }
                onSectionChange({ ...section, timelineDurationSec: next });
              }}
            />
          </label>
        ) : null}
        {widget && (active?.motion?.keys?.length || 0) > 0 ? (
          <label className="flex items-center gap-1 text-[12px] text-stone-600">
            <input
              aria-label="Loop layer"
              type="checkbox"
              checked={Boolean(active?.motion?.loop)}
              onChange={(event) => {
                if (!active?.motion) return;
                onSectionChange(
                  upsertLayer(section, {
                    ...active,
                    motion: { ...active.motion, loop: event.target.checked }
                  })
                );
              }}
            />
            Loop
          </label>
        ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-1">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-600"
          onClick={() => {
            const next = !playing;
            const at = next && playheadSec >= playSpan - 0.05 ? 0 : playheadSec;
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
          {formatTime(layerLoops ? wrapTime(playheadSec, playSpan) : playheadSec)} / {formatTime(playSpan)}
        </span>
        </div>
        <div className="flex items-center justify-end gap-1 text-stone-500">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center"
            onClick={() => setZoom((value) => Math.max(0.25, Math.round((value - 0.5) * 10) / 10))}
          >
            <Magnify plus={false} />
          </button>
          <input
            aria-label="Zoom"
            title="Zoom"
            type="range"
            min={0.25}
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
      {graphsOpen && leaving && graphAnchor ? (
        <div
          ref={graphPopRef}
          data-keyframe-graphs
          className="absolute z-50 flex max-w-[16rem] gap-1 overflow-x-auto rounded-md border border-stone-200 bg-white p-1 shadow-lg"
          style={{ left: graphAnchor.left, bottom: graphAnchor.bottom }}
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
      {animOpen && active && animAnchor ? (
        <div
          data-animation-picker=""
          className="absolute z-50 max-w-[18rem] rounded-md border border-stone-200 bg-white p-1 shadow-lg"
          style={{ left: animAnchor.left, bottom: animAnchor.bottom }}
        >
          <AnimationPicker layer={active} section={section} onSectionChange={onSectionChange} />
        </div>
      ) : null}
      <div ref={scaleHostRef} className="min-w-0 shrink-0 overflow-x-auto px-2 pb-2">
        <div
          data-timeline-scale
          className="relative"
          style={{ width: `${scaleWidthPx}px` }}
        >
          <div className="relative mb-1 h-6 cursor-ew-resize" onPointerDown={beginScrub}>
            {timelineMarks(viewSpan, zoom).map((mark) => (
              <span
                key={mark.t}
                data-tick={mark.major ? 'major' : 'minor'}
                className="absolute top-0"
                style={{ left: trackLeft(mark.t, viewSpan) }}
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
          <div
            ref={tracksRef}
            data-timeline-tracks
            data-timeline-track-cap={String(TIMELINE_VISIBLE_TRACKS)}
            className="shrink-0 space-y-1 overflow-x-hidden overflow-y-auto"
            style={tracksStyle}
          >
        {groups.map(({ trackId, layers: trackLayers, compound }) => {
          const groupLayer = trackLayers.find((item) => item.kind === 'group');
          const layer = trackLayers.find((item) => item.id === activeLayerId) ?? trackLayers[0]!;
          const rowDur = layerClockSpan(section, layer);
          const local = layer.kind === 'group' ? wrapTime(playheadSec, rowDur) : layerSampleTime(section, layer, playheadSec);
          const posed = sampleLayerAt(layer, local, rowDur);
          const clips =
            compound && groupLayer
              ? [{ clip: { id: groupLayer.id, inSec: 0, outSec: rowDur }, owner: groupLayer }]
              : trackLayers.flatMap((item) =>
                  item.kind === 'group'
                    ? []
                    : layerClips(item, rowDur).map((clip) => ({ clip, owner: item }))
                );
          const keys = trackLayers.flatMap((item) =>
            (item.motion?.keys || []).map((key) => ({ key, ownerId: item.id }))
          );
          const host = groupLayer ?? layer;
          const selected = trackLayers.some((item) => item.id === activeLayerId);
          const role = trackId === mainTrackId ? 'main' : 'overlay';
          const clipStart = clips.length ? Math.min(...clips.map((item) => item.clip.inSec)) : 0;
          const clipEnd = clips.length ? Math.max(...clips.map((item) => item.clip.outSec)) : 0;
          const shown = host.visible !== false;
          const audioMuted = host.kind === 'video' ? host.mediaMuted !== false : false;
          const canMute = host.kind === 'video';
          return (
            <div
              key={trackId}
              data-track-row={trackId}
              data-track-role={role}
              data-track-selected={selected ? 'true' : 'false'}
              data-sampled-x={posed.x}
              className="space-y-1"
            >
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  aria-label={shown ? `Hide ${host.id}` : `Show ${host.id}`}
                  title={shown ? 'Hide' : 'Show'}
                  aria-pressed={!shown}
                  className={`inline-flex w-6 shrink-0 items-center justify-center self-center ${
                    shown ? 'text-stone-400' : 'text-stone-700'
                  }`}
                  onClick={() => toggleVisible(host)}
                >
                  {shown ? <EyeIcon /> : <EyeOffIcon />}
                </button>
                <button
                  type="button"
                  aria-label={`Mute ${host.id}`}
                  title={audioMuted ? 'Unmute' : 'Mute'}
                  aria-pressed={audioMuted}
                  disabled={!canMute}
                  className={`inline-flex w-6 shrink-0 items-center justify-center self-center ${
                    canMute ? (audioMuted ? 'text-stone-700' : 'text-stone-400') : 'text-stone-300'
                  }`}
                  onClick={() => toggleMute(host)}
                >
                  <SpeakerIcon muted={audioMuted} />
                </button>
                <button
                  type="button"
                  aria-label={`Reorder ${trackId}`}
                  title="Reorder track"
                  className="inline-flex w-6 shrink-0 cursor-grab items-center justify-center self-center text-stone-400 active:cursor-grabbing"
                  onPointerDown={(event) => beginGrab(event, host, trackId)}
                >
                  <GrabberIcon />
                </button>
                <div
                  data-clip-lane
                  className="relative h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-stone-300 bg-white"
                  onPointerDown={beginScrub}
                >
                {selected && clipEnd > clipStart ? (
                  <div
                    data-track-highlight=""
                    className="pointer-events-none absolute bottom-0 top-0 z-[3] border-2 border-blue-600"
                    style={{
                      left: `${(clipStart / Math.max(viewSpan, 0.01)) * 100}%`,
                      width: `${((clipEnd - clipStart) / Math.max(viewSpan, 0.01)) * 100}%`
                    }}
                  />
                ) : null}
                {widget && clips.length === 0 ? (
                  <span
                    data-clip-title={defaultLayerName(host, section.layers || [])}
                    className="pointer-events-none absolute left-1 top-0.5 z-[1] max-w-[90%] truncate text-[11px] text-stone-500"
                  >
                    {defaultLayerName(host, section.layers || [])}
                  </span>
                ) : null}
                {clips.map(({ clip, owner }) => {
                  const pendingFile =
                    owner.kind === 'video' &&
                    owner.outSec == null &&
                    owner.sourceDurationSec == null &&
                    !(owner.clips && owner.clips.length);
                  if (pendingFile) return null;
                  const playbackSrc =
                    owner.kind === 'video'
                      ? playback === 'publish'
                        ? publishPlaybackSrc(owner)
                        : editorPlaybackSrc(owner)
                      : owner.kind === 'image'
                        ? owner.imageSrc
                        : undefined;
                  const name = defaultLayerName(owner, section.layers || []);
                  const face = playbackSrc ? null : clipFace(owner);
                  return (
                  <div
                    key={`${owner.id}-${clip.id}`}
                    className="absolute bottom-0 top-0 overflow-hidden border border-stone-300 bg-white"
                    style={{
                      left: `${(clip.inSec / Math.max(viewSpan, 0.01)) * 100}%`,
                      width: `${Math.max(4, ((clip.outSec - clip.inSec) / Math.max(viewSpan, 0.01)) * 100)}%`,
                      backgroundColor: playbackSrc ? undefined : owner.backgroundColor || '#e7e5e4'
                    }}
                    onDoubleClick={(event) => {
                      if (!compound || !groupLayer) return;
                      event.preventDefault();
                      event.stopPropagation();
                      onEnterGroup?.(groupLayer.id);
                    }}
                    onPointerDown={(e) => {
                      if (compound && groupLayer) {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectLayer(groupLayer.id);
                        return;
                      }
                      beginClipDrag(e, owner, clip.id, viewSpan);
                    }}
                  >
                    {playbackSrc ? (
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
                    ) : face?.svg ? (
                      <span
                        data-clip-preview={owner.id}
                        className="pointer-events-none absolute inset-0 overflow-hidden [&_svg]:h-full [&_svg]:w-full"
                        dangerouslySetInnerHTML={{ __html: sanitizeWidgetMarkup(face.svg) }}
                      />
                    ) : (
                      <span
                        data-clip-row
                        className="pointer-events-none absolute inset-0 flex items-center gap-2 px-2 text-[11px]"
                      >
                        <span
                          data-clip-title={name}
                          className={`max-w-[45%] shrink-0 truncate ${
                            owner.id === activeLayerId ? 'font-semibold text-stone-800' : 'text-stone-500'
                          }`}
                        >
                          {name}
                        </span>
                        <span data-clip-preview={owner.id} className="min-w-0 truncate text-stone-600">
                          {face?.text}
                        </span>
                      </span>
                    )}
                    {playbackSrc || face?.svg ? (
                    <span
                      data-clip-title={name}
                      className={`pointer-events-none absolute left-3 top-0.5 z-[1] max-w-[90%] truncate text-[11px] ${
                        owner.id === activeLayerId ? 'font-semibold text-stone-800' : 'text-stone-500'
                      }`}
                    >
                      {name}
                    </span>
                    ) : null}
                    {widget ? null : (
                      <button
                        type="button"
                        aria-label={`Trim start ${clip.id}`}
                        className="absolute bottom-0 left-0 top-0 w-1.5 cursor-ew-resize bg-blue-600"
                        onPointerDown={(e) => beginTrim(e, owner, 'in', clip.id)}
                      />
                    )}
                    {widget ? null : (
                      <button
                        type="button"
                        aria-label={`Trim end ${clip.id}`}
                        className="absolute bottom-0 right-0 top-0 w-1.5 cursor-ew-resize bg-blue-600"
                        onPointerDown={(e) => beginTrim(e, owner, 'out', clip.id)}
                      />
                    )}
                  </div>
                  );
                })}
                {widget
                  ? null
                  : trackJoinPoints(section)
                  .filter((point) => point.trackId === trackId)
                  .map((point) => {
                    const titled = TRANSITION_PRESETS.find((item) => item.id === point.preset);
                    const chosen = joinMenu?.fromId === point.fromId && joinMenu?.toId === point.toId;
                    return (
                    <button
                      key={`${point.fromId}-${point.toId}`}
                      type="button"
                      data-transition-join=""
                      data-transition-preset={titled ? titled.id : 'none'}
                      aria-label={titled ? `Transition ${titled.label}` : 'Transition'}
                      aria-pressed={chosen}
                      title={titled ? titled.label : 'Transition'}
                      className={`absolute top-1/2 z-20 flex h-5 min-w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm px-1 text-[10px] leading-none ${
                        chosen ? 'bg-stone-800 text-white' : titled ? 'bg-stone-400 text-stone-800' : 'bg-black'
                      }`}
                      style={{ left: `${(point.atSec / Math.max(viewSpan, 0.01)) * 100}%` }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        const next = chosen ? null : point;
                        setJoinMenu(next);
                        onJoinSelect?.(next);
                      }}
                    >
                      {titled ? titled.label : null}
                    </button>
                    );
                  })}
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
                      style={{ left: `${(key.t / Math.max(viewSpan, 0.01)) * 100}%` }}
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
              {role === 'main' ? (
                <div data-track-label="Main" className="pl-[5.25rem] text-[11px] leading-none text-stone-500">
                  Main
                </div>
              ) : null}
              {groupLayer && !widget ? (
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
              {trackLayers.map((item) => {
                const original = publishPlaybackSrc(item);
                if (item.kind !== 'video' || !original || item.sourceDurationSec) return null;
                return (
                  <VideoFileDuration
                    key={`file-duration-${item.id}`}
                    layerId={item.id}
                    src={original}
                    docId={docId}
                    session={session}
                    onDuration={(id, seconds) => {
                      onSectionChange(applyVideoFileDuration(section, id, seconds));
                    }}
                  />
                );
              })}
              {widget
                ? null
                : trackLayers.flatMap((owner) => (owner.audioTracks || []).map((track) => {
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
                      className="relative h-5 min-w-0 flex-1 cursor-pointer overflow-hidden rounded-md border border-stone-300 bg-white"
                      onPointerDown={beginScrub}
                    >
                      <div
                        className="absolute bottom-0 top-0 bg-white"
                        style={{
                          left: `${(offset / Math.max(viewSpan, 0.01)) * 100}%`,
                          width: `${Math.max(8, 100 - (offset / Math.max(viewSpan, 0.01)) * 100)}%`
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
            style={{
              left: trackLeft(
                layerLoops ? wrapTime(playheadSec, playSpan) : Math.min(playheadSec, viewSpan),
                viewSpan
              )
            }}
            onPointerDown={beginScrub}
          >
            <div className="pointer-events-none mx-auto h-full w-1 bg-stone-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
