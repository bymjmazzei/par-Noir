/**
 * Layer tracks — sparse keyframes sampled onto the rest pose.
 * Playback never writes sampled rects back onto the layer.
 */

import { mergeMediaFilter } from './mediaStyle.js';
import type {
  PenKeyframeEase,
  PenLayerKeyframe,
  PenLayerMotion,
  PenMediaCrop,
  PenMediaFilter,
  PenPageLayer,
  PenSectionContent,
  PenTimelineClip,
  PenTransitionPreset
} from './types.js';

export const DEFAULT_TIMELINE_SEC = 5;
export const KEYFRAME_EPSILON_SEC = 0.05;
const CUT_GAP_SEC = 1 / 30;

const SCALAR_PROPS = [
  'x',
  'y',
  'w',
  'h',
  'opacity',
  'blur',
  'mediaScale',
  'mediaX',
  'mediaY',
  'mediaRotate',
  'rotate',
  'mediaMaskSize'
] as const;

const MOTION_FIELDS = new Set<string>([
  'x',
  'y',
  'w',
  'h',
  'opacity',
  'blur',
  'mediaScale',
  'mediaX',
  'mediaY',
  'mediaRotate',
  'rotate',
  'mediaMaskSize',
  'mediaFilter',
  'mediaCrop'
]);

function quantizeTime(time: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  return Math.round(time * 1000) / 1000;
}

function ease01(u: number, ease: PenKeyframeEase | undefined): number {
  const t = Math.min(1, Math.max(0, u));
  const inv = 1 - t;
  switch (ease) {
    case 'hold':
      return t >= 1 ? 1 : 0;
    case 'easeIn':
      return 1 - Math.cos((t * Math.PI) / 2);
    case 'quadIn':
      return t * t;
    case 'cubicIn':
      return t * t * t;
    case 'easeOut':
      return Math.sin((t * Math.PI) / 2);
    case 'quadOut':
      return 1 - inv * inv;
    case 'cubicOut':
      return 1 - inv * inv * inv;
    case 'easeInOut':
      return t * t * (3 - 2 * t);
    default:
      return t;
  }
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function sampleNumeric(
  keys: PenLayerKeyframe[],
  read: (key: PenLayerKeyframe) => number | undefined,
  time: number
): number | undefined {
  const points = keys
    .filter((key) => read(key) !== undefined && Number.isFinite(key.t))
    .map((key) => ({ t: key.t, v: read(key) as number, ease: key.ease }))
    .sort((a, b) => a.t - b.t);
  if (!points.length) return undefined;
  if (time <= points[0]!.t) return points[0]!.v;
  const last = points[points.length - 1]!;
  if (time >= last.t) return last.v;
  let i = 0;
  while (i < points.length - 1 && points[i + 1]!.t < time) i += 1;
  const a = points[i]!;
  const b = points[i + 1]!;
  if (b.t === a.t) return b.v;
  const u = (time - a.t) / (b.t - a.t);
  return lerp(a.v, b.v, ease01(u, a.ease));
}

function sampleFilter(
  keys: PenLayerKeyframe[],
  time: number,
  base: PenMediaFilter | undefined
): PenMediaFilter | undefined {
  const channels = [
    'brightness',
    'contrast',
    'saturation',
    'hueRotate',
    'temp',
    'tint',
    'exposure',
    'highlight',
    'shadow',
    'whites',
    'blacks',
    'brilliance',
    'sharpen',
    'clarity',
    'particles',
    'fade',
    'vignette'
  ] as const;
  const any = keys.some((key) => key.mediaFilter);
  if (!any) return base;
  const next: PenMediaFilter = { ...(base || {}) };
  for (const channel of channels) {
    const value = sampleNumeric(keys, (key) => key.mediaFilter?.[channel], time);
    if (value !== undefined) next[channel] = value;
  }
  return next;
}

function sampleCrop(
  keys: PenLayerKeyframe[],
  time: number,
  base: PenMediaCrop | undefined
): PenMediaCrop | undefined {
  const any = keys.some((key) => key.mediaCrop);
  if (!any) return base;
  const next: PenMediaCrop = {
    x: base?.x ?? 0,
    y: base?.y ?? 0,
    w: base?.w ?? 1,
    h: base?.h ?? 1
  };
  for (const channel of ['x', 'y', 'w', 'h'] as const) {
    const value = sampleNumeric(keys, (key) => key.mediaCrop?.[channel], time);
    if (value !== undefined) next[channel] = value;
  }
  return next;
}

/** Render copy at `time`. Unkeyed layers are returned as-is. Guides are never sampled. */
export function sampleLayerAt(layer: PenPageLayer, time: number): PenPageLayer {
  if (layer.kind === 'guide') return layer;
  const keys = layer.motion?.keys;
  if (!keys?.length) return layer;
  const t = Number.isFinite(time) ? time : 0;
  const next: PenPageLayer = { ...layer };
  for (const prop of SCALAR_PROPS) {
    const value = sampleNumeric(keys, (key) => key[prop], t);
    if (value !== undefined) next[prop] = value;
  }
  const filter = sampleFilter(keys, t, layer.mediaFilter);
  if (filter !== layer.mediaFilter) next.mediaFilter = filter;
  const crop = sampleCrop(keys, t, layer.mediaCrop);
  if (crop !== layer.mediaCrop) next.mediaCrop = crop;
  return next;
}

export function wrapTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || !(duration > 0)) return 0;
  if (time <= 0) return 0;
  const wrapped = time % duration;
  if (wrapped === 0) return duration;
  return wrapped;
}

