import { describe, expect, it } from 'vitest';
import { audioPublishPlan } from './audioTracks.js';
import { partitionSectionsForPublish } from './composeVideo.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

function imageLayer(partial?: Partial<PenPageLayer>): PenPageLayer {
  return {
    id: 'img',
    kind: 'image',
    x: 0,
    y: 0,
    w: 90,
    h: 160,
    zIndex: 1,
    imageSrc: 'penlocal:still',
    ...partial
  };
}

describe('audio tracks', () => {
  it('keeps a still with audio out of the video partition', () => {
    const section: PenSectionContent = {
      slug: 'body',
      doc: { type: 'doc', content: [] },
      layers: [
        imageLayer({
          audioTracks: [
            { id: 'voice', src: 'penlocal:voice', offsetSec: 1, gain: 80 },
            { id: 'song', licensedDocId: 'music-doc-1' }
          ]
        })
      ]
    };
    const split = partitionSectionsForPublish([section]);
    expect(split.videoSections).toEqual([]);
    const plan = audioPublishPlan([section]);
    expect(plan.own).toEqual([{ src: 'penlocal:voice', offsetSec: 1, gain: 80 }]);
    expect(plan.licensedDocId).toBe('music-doc-1');
  });

  it('uses only the first licensed lane', () => {
    const section: PenSectionContent = {
      slug: 'body',
      doc: { type: 'doc', content: [] },
      layers: [
        imageLayer({
          audioTracks: [
            { id: 'a', licensedDocId: 'first' },
            { id: 'b', licensedDocId: 'second', src: 'penlocal:extra' }
          ]
        })
      ]
    };
    const plan = audioPublishPlan([section]);
    expect(plan.licensedDocId).toBe('first');
    expect(plan.own.map((lane) => lane.src)).toEqual(['penlocal:extra']);
  });
});
