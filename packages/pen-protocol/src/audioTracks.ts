/**
 * Extra audio lanes on a media layer.
 * Own files publish as companion audio. One licensed doc per post is musicPenDocId.
 */

import type { PenAudioTrack, PenSectionContent } from './types.js';

export type OwnAudioLane = {
  src: string;
  offsetSec: number;
  gain: number;
};

export type AudioPublishPlan = {
  /** Poster-owned audio, in lane order. */
  own: OwnAudioLane[];
  /** First licensed public audio doc. Later licensed lanes are ignored. */
  licensedDocId: string | null;
};

export function layerAudioTracks(tracks: PenAudioTrack[] | null | undefined): PenAudioTrack[] {
  return (tracks || []).filter((track) => track && typeof track.id === 'string' && track.id.length > 0);
}

/** Own bytes vs the one licensed root. Audio never marks the page as video. */
export function audioPublishPlan(
  sections: PenSectionContent[] | null | undefined
): AudioPublishPlan {
  const own: OwnAudioLane[] = [];
  let licensedDocId: string | null = null;
  for (const section of sections || []) {
    for (const layer of section.layers || []) {
      if (layer.visible === false) continue;
      for (const track of layerAudioTracks(layer.audioTracks)) {
        const src = typeof track.src === 'string' ? track.src.trim() : '';
        if (src) {
          own.push({
            src,
            offsetSec: Number.isFinite(track.offsetSec) ? Math.max(0, track.offsetSec || 0) : 0,
            gain: Number.isFinite(track.gain) ? Math.min(100, Math.max(0, track.gain ?? 100)) : 100
          });
        }
        const licensed = typeof track.licensedDocId === 'string' ? track.licensedDocId.trim() : '';
        if (licensed && !licensedDocId) licensedDocId = licensed;
      }
    }
  }
  return { own, licensedDocId };
}