/** Page time for a layer. Children of a timed widget group loop on that clock. */
export function layerSampleTime(
  section: PenSectionContent,
  layer: PenPageLayer,
  pageTime: number
): number {
  if (layer.kind === 'group' || !layer.parentGroupId) return pageTime;
  const group = (section.layers || []).find((item) => item.id === layer.parentGroupId);
  if (!group?.durationSec || group.durationSec <= 0) return pageTime;
  return wrapTime(pageTime, group.durationSec);
}

/** Clock length for one layer. Group children use the group's loop. */
export function layerClockSpan(section: PenSectionContent, layer: PenPageLayer): number {
  if (layer.kind === 'group' && layer.durationSec && layer.durationSec > 0) return layer.durationSec;
  if (layer.parentGroupId) {
    const group = (section.layers || []).find((item) => item.id === layer.parentGroupId);
    if (group?.durationSec && group.durationSec > 0) return group.durationSec;
  }
  return resolveTimelineDuration(section);
}

/** Pieces on one track. A layer with no clips is a single piece. */
export function layerClips(layer: PenPageLayer, span: number): PenTimelineClip[] {
  if (layer.clips && layer.clips.length) return layer.clips;
  return [
    {
      id: layer.id,
      inSec: layer.inSec ?? 0,
      outSec: layer.outSec ?? span,
      sourceInSec: layer.sourceInSec
    }
  ];
}

function clipHolds(clip: PenTimelineClip, time: number, span: number): boolean {
  if (time < clip.inSec || time > clip.outSec) return false;
  if (time >= clip.outSec && clip.outSec < span - 0.001) return false;
  return true;
}

/** The piece under the playhead, if the track is active there. */
export function clipAtTime(
  layer: PenPageLayer,
  time: number,
  span: number
): PenTimelineClip | null {
  return layerClips(layer, span).find((clip) => clipHolds(clip, time, span)) ?? null;
}

/** True while the playhead is inside one piece of the track. */
export function layerOnClock(layer: PenPageLayer, time: number, span: number): boolean {
  if (layer.kind === 'guide') return true;
  return clipAtTime(layer, time, span) != null;
}

/** File time for a playhead. The piece's sourceInSec keeps a cut from restarting the file. */
export function layerMediaTime(layer: PenPageLayer, playhead: number, rate = 1, span?: number): number {
  const speed = rate > 0 ? rate : 1;
  const clock = span ?? Math.max(layer.outSec ?? 0, playhead, 0.01);
  const clip = clipAtTime(layer, playhead, clock);
  const inn = clip?.inSec ?? layer.inSec ?? 0;
  const source = clip?.sourceInSec ?? layer.sourceInSec ?? 0;
  const forward = Math.max(0, (playhead - inn) * speed + source);
  if (!layer.mediaReversed) return forward;
  const out = clip?.outSec ?? layer.outSec ?? clock;
  const sourceEnd = source + Math.max(0, out - inn) * speed;
  return Math.max(0, sourceEnd - (forward - source));
}

