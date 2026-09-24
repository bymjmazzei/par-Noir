/**
 * Gate: Discover template open routes to pen-templates; public still excludes templates.
 * Falsifies: Discover onFileClick hardcodes public for template-flagged files.
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
    expect(src).toMatch(/pen-templates/);
    expect(src).toMatch(/pendingDiscoverFileIdRef/);
    expect(src).toMatch(/penTemplateKind/);
    // Must not force all Discover opens onto public only
    expect(src).not.toMatch(
      /onFileClick=\{\(file\) => \{\s*const i = indexedFiles\.findIndex[\s\S]*?setActiveFeedId\('public'\)/
    );
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
