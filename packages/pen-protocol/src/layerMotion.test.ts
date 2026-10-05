import { describe, expect, it } from 'vitest';
import { copyWidgetLayersIntoSection } from './layers.js';
import {
  applyLayoutAtPlayhead,
  applyMotionPreset,
  applyTransitionPreset,
  applyVideoFileDuration,
  joinLayerToTrack,
  layerClips,
  layerMediaTime,
  reorderTimelineLayer,
  closeTrackGaps,
  clearClipTransition,
  trackJoinPoints,
  resolveTimelineDuration,
  sampleLayerAt,
  sampleSectionLayers,
  sectionHasMotion,
  setKeyframeEase,
  detachClipAsLayer,
  moveClipBy,
  moveClipToTrack,
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

  it('holds the intro end unless the layer loops', () => {
    const keys = [
      { t: 0, x: 0 },
      { t: 1, x: 10, ease: 'linear' as const }
    ];
    const held = section([
      layer({ id: 'g', kind: 'group', durationSec: 2, w: 100, h: 80 }),
      layer({ id: 'mark', parentGroupId: 'g', motion: { keys } })
    ]);
    const looping = section([
      layer({ id: 'g', kind: 'group', durationSec: 2, w: 100, h: 80 }),
      layer({ id: 'mark', parentGroupId: 'g', motion: { keys, loop: true } })
    ]);
    expect(sampleSectionLayers(held, 2.5).find((item) => item.id === 'mark')?.x).toBe(10);
    expect(sampleSectionLayers(looping, 2.5).find((item) => item.id === 'mark')?.x).toBe(5);
  });
});