export type TrackJoinPoint = {
  trackId: string;
  atSec: number;
  fromId: string;
  toId: string;
  durationSec: number;
};

/** Where two clips on one track meet, including the middle of an overlap. */
export function trackJoinPoints(section: PenSectionContent): TrackJoinPoint[] {
  const layers = (section.layers || []).filter(
    (layer) => layer.kind !== 'guide' && layer.kind !== 'group' && !layer.parentGroupId
  );
  const byTrack = new Map<string, PenPageLayer[]>();
  for (const layer of layers) {
    const id = layerTrackId(layer);
    const list = byTrack.get(id) || [];
    list.push(layer);
    byTrack.set(id, list);
  }
  const points: TrackJoinPoint[] = [];
  for (const [trackId, group] of byTrack) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => (a.inSec ?? 0) - (b.inSec ?? 0));
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i]!;
      const to = ordered[i + 1]!;
      const fromEnd = from.outSec ?? from.inSec ?? 0;
      const toStart = to.inSec ?? 0;
      if (toStart > fromEnd + 0.05) continue;
      const atSec = toStart < fromEnd ? (toStart + fromEnd) / 2 : toStart;
      points.push({
        trackId,
        atSec,
        fromId: from.id,
        toId: to.id,
        durationSec: to.transitionIn?.durationSec ?? 0.5
      });
    }
  }
  return points;
}

/**
 * Split the piece under the playhead into two pieces on the same track.
 * The right piece continues the file instead of starting over.
 */
export function splitLayerAt(
  section: PenSectionContent,
  layerId: string,
  time: number
): PenSectionContent {
  const layers = section.layers || [];
  const index = layers.findIndex((item) => item.id === layerId);
  if (index < 0) return section;
  const layer = layers[index]!;
  if (layer.kind === 'guide' || layer.kind === 'group') return section;
  const span = layerClockSpan(section, layer);
  const clips = layerClips(layer, span);
  const hit = clips.find((clip) => time > clip.inSec + 0.05 && time < clip.outSec - 0.05);
  if (!hit) return section;
  const right: PenTimelineClip = {
    id: `clip_${Math.random().toString(36).slice(2, 10)}`,
    inSec: time,
    outSec: hit.outSec,
    sourceInSec: (hit.sourceInSec ?? 0) + (time - hit.inSec)
  };
  const nextClips = clips.flatMap((clip) =>
    clip.id === hit.id ? [{ ...clip, outSec: time }, right] : [clip]
  );
  const nextLayer: PenPageLayer = {
    ...layer,
    clips: nextClips,
    inSec: Math.min(...nextClips.map((clip) => clip.inSec)),
    outSec: Math.max(...nextClips.map((clip) => clip.outSec))
  };
  const next = layers.slice();
  next[index] = nextLayer;
  return { ...section, layers: next };
}

