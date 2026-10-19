import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CURATED_WIDGET_IDS, PLATFORM_POST_TEMPLATE_IDS } from '@par-noir/pen-protocol';
import { catalogPosterSrc, curatedWidgetPosterSrc, platformTemplatePosterSrc } from './widgetPosters';

const penRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(resolve(penRoot, rel), 'utf8');

describe('curated widget posters', () => {
  it('every curated starter ships a committed screenshot under 200KB', () => {
    for (const id of CURATED_WIDGET_IDS) {
      const src = curatedWidgetPosterSrc(id);
      expect(src).toBe(`/widget-posters/${id}.jpg`);
      const file = resolve(penRoot, 'public', src!.slice(1));
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(200 * 1024);
    }
    expect(curatedWidgetPosterSrc('widget.v1')).toBeNull();
  });

  it('every platform post template ships a committed screenshot under 200KB', () => {
    expect(PLATFORM_POST_TEMPLATE_IDS).toHaveLength(25);
    for (const id of PLATFORM_POST_TEMPLATE_IDS) {
      const src = platformTemplatePosterSrc(id);
      expect(src).toBe(`/template-posters/${id}.jpg`);
      expect(catalogPosterSrc(id)).toBe(src);
      const file = resolve(penRoot, 'public', src!.slice(1));
      expect(existsSync(file), id).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(200 * 1024);
    }
    expect(platformTemplatePosterSrc('website.v1')).toBeNull();
  });

  it('/templates shows the poster for platform templates instead of a live render', () => {
    const thumb = read('src/components/TemplateGalleryThumb.tsx');
    expect(thumb.indexOf('usesCatalogPoster(posterRow)')).toBeGreaterThan(-1);
    expect(thumb.indexOf('usesCatalogPoster(posterRow)')).toBeLessThan(thumb.indexOf('<SocialFeedPhonePreview'));
    expect(read('src/components/WidgetTemplateThumb.tsx')).toMatch(/catalogPosterSrc\(template\.id\)/);
    expect(read('src/components/TemplatesBrowse.tsx')).toMatch(/usesCatalogPoster\(row\)/);
    expect(read('src/components/TemplatesFeedScroller.tsx')).toMatch(/usesCatalogPoster\(t\)/);
  });

  it('the poster stage page stays out of the production build', () => {
    expect(read('vite.config.ts')).not.toMatch(/widget-posters/);
    expect(read('scripts/widget-posters.mjs')).not.toMatch(/\.local\//);
  });
});

describe('publish poster keeps HTML snippet art', () => {
  it('snippet frames are tagged and swapped for a still before the clone is sanitized', () => {
    const raster = read('src/services/rasterizePagePoster.ts');
    expect(raster).toMatch(/await inlineHtmlSnippets\(el, clone\);\s*sanitizeCloneForRaster\(clone\)/);
    expect(raster).toMatch(/sanitizeWidgetMarkup\(html\)/);
    expect(read('src/components/WidgetArtLayerFace.tsx')).toMatch(/data-pen-html-snippet="1"/);
    for (const face of ['src/components/EditablePagePreview.tsx', 'src/components/PreviewLayerFace.tsx']) {
      expect(read(face)).toMatch(/<WidgetArtLayerFace\b/);
    }
  });
});
