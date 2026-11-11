/**
 * Gate: each still band of a page flattens TipTap text and layout, not images only,
 * and leaves holes where the videos paint.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const encodePath = resolve(__dirname, 'services/encodePageVideo.ts');
const rasterPath = resolve(__dirname, 'services/rasterizePagePoster.ts');

describe('compose bands include text', () => {
  const encode = readFileSync(encodePath, 'utf8');
  const raster = readFileSync(rasterPath, 'utf8');

  it('rasterizeBand bakes through rasterizeElementToPosterBlob (text+layout) with video holes', () => {
    const fnStart = encode.indexOf('async function rasterizeBand');
    const fn = encode.slice(fnStart, fnStart + 1200);
    expect(fn).toMatch(/rasterizeElementToPosterBlob/);
    expect(fn).toMatch(/punchVideos:\s*true/);
  });

  it('rasterize inlines computed styles, including visibility, for band hiding', () => {
    expect(raster).toMatch(/export function inlineSafeComputedStyles/);
    expect(raster).toMatch(/export function punchVideoHolesFromLive/);
    expect(raster).toMatch(/inlineSafeComputedStyles\(el,\s*clone\)/);
    expect(raster).toMatch(/'visibility'/);
  });

  it('baked text keeps its font: files are embedded, not swapped for system-ui', () => {
    expect(raster).not.toMatch(/forceSystemFonts/);
    expect(raster).toMatch(/const fontCss = await embeddedFontCss\(el\)/);
    expect(raster).toMatch(/<style>\$\{fontCss\}<\/style>/);
  });

  it('SVG images load from data: urls; a blob: foreignObject SVG taints the canvas in Chrome', () => {
    expect(raster).not.toMatch(/createObjectURL/);
    expect(raster.match(/i\.src = /g)).toHaveLength(1);
    expect(raster).toMatch(/i\.src = svgImageUrl\(svg\)/);
    expect(raster).toMatch(/sanitizeCloneForRaster\(clone\);\s*await inlineBlobUrls\(clone\);/);
  });

  it('a failed bake blocks publish; there is no lookalike fallback', () => {
    const gallery = readFileSync(resolve(__dirname, 'services/penGalleryPreview.ts'), 'utf8');
    for (const src of [encode, raster, gallery]) {
      expect(src).not.toMatch(/rasterizeElementSafeStill|safe still/);
    }
    const controller = readFileSync(resolve(__dirname, 'pages/docEditor/useDocEditorController.ts'), 'utf8');
    expect(controller).toMatch(/Your post was not published: a page could not be captured/);
  });
});
