import { describe, expect, it } from 'vitest';
import { copyWidgetLayersIntoSection } from './layers.js';
import {
  applyLayoutAtPlayhead,
  applyTransitionPreset,
  joinLayerToTrack,
  layerMediaTime,
  reorderTimelineLayer,
  trackJoinPoints,
  resolveTimelineDuration,
  sampleLayerAt,
  sampleSectionLayers,
  sectionHasMotion,
  setKeyframeEase,
  splitLayerAt
} from './layerMotion.js';
import { emptySection } from './richDoc.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

function layer(partial: Partial<PenPageLayer> & Pick<PenPageLayer, 'id'>): PenPageLayer {
  return {
    kind: 'text',
    x: 0,
    y: 0,
    w: 40,
    h: 20,
    zIndex: 1,
    ...partial
  };
}

function section(layers: PenPageLayer[]): PenSectionContent {
  return { ...emptySection('body'), layers };
}

describe('sampleLayerAt', () => {
  it('holds the first key before it and the last key after it', () => {
    const mark = layer({
      id: 'mark',
      x: 0,
      motion: { keys: [{ t: 1, x: 10 }] }
    });
    expect(sampleLayerAt(mark, 0).x).toBe(10);
    expect(sampleLayerAt(mark, 5).x).toBe(10);
    expect(mark.x).toBe(0);
  });

  it('samples a keyed temp between two keys', () => {
    const mark = layer({
      id: 'grade',
      kind: 'video',
      mediaFilter: { temp: 0 },
      motion: {
        keys: [
          { t: 0, mediaFilter: { temp: 0 } },
          { t: 1, mediaFilter: { temp: 100 }, ease: 'linear' }
        ]
      }
    });
    expect(sampleLayerAt(mark, 0.5).mediaFilter?.temp).toBe(50);
    expect(mark.mediaFilter?.temp).toBe(0);
  });

  it('interpolates linearly between keys', () => {
    const mark = layer({
      id: 'mark',
      motion: {
        keys: [
          { t: 0, x: 0, ease: 'linear' },
          { t: 2, x: 20 }
        ]
      }
    });
    expect(sampleLayerAt(mark, 1).x).toBe(10);
  });

  it('eases in and out across the span leaving a key', () => {
    const mark = layer({
      id: 'mark',
      motion: {
        keys: [
          { t: 0, x: 0, ease: 'easeInOut' },
          { t: 1, x: 100 }
        ]
      }
    });
    expect(sampleLayerAt(mark, 0.25).x).toBeCloseTo(15.625, 3);
    expect(sampleLayerAt(mark, 0.5).x).toBeCloseTo(50, 3);
  });

  it('holds the leaving key until the next key', () => {
    const mark = layer({
      id: 'mark',
      motion: {
        keys: [
          { t: 0, x: 0, ease: 'hold' },
          { t: 1, x: 100 }
        ]
      }
    });
    expect(sampleLayerAt(mark, 0.9).x).toBe(0);
    expect(sampleLayerAt(mark, 1).x).toBe(100);
  });

  it('cubic-in is slower than linear at the midpoint', () => {
    const curved = layer({
      id: 'mark',
      motion: {
        keys: [
          { t: 0, x: 0, ease: 'cubicIn' },
          { t: 1, x: 100 }
        ]
      }
    });
    const linear = layer({
      id: 'mark',
      motion: {
        keys: [
          { t: 0, x: 0, ease: 'linear' },
          { t: 1, x: 100 }
        ]
      }
    });
    expect(sampleLayerAt(curved, 0.5).x).toBeCloseTo(12.5, 3);
    expect(sampleLayerAt(curved, 0.5).x).toBeLessThan(sampleLayerAt(linear, 0.5).x);
  });

  it('sets the ease on the key you leave', () => {
    const mark = layer({
      id: 'mark',
      motion: {
        keys: [
          { t: 0, x: 0 },
          { t: 1, x: 100 }
        ]
      }
    });
    const next = setKeyframeEase(mark, 0.4, 'cubicIn');
    expect(next.motion?.keys[0]?.ease).toBe('cubicIn');
    expect(next.motion?.keys[0]?.t).toBe(0);
    expect(next.motion?.keys[1]?.x).toBe(100);
    const lone = layer({ id: 'mark', motion: { keys: [{ t: 0, x: 0 }] } });
    expect(setKeyframeEase(lone, 0.4, 'linear').motion?.keys[0]?.ease).toBeUndefined();
  });

  it('leaves unkeyed properties on the rest pose', () => {
    const mark = layer({
      id: 'mark',
      x: 4,
      y: 9,
      motion: { keys: [{ t: 0, opacity: 10 }, { t: 1, opacity: 80 }] }
    });
    const at = sampleLayerAt(mark, 0.5);
    expect(at.x).toBe(4);
    expect(at.y).toBe(9);
    expect(at.opacity).toBe(45);
  });

  it('loops child keys on the widget group clock', () => {
    const doc = section([
      layer({ id: 'g', kind: 'group', durationSec: 2, w: 100, h: 80 }),
      layer({
        id: 'mark',
        parentGroupId: 'g',
        motion: {
          keys: [
            { t: 0, x: 0 },
            { t: 1, x: 10, ease: 'linear' }
          ]
        }
      })
    ]);
    const at = sampleSectionLayers(doc, 3).find((item) => item.id === 'mark');
    expect(at?.x).toBe(10);
    expect(sectionHasMotion(doc)).toBe(true);
  });
});

