import { describe, expect, it } from 'vitest';
import type { PenPageLayer } from '@par-noir/pen-protocol';
import {
  BACKGROUND_VIDEO_ID,
  PAGE_BACKGROUND_ID,
  PAGE_BODY_ID,
  PAGE_VIDEO_FPS,
  frameTimes,
  pagePaintOrder,
  splitPaintBands
} from './encodePageVideo';
import { safeBackgroundImage } from './rasterizePagePoster';

function layer(id: string, zIndex: number, over: Partial<PenPageLayer> = {}): PenPageLayer {
  return { id, kind: 'text', x: 0, y: 0, w: 10, h: 10, zIndex, ...over } as PenPageLayer;
}

const video = (id: string, zIndex: number) =>
  layer(id, zIndex, { kind: 'video', videoSrc: `blob:${id}` });

describe('frame schedule', () => {
  it('starts at timeline 0 and ends one frame before the loop point', () => {
    const times = frameTimes(2);
    expect(times).toHaveLength(2 * PAGE_VIDEO_FPS);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBeCloseTo(2 - 1 / PAGE_VIDEO_FPS, 9);
  });

  it('always has at least frame 0', () => {
    expect(frameTimes(0)).toEqual([0]);
  });
});

describe('paint bands', () => {
  it('splits still layers around two interleaved videos, bottom first', () => {
    const order = pagePaintOrder(
      [layer('title', 4), video('clipB', 3), layer('caption', 2), video('clipA', 1), layer('bg-art', 0)],
      { backgroundVideo: false }
    );
    expect(splitPaintBands(order)).toEqual({
      bands: [[PAGE_BACKGROUND_ID, PAGE_BODY_ID, 'bg-art'], ['caption'], ['title']],
      videos: ['clipA', 'clipB']
    });
  });

  it('puts the page background video under the body and every layer', () => {
    const { bands, videos } = splitPaintBands(
      pagePaintOrder([layer('text', 1)], { backgroundVideo: true })
    );
    expect(videos).toEqual([BACKGROUND_VIDEO_ID]);
    expect(bands).toEqual([[PAGE_BACKGROUND_ID], [PAGE_BODY_ID, 'text']]);
  });

  it('leaves action layers and hidden layers out of every band', () => {
    const order = pagePaintOrder(
      [
        layer('art', 1),
        layer('btn', 2, { kind: 'interactive', behavior: 'link.open' } as Partial<PenPageLayer>),
        layer('off', 3, { visible: false })
      ],
      { backgroundVideo: false }
    );
    expect(order.map((entry) => entry.id)).toEqual([PAGE_BACKGROUND_ID, PAGE_BODY_ID, 'art']);
  });
});

describe('safeBackgroundImage', () => {
  it('keeps gradients and blob/data urls, drops remote urls', () => {
    expect(safeBackgroundImage('linear-gradient(red, blue)')).toBe('linear-gradient(red, blue)');
    expect(safeBackgroundImage('url("blob:https://x/1")')).toBe('url("blob:https://x/1")');
    expect(safeBackgroundImage('url(https://cdn.example/a.jpg)')).toBeNull();
    expect(
      safeBackgroundImage('linear-gradient(red, blue), url(https://cdn.example/a.jpg)')
    ).toBeNull();
    expect(safeBackgroundImage('none')).toBeNull();
    expect(safeBackgroundImage('')).toBeNull();
  });
});
