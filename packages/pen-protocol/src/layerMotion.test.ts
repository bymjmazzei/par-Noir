import { describe, expect, it } from 'vitest';
import { copyWidgetLayersIntoSection } from './layers.js';
import {
  applyLayoutAtPlayhead,
  applyTransitionPreset,
  resolveTimelineDuration,
  sampleLayerAt,
  sampleSectionLayers,
  sectionHasMotion,
  setKeyframeEase
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
    layer({ id: 'a', x: 0, w: 80, opacity: 100 }),
    layer({ id: 'b', x: 0, w: 80, opacity: 100 })
  ]);

  it('crossfade writes opacity keys on both layers', () => {
    const next = applyTransitionPreset(doc, 'a', 'b', 'crossfade', { atSec: 1, durationSec: 0.5 });
    const a = next.layers?.find((item) => item.id === 'a');
    const b = next.layers?.find((item) => item.id === 'b');
    expect(sampleLayerAt(a!, 1).opacity).toBe(100);
    expect(sampleLayerAt(b!, 1).opacity).toBe(0);
    expect(sampleLayerAt(a!, 1.5).opacity).toBe(0);
    expect(sampleLayerAt(b!, 1.5).opacity).toBe(100);
  });

  it('slide writes x keys that swap the two layers', () => {
    const next = applyTransitionPreset(doc, 'a', 'b', 'slide', { atSec: 1, durationSec: 0.5 });
    const a = next.layers?.find((item) => item.id === 'a');
    const b = next.layers?.find((item) => item.id === 'b');
    expect(sampleLayerAt(a!, 1).x).toBe(0);
    expect(sampleLayerAt(a!, 1.5).x).toBe(-80);
    expect(sampleLayerAt(b!, 1).x).toBe(80);
    expect(sampleLayerAt(b!, 1.5).x).toBe(0);
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