describe('timeline duration and layout writes', () => {
  it('uses an explicit clock, then a video hint, then the last key, then 5s', () => {
    const keyed = section([
      layer({ id: 'mark', motion: { keys: [{ t: 3, x: 1 }] } })
    ]);
    expect(resolveTimelineDuration(keyed)).toBe(3);
    expect(resolveTimelineDuration(keyed, { mark: 8 })).toBe(8);
    expect(resolveTimelineDuration({ ...keyed, timelineDurationSec: 12 })).toBe(12);
    expect(resolveTimelineDuration(section([layer({ id: 'still' })]))).toBe(5);
  });

  it('writes a drag onto the key at the playhead and leaves the rest pose', () => {
    const doc = section([
      layer({
        id: 'mark',
        x: 10,
        motion: {
          keys: [
            { t: 0, x: 10 },
            { t: 1, x: 40 }
          ]
        }
      })
    ]);
    const next = applyLayoutAtPlayhead(
      doc,
      [{ id: 'mark', x: 25, y: 0, w: 40, h: 20, zIndex: 1 }],
      1
    );
    const mark = next.layers?.find((item) => item.id === 'mark');
    expect(mark?.x).toBe(10);
    expect(mark?.motion?.keys.find((key) => key.t === 1)?.x).toBe(25);
    expect(sampleLayerAt(mark!, 1).x).toBe(25);
  });
});

