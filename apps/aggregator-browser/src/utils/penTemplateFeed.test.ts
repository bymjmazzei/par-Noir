/** Unit: penTemplateKind feed exclusion helpers. */
import { describe, expect, it } from 'vitest';
import {
  excludePenTemplates,
  isPenTemplateMetadata,
  onlyPenTemplates
} from './penTemplateFeed';

describe('penTemplateFeed', () => {
  it('detects template-flagged metadata', () => {
    expect(isPenTemplateMetadata({ penTemplateKind: 'template' })).toBe(true);
    expect(isPenTemplateMetadata({ penTemplateKind: 'remix' })).toBe(true);
    expect(isPenTemplateMetadata({})).toBe(false);
    expect(isPenTemplateMetadata(undefined)).toBe(false);
  });

  it('excludes templates from social feed lists', () => {
    const files = [
      { metadata: { fileId: 'a' } },
      { metadata: { fileId: 'b', penTemplateKind: 'template' as const } },
      { metadata: { fileId: 'c', penTemplateKind: 'remix' as const } }
    ];
    expect(excludePenTemplates(files).map((f) => f.metadata.fileId)).toEqual(['a']);
    expect(onlyPenTemplates(files).map((f) => f.metadata.fileId)).toEqual(['b', 'c']);
  });
});
