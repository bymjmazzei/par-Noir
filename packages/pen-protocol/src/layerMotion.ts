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
  PenSectionContent
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

function keyHasPayload(key: PenLayerKeyframe): boolean {
  return (
    key.x !== undefined ||
    key.y !== undefined ||
    key.w !== undefined ||
    key.h !== undefined ||
    key.opacity !== undefined ||
    key.blur !== undefined ||
    key.mediaScale !== undefined ||
    key.mediaX !== undefined ||
    key.mediaY !== undefined ||
    key.mediaRotate !== undefined ||
    key.mediaMaskSize !== undefined ||
    key.mediaFilter !== undefined ||
    key.mediaCrop !== undefined
  );
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

/** Sample every layer. Group bounds stay on the rest pose — this does not write back. */
export function sampleSectionLayers(
  section: PenSectionContent,
  pageTime: number
): PenPageLayer[] {
  return (section.layers || []).map((layer) =>
    sampleLayerAt(layer, layerSampleTime(section, layer, pageTime))
  );
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

function replacePropKeys(
  layer: PenPageLayer,
  prop: 'opacity' | 'x',
  points: Array<{ t: number; value: number; ease?: PenKeyframeEase }>
): PenPageLayer {
  const kept = (layer.motion?.keys || [])
    .map((key) => {
      const next = { ...key };
      delete next[prop];
      return next;
    })
    .filter(keyHasPayload);
  const added: PenLayerKeyframe[] = points.map((point) => ({
    t: quantizeTime(point.t),
    ease: point.ease,
    [prop]: point.value
  }));
  const keys = [...kept, ...added].sort((a, b) => a.t - b.t);
  return { ...layer, motion: keys.length ? { keys } : undefined };
}

export type PenTransitionPreset = 'cut' | 'crossfade' | 'slide';

/**
 * Cut, crossfade, and slide write opacity or x keys on two layers.
 * They do not composite pixels.
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
  const at = Math.max(0, opts?.atSec ?? 1);
  const dur = Math.max(CUT_GAP_SEC, opts?.durationSec ?? 0.5);
  let nextFrom = from;
  let nextTo = to;
  if (preset === 'cut') {
    const gap = CUT_GAP_SEC;
    nextFrom = replacePropKeys(from, 'opacity', [
      { t: 0, value: 100 },
      { t: at, value: 100 },
      { t: at + gap, value: 0 }
    ]);
    nextTo = replacePropKeys(to, 'opacity', [
      { t: 0, value: 0 },
      { t: at, value: 0 },
      { t: at + gap, value: 100 }
    ]);
  } else if (preset === 'crossfade') {
    nextFrom = replacePropKeys(from, 'opacity', [
      { t: at, value: 100, ease: 'easeInOut' },
      { t: at + dur, value: 0 }
    ]);
    nextTo = replacePropKeys(to, 'opacity', [
      { t: at, value: 0, ease: 'easeInOut' },
      { t: at + dur, value: 100 }
    ]);
  } else {
    const dest = from.x;
    const width = from.w;
    nextFrom = replacePropKeys(from, 'x', [
      { t: at, value: dest, ease: 'easeInOut' },
      { t: at + dur, value: dest - width }
    ]);
    nextTo = replacePropKeys(to, 'x', [
      { t: at, value: dest + width, ease: 'easeInOut' },
      { t: at + dur, value: dest }
    ]);
  }
  return {
    ...section,
    layers: (section.layers || []).map((layer) => {
      if (layer.id === from.id) return nextFrom;
      if (layer.id === to.id) return nextTo;
      return layer;
    })
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
