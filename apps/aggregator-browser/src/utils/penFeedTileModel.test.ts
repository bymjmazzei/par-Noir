import { describe, expect, it } from 'vitest';
import type { IndexedFile } from '../types/aggregator';
import { buildPenCollectionFeedTileModel } from './penFeedTileModel';

describe('buildPenCollectionFeedTileModel', () => {
  it('carries the parent doc id so page jumps, votes, and taps resolve across parts', () => {
    const parent = { metadata: { fileId: 'parent', title: 'Drop', penDocId: 'doc-1' } } as unknown as IndexedFile;
    const model = buildPenCollectionFeedTileModel(parent, ['a', 'b'], (id) => ({
      meta: { penPageSlug: id === 'a' ? 'cover' : 'menu', penPageTitle: id === 'a' ? 'Cover' : 'Menu' }
    }));
    expect(model.penDocId).toBe('doc-1');
    expect(model.pages.map((p) => p.slug)).toEqual(['cover', 'menu']);
  });
});
