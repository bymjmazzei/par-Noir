import { describe, expect, it } from 'vitest';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import { pageAudioPlan } from './mixPageAudio';

function page(layers: unknown[]): PenSectionContent {
  return { slug: 'p', doc: { type: 'doc', content: [] }, layers } as unknown as PenSectionContent;
}

const clip = (over: Record<string, unknown>) => ({
  id: 'clip',
  kind: 'video',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  zIndex: 1,
  videoSrc: 'blob:clip',
  mediaMuted: false,
  ...over
});

describe('page audio plan', () => {
  it('a file starting 2s in, placed 3s into the timeline, starts at 3s reading from 2s', () => {
    const plan = pageAudioPlan(
      page([clip({ inSec: 3, outSec: 6, sourceInSec: 2 })]),
      10
    );
    expect(plan).toEqual([
      {
        kind: 'video',
        layerId: 'clip',
        atSec: 3,
        sourceSec: 2,
        durationSec: 3,
        rate: 1,
        reversed: false,
        gain: 1
      }
    ]);
  });

  it('leaves muted video layers out (muted is the default)', () => {
    expect(pageAudioPlan(page([clip({ mediaMuted: true, inSec: 0, outSec: 2 })]), 5)).toEqual([]);
    expect(pageAudioPlan(page([clip({ mediaMuted: undefined, inSec: 0, outSec: 2 })]), 5)).toEqual([]);
  });

  it('a reversed clip reads backwards from the end of its source range', () => {
    const [seg] = pageAudioPlan(
      page([clip({ inSec: 0, outSec: 2, sourceInSec: 1, playbackRate: 2, mediaReversed: true })]),
      5
    );
    expect(seg).toMatchObject({ kind: 'video', atSec: 0, sourceSec: 5, durationSec: 2, rate: 2, reversed: true });
  });

  it('cuts at the page clock and adds own audio tracks at their offset and gain', () => {
    const plan = pageAudioPlan(
      page([
        clip({ inSec: 1, outSec: 9, mediaGain: 50 }),
        {
          id: 'img',
          kind: 'image',
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          zIndex: 2,
          imageSrc: 'blob:img',
          audioTracks: [
            { id: 'voice', src: 'data:audio/mpeg;base64,AA', offsetSec: 2, gain: 70 },
            { id: 'song', licensedDocId: 'music-doc' }
          ]
        }
      ]),
      4
    );
    expect(plan).toEqual([
      expect.objectContaining({ kind: 'video', atSec: 1, durationSec: 3, gain: 0.5 }),
      { kind: 'track', src: 'data:audio/mpeg;base64,AA', atSec: 2, gain: 0.7 }
    ]);
  });
});
