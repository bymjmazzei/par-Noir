import { describe, expect, it } from 'vitest';
import {
  clampMediaCrop,
  applyCropWindow,
  mediaCropClipCss,
  mediaCropEdges,
  mediaCropFromEdges,
  mediaCropFrameStyle,
  mediaMaskStyle,
  mediaFilterCss,
  mediaMaskClipCss,
  mediaTransformCss,
  MEDIA_FILTER_PRESETS,
  mergeMediaFilter
} from './mediaStyle.js';

describe('mediaStyle', () => {
  it('clampMediaCrop keeps a valid 0–1 window', () => {
    const c = clampMediaCrop({ x: -0.2, y: 0.9, w: 2, h: 0.05 });
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(1.0001);
    expect(c.y + c.h).toBeLessThanOrEqual(1.0001);
    expect(c.w).toBeGreaterThanOrEqual(0.05);
  });

  it('mediaFilterCss emits CSS only for non-default values', () => {
    expect(mediaFilterCss({ mediaFilter: MEDIA_FILTER_PRESETS.none })).toBeUndefined();
    const css = mediaFilterCss({
      mediaFilter: { brightness: 110, contrast: 90 },
      blur: 2
    });
    expect(css).toContain('brightness(110%)');
    expect(css).toContain('contrast(90%)');
    expect(css).toContain('blur(2px)');
  });

  it('mediaCropClipCss is undefined for full frame', () => {
    expect(mediaCropClipCss({ x: 0, y: 0, w: 1, h: 1 })).toBeUndefined();
    expect(mediaCropClipCss({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toMatch(/^inset\(/);
  });

  it('mediaMaskClipCss covers presets', () => {
    expect(mediaMaskClipCss('none')).toBeUndefined();
    expect(mediaMaskClipCss('circle')).toContain('circle');
    expect(mediaMaskClipCss('rounded')).toContain('inset');
  });

  it('a crop window moves the frame and leaves the picture where it was', () => {
    const next = applyCropWindow(
      { x: 100, y: 100, w: 200, h: 400 },
      { x: 0.25, y: 0, w: 0.5, h: 1 }
    );
    expect(next.x).toBeCloseTo(150);
    expect(next.y).toBeCloseTo(100);
    expect(next.w).toBeCloseTo(100);
    expect(next.h).toBeCloseTo(400);
    const frame = mediaCropFrameStyle(next.mediaCrop);
    const pictureLeft = next.x + (parseFloat(frame!.left) / 100) * next.w;
    expect(pictureLeft).toBeCloseTo(100);
  });

  it('split, filmstrip, and text masks use a mask image', () => {
    expect(mediaMaskStyle('split', 100).maskImage).toContain('linear-gradient');
    expect(mediaMaskStyle('filmstrip', 100).maskImage).toContain('repeating-linear-gradient');
    expect(String(mediaMaskStyle('text', 120).maskImage)).toContain('text');
    expect(Object.keys(MEDIA_FILTER_PRESETS).length).toBeGreaterThan(8);
  });

  it('a left crop keeps the right edge', () => {
    const next = mediaCropFromEdges({ ...mediaCropEdges(undefined), left: 0.2 }, 'left');
    expect(next.x).toBeCloseTo(0.2);
    expect(next.w).toBeCloseTo(0.8);
    expect(mediaCropEdges(next).right).toBeCloseTo(0);
  });

  it('mask size changes the clip path', () => {
    expect(mediaMaskClipCss('circle', 50)).toBe('circle(25% at 50% 50%)');
    expect(mediaMaskClipCss('rounded', 80)).toBe('inset(10% round 12%)');
    expect(mediaMaskClipCss('rect', 60)).toBe('inset(20%)');
    expect(mediaMaskClipCss('circle', 150)).toBe('circle(75% at 50% 50%)');
  });

  it('scale becomes a CSS transform', () => {
    expect(mediaTransformCss({ mediaScale: 100 })).toBeUndefined();
    expect(mediaTransformCss({ mediaScale: 200 })).toBe(
      'translate(0%, 0%) rotate(0deg) scale(2, 2)'
    );
    expect(mediaTransformCss({ mediaScale: 100, mediaMirror: true })).toContain('scale(-1, 1)');
  });

  it('mergeMediaFilter fills defaults', () => {
    expect(mergeMediaFilter({ brightness: 80 }).contrast).toBe(100);
  });
});