function smoothstep(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/** Blend two sampled layers across a window centered on the join. Clocks stay put. */
function blendTransition(
  from: PenPageLayer,
  to: PenPageLayer,
  time: number
): { from: PenPageLayer; to: PenPageLayer } {
  const preset = to.transitionIn;
  if (!preset) return { from, to };
  const fromEnd = from.outSec ?? from.inSec ?? 0;
  const toStart = to.inSec ?? 0;
  if (toStart > fromEnd + 0.05) return { from, to };
  const at = toStart < fromEnd ? (toStart + fromEnd) / 2 : toStart;
  const dur = Math.max(CUT_GAP_SEC, preset.durationSec);
  const start = at - dur / 2;
  const end = at + dur / 2;
  if (time < start - 0.001 || time > end + 0.001) return { from, to };
  const u = dur <= 0 ? 1 : (time - start) / dur;
  const e = smoothstep(u);
  const nextFrom: PenPageLayer = { ...from, visible: true };
  const nextTo: PenPageLayer = { ...to, visible: true };
  const kind = preset.preset;
  if (kind === 'cut') {
    nextFrom.opacity = u < 0.5 ? (from.opacity ?? 100) : 0;
    nextTo.opacity = u < 0.5 ? 0 : (to.opacity ?? 100);
  } else if (kind === 'crossfade') {
    nextFrom.opacity = (from.opacity ?? 100) * (1 - e);
    nextTo.opacity = (to.opacity ?? 100) * e;
  } else if (kind === 'dip') {
    if (e < 0.5) {
      nextFrom.opacity = (from.opacity ?? 100) * (1 - e / 0.5);
      nextTo.opacity = 0;
    } else {
      nextFrom.opacity = 0;
      nextTo.opacity = (to.opacity ?? 100) * ((e - 0.5) / 0.5);
    }
  } else if (kind === 'push') {
    const height = from.h;
    nextFrom.y = from.y - height * e;
    nextTo.y = from.y + height * (1 - e);
  } else if (kind === 'zoom') {
    const fromScale = from.mediaScale ?? 100;
    const toScale = to.mediaScale ?? 100;
    nextFrom.mediaScale = fromScale + (140 - fromScale) * e;
    nextTo.mediaScale = 60 + (toScale - 60) * e;
  } else {
    const width = from.w;
    nextFrom.x = from.x - width * e;
    nextTo.x = from.x + width * (1 - e);
  }
  return { from: nextFrom, to: nextTo };
}

function applyStoredTransitions(sampled: PenPageLayer[], time: number): PenPageLayer[] {
  const byId = new Map(sampled.map((layer) => [layer.id, layer]));
  const groups = new Map<string, PenPageLayer[]>();
  for (const layer of sampled) {
    if (layer.kind === 'guide' || layer.kind === 'group' || layer.parentGroupId) continue;
    const id = layerTrackId(layer);
    const list = groups.get(id) || [];
    list.push(layer);
    groups.set(id, list);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => (a.inSec ?? 0) - (b.inSec ?? 0));
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = byId.get(ordered[i]!.id);
      const to = byId.get(ordered[i + 1]!.id);
      if (!from || !to?.transitionIn) continue;
      const blended = blendTransition(from, to, time);
      byId.set(from.id, blended.from);
      byId.set(to.id, blended.to);
    }
  }
  return sampled.map((layer) => byId.get(layer.id) || layer);
}

/** Sample every layer. Group bounds stay on the rest pose — this does not write back. */
export function sampleSectionLayers(
  section: PenSectionContent,
  pageTime: number
): PenPageLayer[] {
  const sampled = (section.layers || []).map((layer) => {
    const local = layerSampleTime(section, layer, pageTime);
    const posed = sampleLayerAt(layer, local);
    if (layer.visible === false || layer.kind === 'guide') return posed;
    const span = layerClockSpan(section, layer);
    if (!layerOnClock(layer, local, span)) return { ...posed, visible: false };
    return posed;
  });
  return applyStoredTransitions(sampled, pageTime);
}

export function sectionHasMotion(section: PenSectionContent | null | undefined): boolean {
  return (section?.layers || []).some((layer) => (layer.motion?.keys?.length || 0) > 0);
}

export function resolveTimelineDuration(
  section: PenSectionContent,
  videoDurationByLayerId?: Record<string, number>
): number {
  if (section.timelineDurationSec && section.timelineDurationSec > 0) {
    return section.timelineDurationSec;
  }
  let max = 0;
  for (const layer of section.layers || []) {
    if (layer.kind === 'guide') continue;
    const hinted = videoDurationByLayerId?.[layer.id];
    if (hinted && hinted > max) max = hinted;
    if (layer.outSec && layer.outSec > max) max = layer.outSec;
    if (layer.kind === 'group' && layer.durationSec && layer.durationSec > max) {
      max = layer.durationSec;
    }
    for (const key of layer.motion?.keys || []) {
      if (key.t > max) max = key.t;
    }
  }
  return max > 0 ? max : DEFAULT_TIMELINE_SEC;
}

export function layerHasAnimatedProp(
  layer: PenPageLayer,
  prop: keyof PenLayerKeyframe
): boolean {
  return (layer.motion?.keys || []).some((key) => key[prop] !== undefined);
}

/** Key you leave for the span that contains `time`, when another key follows it. */
export function spanLeavingKey(layer: PenPageLayer, time: number): PenLayerKeyframe | null {
  const sorted = [...(layer.motion?.keys || [])]
    .filter((key) => Number.isFinite(key.t))
    .sort((a, b) => a.t - b.t);
  let chosen: PenLayerKeyframe | null = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.t <= time + KEYFRAME_EPSILON_SEC) chosen = sorted[i]!;
  }
  return chosen;
}

