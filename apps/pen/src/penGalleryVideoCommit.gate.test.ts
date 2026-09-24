/**
 * Gate: Commit must not soft-skip gallery when the doc has a video layer.
 * Falsifies: catch always sets "gallery preview skipped" regardless of IR.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorPath = resolve(__dirname, 'pages/DocEditorPage.tsx');

describe('Pen gallery video Commit gate', () => {
  const src = readFileSync(editorPath, 'utf8');
  const promoteStart = src.indexOf('async function promote()');
  const promoteEnd = src.indexOf('async function inviteCollaborator()', promoteStart);
  const promote = src.slice(promoteStart, promoteEnd > 0 ? promoteEnd : undefined);

  it('uses docRequiresGalleryVideoCompose', () => {
    expect(promote).toMatch(/docRequiresGalleryVideoCompose/);
  });

  it('rethrows gallery errors when video compose is required', () => {
    expect(promote).toMatch(/needsVideoGallery/);
    expect(promote).toMatch(/if\s*\(\s*needsVideoGallery\s*\)/);
    expect(promote).toMatch(/throw e/);
  });

  it('passes sections into buildAndStoreGalleryPreview', () => {
    expect(promote).toMatch(/buildAndStoreGalleryPreview\(\{[\s\S]*sections:\s*bundle/);
  });
});
