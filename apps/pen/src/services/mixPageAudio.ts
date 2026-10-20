/**
 * One audio track for a page video: each audible video layer's own sound plus the
 * added audio tracks, placed on the page clock the same way the picture is.
 * Licensed tracks stay references (their license forbids re-uploading), so they are not mixed.
 */

import {
  audioPublishPlan,
  isVisibleVideoLayer,
  layerClips,
  layerClockSpan,
  normalizeSection,
  partitionLayersForCompose,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { resolvePenMediaSrc } from '@par-noir/pen-media';

export const PAGE_AUDIO_SAMPLE_RATE = 48_000;
export const PAGE_AUDIO_CHANNELS = 2;

export type PageAudioSegment =
  | {
      kind: 'video';
      layerId: string;
      /** Page time the segment starts. */
      atSec: number;
      /** File time heard at `atSec`. Reversed segments read backwards from here. */
      sourceSec: number;
      durationSec: number;
      rate: number;
      reversed: boolean;
      gain: number;
    }
  | { kind: 'track'; src: string; atSec: number; gain: number };

/** Where each sound plays on a page clock of `durationSec`. Muted video layers (the default) are left out. */
export function pageAudioPlan(section: PenSectionContent, durationSec: number): PageAudioSegment[] {
  const sec = normalizeSection(section);
  const out: PageAudioSegment[] = [];
  for (const layer of partitionLayersForCompose(sec.layers).inert) {
    if (!isVisibleVideoLayer(layer) || layer.mediaMuted !== false) continue;
    const gain = Math.min(1, Math.max(0, (layer.mediaGain ?? 100) / 100));
    if (!(gain > 0)) continue;
    const rate = layer.playbackRate && layer.playbackRate > 0 ? layer.playbackRate : 1;
    const reversed = layer.mediaReversed === true;
    for (const clip of layerClips(layer, layerClockSpan(sec, layer))) {
      const at = Math.max(0, clip.inSec);
      const end = Math.min(durationSec, clip.outSec);
      if (!(end > at)) continue;
      const source = clip.sourceInSec ?? layer.sourceInSec ?? 0;
      const forward = source + (at - clip.inSec) * rate;
      const sourceEnd = source + (clip.outSec - clip.inSec) * rate;
      out.push({
        kind: 'video',
        layerId: layer.id,
        atSec: at,
        sourceSec: reversed ? Math.max(0, sourceEnd - (forward - source)) : forward,
        durationSec: end - at,
        rate,
        reversed,
        gain
      });
    }
  }
  for (const lane of audioPublishPlan([sec]).own) {
    if (lane.offsetSec >= durationSec) continue;
    out.push({ kind: 'track', src: lane.src, atSec: lane.offsetSec, gain: lane.gain / 100 });
  }
  return out;
}

function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = Float32Array.from(buffer.getChannelData(ch));
    data.reverse();
    out.copyToChannel(data, ch);
  }
  return out;
}

/**
 * Render the page's sound for `durationSec`. `videoSrcByLayerId` maps each video layer
 * to the file the picture was drawn from. Null when nothing is audible.
 */
export async function mixPageAudio(params: {
  section: PenSectionContent;
  durationSec: number;
  videoSrcByLayerId: Record<string, string>;
}): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const plan = pageAudioPlan(params.section, params.durationSec);
  if (!plan.length) return null;
  const ctx = new OfflineAudioContext(
    PAGE_AUDIO_CHANNELS,
    Math.max(1, Math.ceil(params.durationSec * PAGE_AUDIO_SAMPLE_RATE)),
    PAGE_AUDIO_SAMPLE_RATE
  );
  const decoded = new Map<string, AudioBuffer | null>();
  const reversed = new Map<string, AudioBuffer>();
  const decode = async (url: string): Promise<AudioBuffer | null> => {
    if (!decoded.has(url)) {
      try {
        const res = await fetch(url);
        decoded.set(url, res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : null);
      } catch {
        decoded.set(url, null);
      }
    }
    return decoded.get(url) ?? null;
  };

  let placed = 0;
  for (const seg of plan) {
    const url =
      seg.kind === 'video'
        ? params.videoSrcByLayerId[seg.layerId]
        : (await resolvePenMediaSrc(seg.src)) || seg.src;
    if (!url) continue;
    const buffer = await decode(url);
    if (!buffer) continue;
    const node = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = seg.gain;
    node.connect(gain).connect(ctx.destination);
    if (seg.kind === 'video') {
      let source = buffer;
      let offset = seg.sourceSec;
      if (seg.reversed) {
        if (!reversed.has(url)) reversed.set(url, reverseBuffer(ctx, buffer));
        source = reversed.get(url)!;
        offset = buffer.duration - seg.sourceSec;
      }
      if (offset >= source.duration) continue;
      node.buffer = source;
      node.playbackRate.value = seg.rate;
      node.start(seg.atSec, Math.max(0, offset));
      node.stop(seg.atSec + seg.durationSec);
    } else {
      node.buffer = buffer;
      node.start(seg.atSec);
    }
    placed += 1;
  }
  if (!placed) return null;
  return ctx.startRendering();
}