describe('timeline duration and layout writes', () => {
  it('keeps the default clock when the first key is inside it', () => {
    const keyed = section([
      layer({ id: 'mark', motion: { keys: [{ t: 3, x: 1 }] } })
    ]);
    expect(resolveTimelineDuration(keyed)).toBe(5);
    expect(
      resolveTimelineDuration(section([layer({ id: 'mark', motion: { keys: [{ t: 8, x: 1 }] } })]))
    ).toBe(8);
    expect(resolveTimelineDuration(keyed, { mark: 8 })).toBe(8);
    expect(resolveTimelineDuration({ ...keyed, timelineDurationSec: 12 })).toBe(12);
    expect(resolveTimelineDuration(section([layer({ id: 'still' })]))).toBe(5);
    expect(resolveTimelineDuration(section([layer({ id: 'clip', kind: 'video', outSec: 2 })]))).toBe(2);
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
    // Front is the top row. Moving c in front of a leaves b in front of both.
    expect(order(reorderTimelineLayer(doc, 'c', 'a'))).toEqual(['a', 'c', 'b']);
    const shared = joinLayerToTrack(doc, 'b', 'a');
    const lifted = reorderTimelineLayer(shared, 'b', 'c');
    const b = lifted.layers?.find((item) => item.id === 'b');
    const c = lifted.layers?.find((item) => item.id === 'c');
    expect(b?.timelineTrackId).not.toBe('a');
    expect((b?.zIndex || 0) > (c?.zIndex || 0)).toBe(true);
  });

  it('reorders children inside a group without touching the page stack', () => {
    const doc = section([
      layer({ id: 'page', zIndex: 50 }),
      layer({ id: 'g', kind: 'group', zIndex: 40 }),
      layer({ id: 'a', parentGroupId: 'g', zIndex: 1 }),
      layer({ id: 'b', parentGroupId: 'g', zIndex: 2 })
    ]);
    const next = reorderTimelineLayer(doc, 'a', 'b', 'g');
    const a = next.layers?.find((item) => item.id === 'a');
    const b = next.layers?.find((item) => item.id === 'b');
    const page = next.layers?.find((item) => item.id === 'page');
    expect((a?.zIndex || 0) > (b?.zIndex || 0)).toBe(true);
    expect(page?.zIndex).toBe(50);
    expect(reorderTimelineLayer(doc, 'a', null)).toBe(doc);
  });

  it('slides a clip and swaps it past the piece in front of it', () => {
    const doc = section([
      layer({
        id: 'clip',
        kind: 'video',
        clips: [
          { id: 'left', inSec: 0, outSec: 2 },
          { id: 'right', inSec: 2, outSec: 4 }
        ]
      })
    ]);
    const shifted = moveClipBy(doc, 'clip', 'right', 1);
    expect(shifted.layers?.[0]?.clips?.map((clip) => clip.inSec)).toEqual([0, 3]);
    const swapped = moveClipBy(doc, 'clip', 'right', -2);
    expect(swapped.layers?.[0]?.clips?.map((clip) => [clip.id, clip.inSec, clip.outSec])).toEqual([
      ['right', 0, 2],
      ['left', 2, 4]
    ]);
  });

  it('moves one piece onto another track', () => {
    const doc = section([
      layer({ id: 'host', kind: 'video', inSec: 0, outSec: 2 }),
      layer({
        id: 'clip',
        kind: 'video',
        timelineTrackId: 'row',
        clips: [
          { id: 'stay', inSec: 0, outSec: 1 },
          { id: 'go', inSec: 1, outSec: 3 }
        ]
      })
    ]);
    const next = moveClipToTrack(doc, 'clip', 'go', 'host');
    const created = next.layers?.find((item) => item.clips?.[0]?.id === 'go');
    const source = next.layers?.find((item) => item.id === 'clip');
    expect(source?.clips?.map((clip) => clip.id)).toEqual(['stay']);
    expect(created?.timelineTrackId).toBe('host');
    expect(created?.inSec).toBe(2);
  });

  it('marks the meeting point of two clips on one track', () => {
    const doc = section([
      layer({ id: 'a', kind: 'video', inSec: 0, outSec: 2 }),
      layer({ id: 'b', kind: 'video', inSec: 0, outSec: 3 })
    ]);
    const joined = joinLayerToTrack(doc, 'b', 'a');
    expect(trackJoinPoints(joined)).toEqual([
      { trackId: 'a', atSec: 2, fromId: 'a', toId: 'b', durationSec: 0.5, preset: null }
    ]);
  });

  it('keeps a join across a gap and reports a preset only after one is stored', () => {
    const gapped = section([
      layer({ id: 'a', kind: 'video', inSec: 0, outSec: 2, timelineTrackId: 'main' }),
      layer({ id: 'b', kind: 'video', inSec: 5, outSec: 8, timelineTrackId: 'main' })
    ]);
    expect(trackJoinPoints(gapped)).toEqual([
      { trackId: 'main', atSec: 3.5, fromId: 'a', toId: 'b', durationSec: 0.5, preset: null }
    ]);
    const faded = applyTransitionPreset(gapped, 'a', 'b', 'crossfade', { durationSec: 0.4 });
    expect(trackJoinPoints(faded)[0]?.preset).toBe('crossfade');
    expect(clearClipTransition(faded, 'b').layers?.find((item) => item.id === 'b')?.transitionIn).toBeUndefined();
  });

  it('closes gaps on the main track and leaves an overlay gap', () => {
    const doc = section([
      layer({ id: 'a', kind: 'video', inSec: 0, outSec: 2, timelineTrackId: 'main', zIndex: 1 }),
      layer({ id: 'b', kind: 'video', inSec: 5, outSec: 8, timelineTrackId: 'main', zIndex: 1 }),
      layer({ id: 'over', kind: 'video', inSec: 1, outSec: 2, timelineTrackId: 'over', zIndex: 2 })
    ]);
    const next = closeTrackGaps(doc, 'main');
    const a = next.layers?.find((item) => item.id === 'a');
    const b = next.layers?.find((item) => item.id === 'b');
    const over = next.layers?.find((item) => item.id === 'over');
    expect(a?.inSec).toBe(0);
    expect(a?.outSec).toBe(2);
    expect(b?.inSec).toBe(2);
    expect(b?.outSec).toBe(5);
    expect(over?.inSec).toBe(1);
    expect(over?.outSec).toBe(2);
    const packed = section([
      layer({
        id: 'row',
        kind: 'video',
        timelineTrackId: 'main',
        clips: [
          { id: 'left', inSec: 1, outSec: 2 },
          { id: 'right', inSec: 4, outSec: 6 }
        ]
      })
    ]);
    const closed = closeTrackGaps(packed, 'main');
    expect(closed.layers?.[0]?.clips?.map((clip) => [clip.id, clip.inSec, clip.outSec])).toEqual([
      ['left', 1, 2],
      ['right', 2, 4]
    ]);
  });

  it('walks a reversed clip from its end back to the source start', () => {
    const clip = layer({ id: 'a', kind: 'video', inSec: 0, outSec: 4, mediaReversed: true });
    expect(layerMediaTime(clip, 0, 1, 4)).toBeCloseTo(4);
    expect(layerMediaTime(clip, 4, 1, 4)).toBeCloseTo(0);
  });
});

describe('video file length', () => {
  it('sizes a new video to the file and grows a shorter clock', () => {
    const doc = section([layer({ id: 'clip', kind: 'video', videoSrc: 'penlocal:a' })]);
    doc.timelineDurationSec = 5;
    const next = applyVideoFileDuration(doc, 'clip', 12);
    const clip = next.layers?.find((item) => item.id === 'clip');
    expect(clip?.inSec).toBe(0);
    expect(clip?.outSec).toBe(12);
    expect(clip?.sourceDurationSec).toBe(12);
    expect(resolveTimelineDuration(next)).toBe(12);
    expect(layerClips(clip!, 12)[0]?.outSec).toBe(12);
  });

  it('leaves a longer clock in place and does not rewrite a trim', () => {
    const doc = section([
      layer({
        id: 'clip',
        kind: 'video',
        videoSrc: 'penlocal:a',
        inSec: 1,
        outSec: 3,
        sourceDurationSec: 8
      })
    ]);
    doc.timelineDurationSec = 20;
    const next = applyVideoFileDuration(doc, 'clip', 8);
    expect(next.layers?.[0]?.outSec).toBe(3);
    expect(resolveTimelineDuration(next)).toBe(20);
    const fresh = section([layer({ id: 'text', kind: 'text' })]);
    expect(layerClips(fresh.layers![0]!, 5)[0]?.outSec).toBe(5);
  });
});

