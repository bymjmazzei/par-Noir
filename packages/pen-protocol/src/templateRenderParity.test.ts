/**
 * A post built from a template must match the template preview: zero padding stays zero,
 * animated non-action layers bake into the page video, and only action layers draw live.
 */

import { describe, expect, it } from 'vitest';
import {
  buildActionOverlayAtTime,
  exportActionSectionForFeed,
  feedLiveLayerIds,
  sectionHasInertMotion
} from './feedActionSection.js';
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

describe('animated posts in the feed', () => {
  it('recipe reel bakes its ingredients intro into the video; only the button is live', () => {
    const section = recipeReelBody();
    expect(sectionHasInertMotion(section)).toBe(true);
    const live = feedLiveLayerIds(section.layers);
    expect(live.has('rr_full')).toBe(true);
    expect(live.has('rr_ingredients')).toBe(false);
    expect(live.has('rr_art')).toBe(false);
    const exported = exportActionSectionForFeed(section);
    expect(exported.layers.map((item) => item.id)).not.toContain('rr_ingredients');
    expect(buildActionOverlayAtTime(exported, 0).map((item) => item.id)).not.toContain('rr_ingredients');
  });

  it('product drop bakes the batch fade-in; the countdown and Buy now draw live', () => {
    const section = getTemplate('post.product_drop.v1')?.seedSections?.[0];
    if (!section) throw new Error('product drop seed missing');
    expect(sectionHasInertMotion(section)).toBe(true);
    const live = feedLiveLayerIds(section.layers);
    expect(live.has('pd_batch')).toBe(false);
    expect(live.has('pd_cd')).toBe(true);
    const buy = (section.layers || []).find(
      (item) => item.kind === 'interactive' && item.behavior === 'cta.open'
    );
    expect(buy && live.has(buy.id)).toBe(true);
    expect([...live].every((id) => id === 'pd_cd' || id === buy?.id)).toBe(true);
  });

  it('a page without animated non-action layers stays a still', () => {
    const section: PenSectionContent = {
      slug: 'body',
      doc: { type: 'doc', content: [] },
      layers: [
        layer('t'),
        layer('cta', { kind: 'interactive', behavior: 'cta.open', motion: { keys: [], animation: { in: 'fade' } } })
      ]
    };
    expect(sectionHasInertMotion(section)).toBe(false);
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
