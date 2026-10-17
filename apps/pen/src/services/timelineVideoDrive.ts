/**
 * Seek drawable video masters under a compose/preview root to match the section timeline.
 * Shared by SectionTimeline scrub/play and compose encode sampling.
 */

import {
  layerClockSpan,
  layerMediaTime,
  layerOnClock,
  normalizeSection,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { resolveUntaintedDrawableVideo } from './composePageVideoEncode';

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

function findLayerVideoMaster(root: HTMLElement, layerId: string): HTMLVideoElement | null {
  const key = `pen-layer:${layerId}`;
  const scoped = root.querySelector(
    `video[data-pen-media-drawable="1"][data-pen-media-key="${CSS.escape(key)}"]`
  );
  if (scoped instanceof HTMLVideoElement) return scoped;
  const viewers = root.querySelectorAll(`[data-pen-media-key="${CSS.escape(key)}"]`);
  for (const el of viewers) {
    if (!(el instanceof HTMLElement)) continue;
    const drawable = resolveUntaintedDrawableVideo(el);
    if (drawable) return drawable;
  }
  return null;
}

/** Pause or seek each video layer to timeline `timeSec` (compose scrub / encode). */
export function seekSectionVideosAtTime(
  section: PenSectionContent,
  root: HTMLElement,
  timeSec: number
): void {
  const sec = normalizeSection(section);
  const seen = new Set<string>();
  for (const layer of sec.layers || []) {
    if (layer.kind !== 'video' || seen.has(layer.id)) continue;
    seen.add(layer.id);
    const span = layerClockSpan(sec, layer);
    const master = findLayerVideoMaster(root, layer.id);
    if (!master) continue;
    if (!layerOnClock(layer, timeSec, span)) {
      master.pause();
      continue;
    }
    const rate = layer.playbackRate && layer.playbackRate > 0 ? layer.playbackRate : 1;
    const mediaAt = layerMediaTime(layer, timeSec, rate, span);
    master.pause();
    placeVideo(master, mediaAt, true);
  }
}