describe('transition presets', () => {
  const doc = section([
    layer({
      id: 'a',
      x: 0,
      y: 0,
      w: 80,
      h: 40,
      opacity: 100,
      inSec: 0,
      outSec: 1,
      timelineTrackId: 'row',
      motion: { keys: [{ t: 0, x: 4 }] }
    }),
    layer({
      id: 'b',
      x: 0,
      y: 0,
      w: 80,
      h: 40,
      opacity: 100,
      inSec: 1,
      outSec: 2,
      timelineTrackId: 'row'
    })
  ]);

  it('stores a crossfade on the incoming clip and samples it across the join', () => {
    const next = applyTransitionPreset(doc, 'a', 'b', 'crossfade', { durationSec: 0.5 });
    const a = next.layers?.find((item) => item.id === 'a');
    const b = next.layers?.find((item) => item.id === 'b');
    expect(b?.transitionIn).toEqual({ preset: 'crossfade', durationSec: 0.5 });
    expect(a?.motion?.keys).toEqual([{ t: 0, x: 4 }]);
    expect(a?.outSec).toBe(1);
    expect(b?.inSec).toBe(1);
    expect(b?.motion).toBeUndefined();
    const start = sampleSectionLayers(next, 0.75);
    const end = sampleSectionLayers(next, 1.25);
    expect(start.find((item) => item.id === 'a')?.opacity).toBeCloseTo(100);
    expect(start.find((item) => item.id === 'b')?.opacity).toBeCloseTo(0);
    expect(end.find((item) => item.id === 'a')?.opacity).toBeCloseTo(0);
    expect(end.find((item) => item.id === 'b')?.opacity).toBeCloseTo(100);
  });

  it('slide moves the two layers across the join without writing keys', () => {
    const next = applyTransitionPreset(doc, 'a', 'b', 'slide', { durationSec: 0.5 });
    const start = sampleSectionLayers(next, 0.75);
    const end = sampleSectionLayers(next, 1.25);
    expect(start.find((item) => item.id === 'a')?.x).toBeCloseTo(4);
    expect(end.find((item) => item.id === 'a')?.x).toBeCloseTo(-76);
    expect(start.find((item) => item.id === 'b')?.x).toBeCloseTo(84);
    expect(end.find((item) => item.id === 'b')?.x).toBeCloseTo(4);
    expect(next.layers?.find((item) => item.id === 'a')?.motion?.keys).toEqual([{ t: 0, x: 4 }]);
  });

  it('switching the preset replaces the previous one and leaves user keys', () => {
    const faded = applyTransitionPreset(doc, 'a', 'b', 'crossfade', { durationSec: 0.5 });
    const slid = applyTransitionPreset(faded, 'a', 'b', 'slide', { durationSec: 0.5 });
    const a = slid.layers?.find((item) => item.id === 'a');
    const b = slid.layers?.find((item) => item.id === 'b');
    expect(b?.transitionIn?.preset).toBe('slide');
    expect(a?.motion?.keys).toEqual([{ t: 0, x: 4 }]);
    expect(b?.motion).toBeUndefined();
  });

  it('dip and zoom sample across the join and keep the clocks', () => {
    const seq = section([
      layer({ id: 'a', x: 0, y: 0, w: 80, h: 40, inSec: 0, outSec: 2, timelineTrackId: 'row' }),
      layer({ id: 'b', x: 0, y: 0, w: 80, h: 40, inSec: 2, outSec: 4, timelineTrackId: 'row' })
    ]);
    const dipped = applyTransitionPreset(seq, 'a', 'b', 'dip', { durationSec: 0.4 });
    const a = dipped.layers?.find((item) => item.id === 'a');
    const b = dipped.layers?.find((item) => item.id === 'b');
    expect(a?.outSec).toBe(2);
    expect(b?.inSec).toBe(2);
    const mid = sampleSectionLayers(dipped, 2);
    expect(mid.find((item) => item.id === 'a')?.opacity).toBeCloseTo(0);
    expect(mid.find((item) => item.id === 'b')?.opacity).toBeCloseTo(0);
    const zoomed = applyTransitionPreset(seq, 'a', 'b', 'zoom', { durationSec: 0.4 });
    const end = sampleSectionLayers(zoomed, 2.2);
    expect(end.find((item) => item.id === 'a')?.mediaScale).toBeCloseTo(140);
  });
});

