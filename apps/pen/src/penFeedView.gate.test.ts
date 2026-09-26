/**
 * Gate: class feed rail builders + pen-template filter.
 * Falsifies: missing ALL, Social rail with projects chip, non-templates in onlyPenTemplates.
 */
import { describe, expect, it } from 'vitest';
import {
  buildClassFeedRailItems,
  buildSocialTemplateRailItems,
  contentClassFallbackLabel,
  isProjectsRailClass,
  isSocialTemplateRailClass,
  libraryDocMatchesRailSelection,
  SOCIAL_TEMPLATE_RAIL_FORMS,
  templateMatchesRailSelection
} from './services/classFeedRailItems';
import { onlyPenTemplates } from './services/penTemplateFeed';
import { isAllowedFeedMediaSignedUrl } from './services/penPublicFeedMedia';

describe('buildSocialTemplateRailItems', () => {
  it('always leads with ALL then Social atoms (no projects chip)', () => {
    const items = buildSocialTemplateRailItems();
    expect(items[0]).toEqual({ id: 'all', label: 'ALL' });
    expect(items.slice(1).map((i) => i.id)).toEqual([...SOCIAL_TEMPLATE_RAIL_FORMS]);
    expect(items.map((i) => i.label)).toEqual([
      'ALL',
      'note',
      'audio',
      'media',
      'collection',
      'set'
    ]);
  });

  it('isSocialTemplateRailClass matches Social rail atoms only (not metric / projects)', () => {
    expect(isSocialTemplateRailClass('social.note')).toBe(true);
    expect(isSocialTemplateRailClass('social.metric')).toBe(false);
    expect(isSocialTemplateRailClass('projects.journal')).toBe(false);
    expect(isProjectsRailClass('projects.letter')).toBe(true);
    expect(isSocialTemplateRailClass('social.quote')).toBe(false);
    expect(isSocialTemplateRailClass('community.feed')).toBe(false);
  });

  it('templateMatchesRailSelection ALL includes every Social form', () => {
    expect(templateMatchesRailSelection('social.quote', 'all')).toBe(true);
    expect(templateMatchesRailSelection('social.poll', 'all')).toBe(true);
    expect(templateMatchesRailSelection('social.note', 'social.note')).toBe(true);
    expect(templateMatchesRailSelection('social.quote', 'social.note')).toBe(false);
    expect(templateMatchesRailSelection('projects.journal', 'all')).toBe(false);
  });

  it('libraryDocMatchesRailSelection ALL includes non-social docs', () => {
    expect(libraryDocMatchesRailSelection(undefined, 'all')).toBe(true);
    expect(libraryDocMatchesRailSelection('time.event', 'all')).toBe(true);
    expect(libraryDocMatchesRailSelection('time.event', 'social.note')).toBe(false);
  });
});

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