/** Set the curve on the span that contains `time`. Does not add or move keys. */
export function setKeyframeEase(
  layer: PenPageLayer,
  time: number,
  ease: PenKeyframeEase
): PenPageLayer {
  const leaving = spanLeavingKey(layer, time);
  if (!leaving) return layer;
  const keys = (layer.motion?.keys || []).map((key) =>
    Math.abs(key.t - leaving.t) <= KEYFRAME_EPSILON_SEC ? { ...key, ease } : key
  );
  return { ...layer, motion: keys.length ? { keys } : undefined };
}

function mergeKey(layer: PenPageLayer, key: PenLayerKeyframe): PenPageLayer {
  const keys = [...(layer.motion?.keys || [])];
  const index = keys.findIndex((item) => Math.abs(item.t - key.t) <= KEYFRAME_EPSILON_SEC);
  if (index >= 0) keys[index] = { ...keys[index], ...key, t: quantizeTime(key.t) };
  else keys.push({ ...key, t: quantizeTime(key.t) });
  keys.sort((a, b) => a.t - b.t);
  return { ...layer, motion: { keys } };
}

/**
 * Drag and slider writes. A property with keys is stored on the key at the
 * playhead. A property without keys stays on the rest pose.
 */
export function writeLayerAtPlayhead(
  layer: PenPageLayer,
  time: number,
  patch: Partial<PenPageLayer>
): PenPageLayer {
  const next: PenPageLayer = { ...layer };
  const keyed: PenLayerKeyframe = { t: quantizeTime(time) };
  let hasKeyed = false;
  for (const [raw, value] of Object.entries(patch)) {
    if (MOTION_FIELDS.has(raw) && layerHasAnimatedProp(layer, raw as keyof PenLayerKeyframe)) {
      (keyed as unknown as Record<string, unknown>)[raw] = value;
      hasKeyed = true;
      continue;
    }
    (next as unknown as Record<string, unknown>)[raw] = value;
  }
  if (!hasKeyed) return next;
  return mergeKey(next, keyed);
}

export function applyLayoutAtPlayhead(
  section: PenSectionContent,
  layouts: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    zIndex: number;
    cornerRadius?: number;
  }>,
  pageTime: number
): PenSectionContent {
  const byId = new Map(layouts.map((item) => [item.id, item]));
  const layers = (section.layers || []).map((layer) => {
    const hit = byId.get(layer.id);
    if (!hit) return layer;
    const time = layerSampleTime(section, layer, pageTime);
    const next = writeLayerAtPlayhead(layer, time, {
      x: hit.x,
      y: hit.y,
      w: hit.w,
      h: hit.h
    });
    next.zIndex = hit.zIndex;
    if (hit.cornerRadius != null) next.cornerRadius = hit.cornerRadius;
    return next;
  });
  return { ...section, layers };
}

/** Add a key at the playhead, or remove the one already there. */
export function toggleKeyframeAt(layer: PenPageLayer, time: number): PenPageLayer {
  const keys = layer.motion?.keys || [];
  const near = keys.some((key) => Math.abs(key.t - time) <= KEYFRAME_EPSILON_SEC);
  if (near) {
    const next = keys.filter((key) => Math.abs(key.t - time) > KEYFRAME_EPSILON_SEC);
    return { ...layer, motion: next.length ? { keys: next } : undefined };
  }
  const posed = sampleLayerAt(layer, time);
  const animated = (['x', 'y', 'w', 'h', 'opacity', 'blur', 'mediaFilter', 'mediaCrop'] as const).filter(
    (prop) => layerHasAnimatedProp(layer, prop)
  );
  const key: PenLayerKeyframe = { t: quantizeTime(time) };
  const props = animated.length ? animated : (['x', 'y', 'w', 'h', 'opacity'] as const);
  for (const prop of props) {
    if (prop === 'mediaFilter') {
      if (posed.mediaFilter) key.mediaFilter = { ...posed.mediaFilter };
    } else if (prop === 'mediaCrop') {
      if (posed.mediaCrop) key.mediaCrop = { ...posed.mediaCrop };
    } else if (prop === 'opacity') {
      key.opacity = posed.opacity ?? 100;
    } else if (prop === 'blur') {
      if (posed.blur !== undefined) key.blur = posed.blur;
    } else {
      key[prop] = posed[prop];
    }
  }
  if (layer.kind === 'image' || layer.kind === 'video') {
    key.mediaScale = posed.mediaScale ?? 100;
    key.mediaX = posed.mediaX ?? 0;
    key.mediaY = posed.mediaY ?? 0;
    key.mediaRotate = posed.mediaRotate ?? 0;
    key.mediaMaskSize = posed.mediaMaskSize ?? 100;
    key.mediaFilter = { ...mergeMediaFilter(posed.mediaFilter) };
    if (posed.mediaCrop) key.mediaCrop = { ...posed.mediaCrop };
  }
  return mergeKey(layer, key);
}

