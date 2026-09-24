import { describe, expect, it } from 'vitest';
import {
  clampMediaCrop,
  mediaCropClipCss,
  mediaFilterCss,
  mediaMaskClipCss,
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

  it('mergeMediaFilter fills defaults', () => {
    expect(mergeMediaFilter({ brightness: 80 }).contrast).toBe(100);
  });
});
