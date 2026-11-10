/**
 * Gate: Discover template open routes to pen-templates; social posts open on the creator's feed.
 * Falsifies: Discover onFileClick dumps posts onto the public home feed.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  excludePenTemplates,
  onlyPenTemplates
} from './utils/penTemplateFeed';

const root = resolve(__dirname);

describe('pen-templates engagement destinations', () => {
  it('HomePage Discover click targets pen-templates for template files', () => {
    const src = readFileSync(resolve(root, 'pages/HomePage.tsx'), 'utf8');
    expect(src).toMatch(/setActiveFeedId\('pen-templates'\)/);
    expect(src).toMatch(/pendingTemplateFileIdRef/);
    expect(src).toMatch(/penTemplateKind/);
    expect(src).toMatch(/openFileOnCreatorFeed\(file\)/);
    // Discover posts must not land on the public home feed
    expect(src).not.toMatch(/setActiveFeedId\(isTemplate \? 'pen-templates' : 'public'\)/);
    // Tile-only PenTemplatesFeedPage branch retired
    expect(src).not.toMatch(/PenTemplatesFeedPage/);
  });

  it('onlyPenTemplates / excludePenTemplates keep templates out of public bucket', () => {
    const files = [
      { metadata: { fileId: 'a', penTemplateKind: undefined } },
      { metadata: { fileId: 'b', penTemplateKind: 'template' as const } }
    ];
    expect(onlyPenTemplates(files).map((f) => f.metadata.fileId)).toEqual(['b']);
    expect(excludePenTemplates(files).map((f) => f.metadata.fileId)).toEqual(['a']);
  });
});
