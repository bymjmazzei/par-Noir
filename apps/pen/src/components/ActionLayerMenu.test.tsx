import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ActionLayerMenu', () => {
  it('shows whole widgets as screenshot tiles, not building blocks', () => {
    const src = readFileSync(resolve(__dirname, 'ActionLayerMenu.tsx'), 'utf8');
    expect(src).not.toMatch(/placePageWidget|LAYERS_PAGE_WIDGET_PRESETS|LAYERS_WIDGET_ELEMENTS/);
    expect(src).not.toMatch(/onPlaceElement|SectionLayersThumb|resolveGalleryMedia/);
    expect(src).toMatch(/sourceLayers\(t\)\.length > 0/);
    expect(src).toMatch(/curatedWidgetPosterSrc/);
    expect(src).toMatch(/resolvePublicMediaSignedUrl/);
    expect(src).toMatch(/posters/);
    expect(src).toMatch(/Add widget/);
    expect(src).toMatch(/pen-gallery-tiles/);
    expect(src).toMatch(/pen-action-layer-overlay/);
    expect(src).toMatch(/pen-template-preview-overlay/);
    expect(src).toMatch(/pen-template-preview-nav--prev/);
    expect(src).toMatch(/pen-named-black-tile/);
  });
});
