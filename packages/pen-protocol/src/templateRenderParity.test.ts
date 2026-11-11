/**
 * A post built from a template must match the template preview: zero padding stays zero,
 * and intro layers are drawn live by the feed and settled in the editor and the bake.
 */

import { describe, expect, it } from 'vitest';
import { buildActionOverlayAtTime, exportActionSectionForFeed, feedLiveLayerIds } from './feedActionSection.js';
import { layerHasMotion, sectionSettledSec } from './layerMotion.js';
import { resolvePagePaddingPx, DEFAULT_PAGE_PADDING_PX } from './pageGeometry.js';
import { getTemplate } from './templates.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

function recipeReelBody(): PenSectionContent {
  const section = getTemplate('post.recipe_reel.v1')?.seedSections?.[0];
  if (!section) throw new Error('recipe reel seed missing');
  return section;
}

function layer(id: string, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return { id, kind: 'text', x: 20, y: 400, w: 300, h: 44, zIndex: 1, ...extra };
}

describe('page padding', () => {
  it('keeps a zero padding at zero', () => {
    expect(resolvePagePaddingPx(0)).toBe(0);
  });

  it('defaults only when padding is unset', () => {
    expect(resolvePagePaddingPx(undefined)).toBe(DEFAULT_PAGE_PADDING_PX);
    expect(resolvePagePaddingPx(null)).toBe(DEFAULT_PAGE_PADDING_PX);
    expect(resolvePagePaddingPx(120)).toBe(72);
  });

  it('recipe reel seeds a zero padding', () => {
    expect(getTemplate('post.recipe_reel.v1')?.seedPagePresentation?.padding).toBe(0);
  });
});

describe('settled pose', () => {
  it('ends when the last intro finishes', () => {
    const section: PenSectionContent = {
      slug: 'body',
      doc: { type: 'doc', content: [] },
      layers: [
        layer('a', { motion: { keys: [], animation: { in: 'rise', durationSec: 0.5 } } }),
        layer('b', { inSec: 1, motion: { keys: [], animation: { in: 'fade', durationSec: 0.5 } } }),
        layer('c')
      ]
    };
    expect(sectionSettledSec(section)).toBeCloseTo(1.5);
  });

  it('is zero when nothing has an intro', () => {
    const section: PenSectionContent = {
      slug: 'body',
      doc: { type: 'doc', content: [] },
      layers: [layer('c')]
    };
    expect(sectionSettledSec(section)).toBe(0);
  });
});

describe('recipe reel in the feed', () => {
  it('draws the ingredients intro live and leaves static art in the bake', () => {
    const section = recipeReelBody();
    const live = feedLiveLayerIds(section.layers);
    expect(live.has('rr_ingredients')).toBe(true);
    expect(live.has('rr_full')).toBe(true);
    expect(live.has('rr_art')).toBe(false);
    expect(live.has('rr_time')).toBe(false);
    const exported = exportActionSectionForFeed(section);
    expect(exported.layers.map((item) => item.id)).toContain('rr_ingredients');
  });

  it('plays the rise: hidden at 0, fully shown once settled', () => {
    const section = recipeReelBody();
    const exported = exportActionSectionForFeed(section);
    const settled = sectionSettledSec(section);
    expect(settled).toBeGreaterThan(0);
    const at0 = buildActionOverlayAtTime(exported, 0).find((item) => item.id === 'rr_ingredients');
    const atRest = buildActionOverlayAtTime(exported, settled).find((item) => item.id === 'rr_ingredients');
    expect(at0?.opacity ?? 100).toBe(0);
    expect(atRest?.opacity).toBe(100);
  });

  it('keeps video layers in the bake even when they animate', () => {
    const video = layer('v', {
      kind: 'video',
      videoSrc: 'blob:x',
      motion: { keys: [], animation: { in: 'fade' } }
    });
    expect(layerHasMotion(video)).toBe(true);
    expect(feedLiveLayerIds([video]).has('v')).toBe(false);
  });
});