/** The row a layer draws on. A layer with no shared id is its own track. */
export function layerTrackId(layer: PenPageLayer): string {
  return layer.timelineTrackId || layer.id;
}

function shiftLayerClock(layer: PenPageLayer, delta: number): PenPageLayer {
  if (!delta) return layer;
  const clips = layer.clips?.map((clip) => ({
    ...clip,
    inSec: clip.inSec + delta,
    outSec: clip.outSec + delta
  }));
  return {
    ...layer,
    clips,
    inSec: (layer.inSec ?? 0) + delta,
    outSec: layer.outSec !== undefined ? layer.outSec + delta : clips ? Math.max(...clips.map((clip) => clip.outSec)) : undefined
  };
}

/** Place one layer after another on the same row. Clip 2 starts when clip 1 ends. */
export function joinLayerToTrack(
  section: PenSectionContent,
  movingId: string,
  trackId: string
): PenSectionContent {
  const layers = section.layers || [];
  const moving = layers.find((layer) => layer.id === movingId);
  const host = layers.find((layer) => layerTrackId(layer) === trackId);
  if (!moving || !host || moving.id === host.id) return section;
  if (moving.kind === 'guide' || host.kind === 'guide') return section;
  const span = layerClockSpan(section, host);
  const hostEnd = host.clips?.length
    ? Math.max(...host.clips.map((clip) => clip.outSec))
    : (host.outSec ?? span);
  const movingStart = moving.clips?.length
    ? Math.min(...moving.clips.map((clip) => clip.inSec))
    : (moving.inSec ?? 0);
  const placed = shiftLayerClock(moving, hostEnd - movingStart);
  const shared = host.timelineTrackId || host.id;
  return {
    ...section,
    layers: layers.map((layer) => {
      if (layer.id === host.id) return { ...layer, timelineTrackId: shared };
      if (layer.id === moving.id) return { ...placed, timelineTrackId: shared };
      return layer;
    })
  };
}

/**
 * Move a layer's row above another track, or to the end when `beforeTrackId` is null.
 * A layer that shared a row becomes its own row. Joining stays on `joinLayerToTrack`.
 */
export function reorderTimelineLayer(
  section: PenSectionContent,
  layerId: string,
  beforeTrackId: string | null
): PenSectionContent {
  const layers = section.layers || [];
  const moving = layers.find((layer) => layer.id === layerId);
  if (!moving || moving.kind === 'guide' || moving.parentGroupId) return section;
  const track = layerTrackId(moving);
  const peers = layers.filter(
    (layer) => !layer.parentGroupId && layer.kind !== 'guide' && layerTrackId(layer) === track
  );
  const released = peers.length > 1 ? releaseLayerTrack(section, layerId) : section;
  const nextLayers = released.layers || [];
  const current = nextLayers.find((layer) => layer.id === layerId);
  if (!current) return section;
  const movingTrack = layerTrackId(current);
  if (beforeTrackId === movingTrack) return released;
  const tops = nextLayers
    .filter((layer) => !layer.parentGroupId && layer.kind !== 'guide')
    .sort((a, b) => a.zIndex - b.zIndex);
  const order: string[] = [];
  for (const layer of tops) {
    const id = layerTrackId(layer);
    if (!order.includes(id)) order.push(id);
  }
  const rest = order.filter((id) => id !== movingTrack);
  const at = beforeTrackId ? rest.indexOf(beforeTrackId) : -1;
  rest.splice(at >= 0 ? at : rest.length, 0, movingTrack);
  const ranked = new Map(rest.map((id, index) => [id, index]));
  return {
    ...released,
    layers: nextLayers.map((layer) => {
      if (layer.parentGroupId || layer.kind === 'guide') return layer;
      const index = ranked.get(layerTrackId(layer));
      if (index == null) return layer;
      const siblings = tops
        .filter((item) => layerTrackId(item) === layerTrackId(layer))
        .sort((a, b) => a.zIndex - b.zIndex);
      const offset = Math.max(
        0,
        siblings.findIndex((item) => item.id === layer.id)
      );
      return { ...layer, zIndex: (index + 1) * 100 + offset };
    })
  };
}