describe('splitLayerAt', () => {
  it('cuts one clip into two layers on the same track', () => {
    const doc = section([
      layer({ id: 'clip', kind: 'video', videoSrc: 'penlocal:a', inSec: 0, outSec: 4 })
    ]);
    const next = splitLayerAt(doc, 'clip', 1.5);
    expect(next.layers).toHaveLength(2);
    const left = next.layers?.find((item) => item.id === 'clip');
    const right = next.layers?.find((item) => item.id !== 'clip');
    expect(left?.outSec).toBe(1.5);
    expect(left?.clips).toBeUndefined();
    expect(right?.inSec).toBe(1.5);
    expect(right?.outSec).toBe(4);
    expect(right?.sourceInSec).toBe(1.5);
    expect(right?.videoSrc).toBe('penlocal:a');
    expect(right?.timelineTrackId).toBe(left?.timelineTrackId);
    expect(trackJoinPoints(next)).toEqual([
      { trackId: 'clip', atSec: 1.5, fromId: 'clip', toId: right!.id, durationSec: 0.5, preset: null }
    ]);
    expect(layerMediaTime(right!, 1.5, 1, 4)).toBeCloseTo(1.5);
    expect(doc.layers).toHaveLength(1);
  });

  it('leaves the clip unchanged when the playhead is outside it', () => {
    const doc = section([layer({ id: 'clip', kind: 'video', inSec: 1, outSec: 2 })]);
    expect(splitLayerAt(doc, 'clip', 0).layers).toHaveLength(1);
  });

  it('copies one split piece onto its own layer', () => {
    const doc = section([
      layer({
        id: 'clip',
        kind: 'video',
        videoSrc: 'penlocal:a',
        timelineTrackId: 'row-a',
        clips: [
          { id: 'left', inSec: 0, outSec: 1.5, sourceInSec: 0 },
          { id: 'right', inSec: 1.5, outSec: 4, sourceInSec: 1.5 }
        ]
      })
    ]);
    const moved = detachClipAsLayer(doc, 'clip', 'right');
    expect(moved).not.toBeNull();
    expect(moved!.section.layers).toHaveLength(2);
    const source = moved!.section.layers?.find((item) => item.id === 'clip');
    const created = moved!.section.layers?.find((item) => item.id === moved!.layerId);
    expect(source?.clips?.map((clip) => clip.id)).toEqual(['left']);
    expect(created?.clips).toEqual([{ id: 'right', inSec: 1.5, outSec: 4, sourceInSec: 1.5 }]);
    expect(created?.videoSrc).toBe('penlocal:a');
    expect(created?.timelineTrackId).toBeTruthy();
    expect(created?.timelineTrackId).not.toBe(source?.timelineTrackId);
    expect(detachClipAsLayer(doc, 'clip', 'missing')).toBeNull();
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

  it('In is invisible at the start and visible after 0.4s', () => {
    const host = section([layer({ id: 't', opacity: 100, motion: { keys: [{ t: 1, x: 8 }] } })]);
    const faded = applyMotionPreset(host.layers![0]!, 'in');
    expect(faded.motion?.animation).toBe('in');
    expect(faded.motion?.keys).toEqual([{ t: 1, x: 8 }]);
    expect(sampleLayerAt(faded, 0).opacity).toBe(0);
    expect(sampleLayerAt(faded, 0.4).opacity).toBe(100);
    expect(sampleLayerAt(faded, 1).x).toBe(8);
    const out = applyMotionPreset(host.layers![0]!, 'out');
    expect(sampleLayerAt(out, 0).opacity).toBe(100);
    expect(sampleLayerAt(out, 5).opacity).toBe(0);
    const both = applyMotionPreset(host.layers![0]!, 'both');
    expect(sampleLayerAt(both, 0).opacity).toBe(0);
    expect(sampleLayerAt(both, 5).opacity).toBe(0);
    const rise = applyMotionPreset(host.layers![0]!, 'rise');
    expect(rise.motion?.keys).toEqual([{ t: 1, x: 8 }]);
    expect(sampleLayerAt(rise, 0.4).y).toBe(0);
    const pop = applyMotionPreset(host.layers![0]!, 'pop');
    expect(sampleLayerAt(pop, 0).w).toBeLessThan(40);
    expect(sampleLayerAt(pop, 0.4).w).toBe(40);
    expect(sampleLayerAt(pop, 0.4).h).toBe(20);
    expect(applyMotionPreset(faded, null).motion?.animation).toBeUndefined();
  });
});
