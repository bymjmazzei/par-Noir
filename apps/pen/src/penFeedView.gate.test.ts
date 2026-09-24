/**
 * Gate: class feed rail builders + pen-template filter.
 * Falsifies: missing ALL, raw classId without form, non-templates in onlyPenTemplates.
 */
import { describe, expect, it } from 'vitest';
import {
  buildClassFeedRailItems,
  contentClassFallbackLabel
} from './services/classFeedRailItems';
import { onlyPenTemplates } from './services/penTemplateFeed';
import { isAllowedFeedMediaSignedUrl } from './services/penPublicFeedMedia';

describe('buildClassFeedRailItems', () => {
  it('always leads with ALL', () => {
    const items = buildClassFeedRailItems(['social.note']);
    expect(items[0]).toEqual({ id: 'all', label: 'ALL' });
  });

  it('includes form titles uppercased and skips unknown / category ids', () => {
    const items = buildClassFeedRailItems(['social.note', 'social', 'nope']);
    expect(items.some((i) => i.id === 'social.note')).toBe(true);
    expect(items.find((i) => i.id === 'social.note')?.label).toMatch(/NOTE/i);
    expect(items.some((i) => i.id === 'social')).toBe(false);
    expect(items.some((i) => i.id === 'nope')).toBe(false);
  });
});

describe('contentClassFallbackLabel', () => {
  it('maps aggregator buckets', () => {
    expect(contentClassFallbackLabel('note')).toBe('NOTES');
    expect(contentClassFallbackLabel('media')).toBe('MEDIA');
    expect(contentClassFallbackLabel('collection')).toBe('COLLECTIONS');
  });
});

describe('onlyPenTemplates', () => {
  it('keeps only penTemplateKind entries', () => {
    const files = [
      { fileId: 'a', metadata: {} },
      { fileId: 'b', metadata: { penTemplateKind: 'template' as const } },
      { fileId: 'c', metadata: { penTemplateKind: 'remix' as const } }
    ];
    expect(onlyPenTemplates(files).map((f) => f.fileId)).toEqual(['b', 'c']);
  });
});

describe('isAllowedFeedMediaSignedUrl', () => {
  it('allows R2 / feed-media hosts only', () => {
    expect(
      isAllowedFeedMediaSignedUrl('https://abc.r2.cloudflarestorage.com/obj')
    ).toBe(true);
    expect(isAllowedFeedMediaSignedUrl('https://feed-media.parnoir.com/x')).toBe(true);
    expect(isAllowedFeedMediaSignedUrl('https://evil.example/x')).toBe(false);
    expect(isAllowedFeedMediaSignedUrl('http://abc.r2.cloudflarestorage.com/obj')).toBe(
      false
    );
  });
});