/** Give a layer its own row again so it can play at the same time as the others. */
export function releaseLayerTrack(section: PenSectionContent, layerId: string): PenSectionContent {
  const layers = section.layers || [];
  const layer = layers.find((item) => item.id === layerId);
  if (!layer) return section;
  const own = `track_${Math.random().toString(36).slice(2, 10)}`;
  return {
    ...section,
    layers: layers.map((item) => (item.id === layerId ? { ...item, timelineTrackId: own } : item))
  };
}

/**
 * Remove the piece under the playhead.
 * One piece left removes the layer. Later pieces on the track move back to meet.
 */
export function deleteClipAt(
  section: PenSectionContent,
  layerId: string,
  time: number
): PenSectionContent {
  const layers = section.layers || [];
  const layer = layers.find((item) => item.id === layerId);
  if (!layer || layer.kind === 'guide' || layer.kind === 'group') return section;
  const span = layerClockSpan(section, layer);
  const clips = layerClips(layer, span);
  const hit = clips.find((clip) => time >= clip.inSec && time < clip.outSec) ?? clips[0];
  if (!hit) return section;
  const gap = Math.max(0, hit.outSec - hit.inSec);
  const shared = layerTrackId(layer);
  if (clips.length <= 1 || (clips.length === 1 && clips[0]?.id === layer.id && !layer.clips?.length)) {
    const removedEnd = hit.outSec;
    const nextLayers = layers
      .filter((item) => item.id !== layer.id)
      .map((item) => {
        if (layerTrackId(item) !== shared) return item;
        const start = item.inSec ?? 0;
        if (start + 0.001 < removedEnd) return item;
        return shiftLayerClock(item, -gap);
      });
    return { ...section, layers: nextLayers };
  }
  const nextClips = clips
    .filter((clip) => clip.id !== hit.id)
    .map((clip) =>
      clip.inSec + 0.001 >= hit.outSec
        ? { ...clip, inSec: clip.inSec - gap, outSec: clip.outSec - gap }
        : clip
    );
  const nextLayer: PenPageLayer = {
    ...layer,
    clips: nextClips,
    inSec: Math.min(...nextClips.map((clip) => clip.inSec)),
    outSec: Math.max(...nextClips.map((clip) => clip.outSec))
  };
  return {
    ...section,
    layers: layers.map((item) => {
      if (item.id === layer.id) return nextLayer;
      if (layerTrackId(item) !== shared) return item;
      const start = item.inSec ?? 0;
      if (start + 0.001 < hit.outSec) return item;
      return shiftLayerClock(item, -gap);
    })
  };
}

/**
 * Store one blend on the incoming clip. Switching replaces that preset.
 * User keyframes and the clip clocks stay as they are.
 */
export function applyTransitionPreset(
  section: PenSectionContent,
  fromId: string,
  toId: string,
  preset: PenTransitionPreset,
  opts?: { atSec?: number; durationSec?: number }
): PenSectionContent {
  const from = (section.layers || []).find((layer) => layer.id === fromId);
  const to = (section.layers || []).find((layer) => layer.id === toId);
  if (!from || !to || from.id === to.id) return section;
  const dur = Math.max(CUT_GAP_SEC, opts?.durationSec ?? 0.5);
  return {
    ...section,
    layers: (section.layers || []).map((layer) =>
      layer.id === to.id ? { ...layer, transitionIn: { preset, durationSec: dur } } : layer
    )
  };
}

/** Shift absolute x/y keys by the same delta applied to a copied layer's rest pose. */
export function offsetLayerMotion(
  motion: PenLayerMotion | undefined,
  dx: number,
  dy: number
): PenLayerMotion | undefined {
  if (!motion?.keys?.length || (dx === 0 && dy === 0)) return motion;
  return {
    keys: motion.keys.map((key) => ({
      ...key,
      ...(key.x !== undefined ? { x: key.x + dx } : {}),
      ...(key.y !== undefined ? { y: key.y + dy } : {})
    }))
  };
}
