/** Gallery / create wiring for the purpose-built social post templates. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listBrowseFeaturedTemplates, requireTemplate } from '@par-noir/pen-protocol';
import { templatePreviewBundle } from './components/TemplateGalleryThumb';

vi.mock('./services/penApi', () => ({
  requestNotaryStamp: vi.fn(async () => null)
}));

describe('rich template preview + create chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('product drop preview carries presentation, a photo slot, and the embedded product card', () => {
    const preview = templatePreviewBundle(undefined, 'post.product_drop.v1');
    expect(preview?.manifest.pagePresentation).toBeTruthy();
    expect(preview?.manifest.galleryAspect).toBe('9/16');
    const layers = preview?.sections[0]?.layers || [];
    expect(layers.some((l) => l.name === 'Photo' && l.widgetElement === 'html')).toBe(true);
    expect(layers.some((l) => l.kind === 'group' && l.widgetTemplateId === 'widget.creator_product.v1')).toBe(true);
    expect(layers.some((l) => l.kind === 'image' || l.kind === 'video')).toBe(false);
  });

  it('collection preview swipes across every page', () => {
    const preview = templatePreviewBundle(undefined, 'collection.trip_recap.v1');
    expect(preview?.sections.map((s) => s.slug)).toEqual(['cover', 'day-1', 'day-2', 'day-3', 'highlights']);
    expect(requireTemplate('collection.trip_recap.v1').seedPageSwipeAxis).toBe('x');
  });

  it('community landing and site starters are retired from platform pack', () => {
    expect(() => requireTemplate('landing.basic.v1')).toThrow();
    expect(() => requireTemplate('site.basic.v1')).toThrow();
    expect(() => requireTemplate('feed.self_hosted.v1')).toThrow();
    expect(() => requireTemplate('feed.embed.v1')).toThrow();
  });

  it('platform starters do not inject galleryPreviewRef (live IR only)', () => {
    const preview = templatePreviewBundle(undefined, 'note.open_question.v1');
    expect(preview?.manifest.galleryPreviewRef).toBeUndefined();
    expect(preview?.sections[0]?.layers?.length).toBeGreaterThan(0);
  });

  it('Pen Mini features finished notes, not blank shells', () => {
    const featured = listBrowseFeaturedTemplates('social.note');
    expect(featured.map((t) => t.id)).toEqual(
      expect.arrayContaining(['note.open_question.v1', 'note.hot_take.v1', 'note.lesson.v1'])
    );
    for (const t of featured) {
      expect(t.seedSections?.[0]?.layers?.some((l) => l.kind === 'interactive'), t.id).toBe(true);
    }
  });

  it('widget preview is an empty template, not a seed table or a vote', () => {
    const preview = templatePreviewBundle(undefined, 'widget.v1');
    const layers = preview?.sections[0]?.layers || [];
    expect(layers).toEqual([]);
    expect(JSON.stringify(layers)).not.toContain('__pen_seed_table__');
    expect(JSON.stringify(layers)).not.toContain('poll.vote');
  });
});
