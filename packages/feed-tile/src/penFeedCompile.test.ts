import { describe, expect, it } from 'vitest';
import { compilePenFeedTileModel, isPenFeedPlaybackMetadata } from './penFeedCompile.js';
import type { PenFeedPagePayload } from '@par-noir/pen-protocol';

describe('compilePenFeedTileModel', () => {
  it('maps penFeedPage onto feed pages', () => {
    const penFeedPage: PenFeedPagePayload = {
      slug: 'p1',
      canvas: { w: 360, h: 640 },
      timelineDurationSec: 5,
      actionSection: { layers: [] }
    };
    const model = compilePenFeedTileModel({
      title: 'Post',
      pageView: 'vertical',
      pages: [
        {
          mediaSrc: 'https://cdn.example/v.mp4',
          mediaKind: 'video',
          penFeedPage
        }
      ]
    });
    expect(model.pages[0]?.penFeedPage).toEqual(penFeedPage);
    expect(model.pages[0]?.actionStageHtml).toBeUndefined();
    expect(model.pageView).toBe('vertical');
  });
});

describe('isPenFeedPlaybackMetadata', () => {
  it('detects pen posts excluding templates', () => {
    expect(isPenFeedPlaybackMetadata({ penDocId: 'doc-1' })).toBe(true);
    expect(isPenFeedPlaybackMetadata({ penDocId: 'doc-1', penTemplateKind: 'template' })).toBe(
      false
    );
    expect(isPenFeedPlaybackMetadata({})).toBe(false);
  });
});