describe('timeline tracks', () => {
  it('joins a clip onto a track so it starts when the previous clip ends', () => {
    const doc = section([
      layer({ id: 'a', kind: 'video', inSec: 0, outSec: 2 }),
      layer({ id: 'b', kind: 'video', inSec: 0, outSec: 3 })
    ]);
    const next = joinLayerToTrack(doc, 'b', 'a');
    const a = next.layers?.find((item) => item.id === 'a');
    const b = next.layers?.find((item) => item.id === 'b');
    expect(a?.timelineTrackId).toBe('a');
    expect(b?.timelineTrackId).toBe('a');
    expect(b?.inSec).toBe(2);
    expect(b?.outSec).toBe(5);
  });

  it('reorders a row above another, and lifts a shared clip onto its own row', () => {
    const doc = section([
      layer({ id: 'a', zIndex: 1 }),
      layer({ id: 'b', zIndex: 2 }),
      layer({ id: 'c', zIndex: 3 })
    ]);
    const order = (next: PenSectionContent) =>
      [...(next.layers || [])].sort((a, b) => a.zIndex - b.zIndex).map((item) => item.id);
    expect(order(reorderTimelineLayer(doc, 'c', 'a'))).toEqual(['c', 'a', 'b']);
    const shared = joinLayerToTrack(doc, 'b', 'a');
    const lifted = reorderTimelineLayer(shared, 'b', 'c');
    const b = lifted.layers?.find((item) => item.id === 'b');
    const c = lifted.layers?.find((item) => item.id === 'c');
    expect(b?.timelineTrackId).not.toBe('a');
    expect((b?.zIndex || 0) < (c?.zIndex || 0)).toBe(true);
  });

  it('marks the meeting point of two clips on one track', () => {
    const doc = section([
      layer({ id: 'a', kind: 'video', inSec: 0, outSec: 2 }),
      layer({ id: 'b', kind: 'video', inSec: 0, outSec: 3 })
    ]);
    const joined = joinLayerToTrack(doc, 'b', 'a');
    expect(trackJoinPoints(joined)).toEqual([
      { trackId: 'a', atSec: 2, fromId: 'a', toId: 'b', durationSec: 0.5 }
    ]);
  });

  it('walks a reversed clip from its end back to the source start', () => {
    const clip = layer({ id: 'a', kind: 'video', inSec: 0, outSec: 4, mediaReversed: true });
    expect(layerMediaTime(clip, 0, 1, 4)).toBeCloseTo(4);
    expect(layerMediaTime(clip, 4, 1, 4)).toBeCloseTo(0);
  });
});

describe('splitLayerAt', () => {
  it('cuts one clip into two pieces on the same track', () => {
    const doc = section([
      layer({ id: 'clip', kind: 'video', videoSrc: 'penlocal:a', inSec: 0, outSec: 4 })
    ]);
    const next = splitLayerAt(doc, 'clip', 1.5);
    expect(next.layers).toHaveLength(1);
    const clips = next.layers?.[0]?.clips || [];
    expect(clips).toHaveLength(2);
    expect(clips[0]?.outSec).toBe(1.5);
    expect(clips[1]?.inSec).toBe(1.5);
    expect(clips[1]?.outSec).toBe(4);
    expect(layerMediaTime(next.layers![0]!, 1.5, 1, 4)).toBeCloseTo(1.5);
    expect(doc.layers).toHaveLength(1);
  });

  it('leaves the clip unchanged when the playhead is outside it', () => {
    const doc = section([layer({ id: 'clip', kind: 'video', inSec: 1, outSec: 2 })]);
    expect(splitLayerAt(doc, 'clip', 0).layers).toHaveLength(1);
  });
});

describe('copyWidgetLayersIntoSection motion', () => {
  it('places the copied sample at the authored key plus the placement delta', () => {
    const source: PenPageLayer[] = [
      layer({ id: 'g', kind: 'group', x: 0, y: 0, w: 120, h: 80, durationSec: 2 }),
      layer({
        id: 'mark',
        x: 40,
        y: 20,
        w: 50,
        h: 20,
        parentGroupId: 'g',
        spreadsheetId: 'sheet_author',
        motion: {
          keys: [
            { t: 0, x: 40, y: 20 },
            { t: 1, x: 90, y: 20, ease: 'linear' }
          ]
        }
      })
    ];
    const { section: copied, groupId } = copyWidgetLayersIntoSection(
      emptySection('body'),
      source,
      'Widget'
    );
    const group = copied.layers?.find((item) => item.id === groupId);
    const kid = copied.layers?.find((item) => item.parentGroupId === groupId);
    expect(group?.durationSec).toBe(2);
    expect(JSON.stringify(copied)).not.toContain('sheet_author');
    expect(kid?.motion?.keys).toHaveLength(2);
    expect(kid?.x).toBe(16);
    expect(sampleLayerAt(kid!, 1).x).toBe(66);
  });
});
