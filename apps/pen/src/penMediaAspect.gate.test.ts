/**
 * Gate: video aspect comes from videoWidth/videoHeight, which browsers already report
 * after the file's rotation. Rotating again turns phone portrait video into 16:9 boxes.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { videoDisplayAspect } from './services/penMediaAspect';

const here = dirname(fileURLToPath(import.meta.url));

describe('video display aspect', () => {
  it('keeps a phone portrait video portrait', () => {
    expect(videoDisplayAspect({ videoWidth: 1080, videoHeight: 1920 })).toBeCloseTo(9 / 16);
  });

  it('keeps landscape landscape', () => {
    expect(videoDisplayAspect({ videoWidth: 1920, videoHeight: 1080 })).toBeCloseTo(16 / 9);
  });

  it('reports unknown before metadata loads', () => {
    expect(videoDisplayAspect({ videoWidth: 0, videoHeight: 0 })).toBeNull();
  });

  it('never re-applies the MP4 rotation matrix or caches the fallback', () => {
    const src = readFileSync(resolve(here, 'services/penMediaAspect.ts'), 'utf8');
    expect(src).not.toContain('tkhd');
    expect(src).not.toContain('rotationDegrees');
    expect(src).toContain('if (aspect == null) return VIDEO_FALLBACK_ASPECT;');
  });
});
