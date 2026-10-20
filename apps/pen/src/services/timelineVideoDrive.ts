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
import { peekPenMediaController } from '@par-noir/feed-tile';
import { isUntaintedMediaUrl, resolveUntaintedDrawableVideo } from './composePageVideoEncode';

const SEEK_TIMEOUT_MS = 1500;

/** Seek and resolve once the frame at `at` is decoded (or on timeout). */
export function seekVideoTo(master: HTMLVideoElement, at: number): Promise<void> {
  const dur = master.duration;
  if (!dur || !Number.isFinite(dur)) return Promise.resolve();
  const target = Math.min(dur, Math.max(0, at));
  if (Math.abs((master.currentTime || 0) - target) < 0.0005 && !master.seeking) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      master.removeEventListener('seeked', done);
      resolve();
    };
    const timer = window.setTimeout(done, SEEK_TIMEOUT_MS);
    master.addEventListener('seeked', done);
    try {
      master.currentTime = target;
    } catch {
      done();
    }
  });
}

export function findLayerVideoMaster(root: HTMLElement, layerId: string): HTMLVideoElement | null {
  const key = `pen-layer:${layerId}`;
  // A replaced source leaves the old master in the document until its viewers release it.
  const current = peekPenMediaController(key)?.master;
  if (current && isUntaintedMediaUrl(current.currentSrc || current.src || '')) return current;
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

/** Pause each video layer and seek it to its file time at timeline `timeSec`; resolves when every seek lands. */
export async function seekSectionVideosAtTime(
  section: PenSectionContent,
  root: HTMLElement,
  timeSec: number
): Promise<void> {
  const sec = normalizeSection(section);
  const seen = new Set<string>();
  const seeks: Promise<void>[] = [];
  for (const layer of sec.layers || []) {
    if (layer.kind !== 'video' || seen.has(layer.id)) continue;
    seen.add(layer.id);
    const span = layerClockSpan(sec, layer);
    const master = findLayerVideoMaster(root, layer.id);
    if (!master) continue;
    master.pause();
    if (!layerOnClock(layer, timeSec, span)) continue;
    const rate = layer.playbackRate && layer.playbackRate > 0 ? layer.playbackRate : 1;
    seeks.push(seekVideoTo(master, layerMediaTime(layer, timeSec, rate, span)));
  }
  await Promise.all(seeks);
}
