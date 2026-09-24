/**
 * Gate: video compose backdrop must flatten TipTap text, not images-only.
 * Falsifies: buildStaticBackdrop only calls rasterizeElementSafeStill.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const encodePath = resolve(__dirname, 'services/composePageVideoEncode.ts');
const rasterPath = resolve(__dirname, 'services/rasterizePagePoster.ts');

describe('compose backdrop includes text', () => {
  const encode = readFileSync(encodePath, 'utf8');
  const raster = readFileSync(rasterPath, 'utf8');

  it('buildStaticBackdrop prefers rasterizeElementToPosterBlob (text+layout)', () => {
    const fnStart = encode.indexOf('async function buildStaticBackdrop');
    const fn = encode.slice(fnStart, fnStart + 1200);
    expect(fn).toMatch(/rasterizeElementToPosterBlob/);
    expect(fn).toMatch(/punchVideos:\s*true/);
  });

  it('rasterize inlines computed styles for TipTap survival', () => {
    expect(raster).toMatch(/export function inlineSafeComputedStyles/);
    expect(raster).toMatch(/export function punchVideoHolesFromLive/);
    expect(raster).toMatch(/inlineSafeComputedStyles\(el,\s*clone\)/);
  });

  it('safe still fallback paints text via fillText', () => {
    expect(raster).toMatch(/SHOW_TEXT/);
    expect(raster).toMatch(/fillText/);
  });
});
