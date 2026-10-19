import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CURATED_WIDGET_IDS, PLATFORM_POST_TEMPLATE_IDS, getTemplate } from '@par-noir/pen-protocol';
import { bundleToFeedTileModel } from './feedTileFromPen';
import { curatedWidgetPosterSrc, platformTemplatePagePosters } from './widgetPosters';

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

  it('every page of every platform post template ships a committed screenshot under 200KB', () => {
    expect(PLATFORM_POST_TEMPLATE_IDS).toHaveLength(25);
    for (const id of PLATFORM_POST_TEMPLATE_IDS) {
      const slugs = getTemplate(id)!.seedSections!.map((s) => s.slug);
      const posters = platformTemplatePagePosters(id);
      expect(posters).toEqual(slugs.map((slug) => `/template-posters/${id}/${slug}.jpg`));
      for (const src of posters!) {
        const file = resolve(penRoot, 'public', src.slice(1));
        expect(existsSync(file), src).toBe(true);
        expect(statSync(file).size).toBeLessThanOrEqual(200 * 1024);
      }
    }
    expect(platformTemplatePagePosters('website.v1')).toBeNull();
  });

  it('a collection becomes one swipeable poster page per section', () => {
    const t = getTemplate('collection.how_to.v1')!;
    const model = bundleToFeedTileModel({
      title: t.title,
      sections: t.seedSections!,
      pageSwipeAxis: t.seedPageSwipeAxis,
      pagePosters: platformTemplatePagePosters(t.id)!
    });
    expect(model.pages.map((p) => p.slug)).toEqual(['cover', 'step-1', 'step-2', 'step-3', 'recap']);
    expect(model.pages.every((p) => p.mediaKind === 'image' && p.mediaSrc && !p.penFeedPage)).toBe(true);
    expect(model.pageSwipeAxis).toBe('x');
  });

  it('/templates shows platform posters inside the phone feed frame', () => {
    const thumb = read('src/components/TemplateGalleryThumb.tsx');
    expect(thumb).toMatch(/<SocialFeedPhonePreview[\s\S]*?pagePosters=\{platformTemplatePagePosters\(/);
    expect(read('src/components/TemplatesBrowse.tsx')).toMatch(/pagePosters=\{platformTemplatePagePosters\(previewId\)/);
    expect(read('src/components/TemplatesFeedScroller.tsx')).toMatch(/pagePosters=\{platformTemplatePagePosters\(t\.id\)/);
    expect(read('src/components/PenFeedSlideStage.tsx')).toMatch(/pagePosters=\{pagePosters\}/);
    expect(read('src/components/SocialFeedPhonePreview.tsx')).toMatch(/pagePosters=\{pagePosters\}/);
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
