/** Test mode: a sandbox overlay next to Preview in the editor and beside Build on /templates. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('test mode', () => {
  it('puts Test right after the Preview eye and opens the sandbox overlay', () => {
    const shell = read('pages/docEditor/DocEditorShell.tsx');
    const eye = shell.indexOf('<IconPreview />');
    const test = shell.indexOf('<IconTest />');
    expect(eye).toBeGreaterThan(-1);
    expect(test).toBeGreaterThan(eye);
    expect(shell).toMatch(/<FeedTileTestOverlay/);
  });

  it('paints the flattened page (first frame, actions hidden) under the action layer', () => {
    const shell = read('pages/docEditor/DocEditorShell.tsx');
    expect(shell).toMatch(/penFeedMediaBySlug: testMedia/);
    const controller = read('pages/docEditor/useDocEditorController.ts');
    const fn = controller.slice(controller.indexOf('async function buildTestMedia'));
    const body = fn.slice(0, fn.indexOf('async function downloadFlattened'));
    expect(body).toMatch(/withActionsHidden\(root, \(\) => composePageStill\(root\)\)/);
    expect(body).not.toMatch(/composePageToVideo/);
  });

  it('offers Test beside Build in the templates feed and preview modal', () => {
    expect(read('components/TemplatesFeedScroller.tsx')).toMatch(/<TemplateTestButton/);
    expect(read('components/TemplatesBrowse.tsx')).toMatch(/<TemplateTestButton/);
    const button = read('components/TemplateTestButton.tsx');
    expect(button).toMatch(/<FeedTileTestOverlay/);
    expect(button).not.toMatch(/fetch\(|ownerFetch|respondWidget/);
  });

  it('never records taps from the sandbox', () => {
    const overlay = read('../../../packages/feed-tile/src/FeedTileTestOverlay.tsx');
    expect(overlay).toMatch(/<FeedTileSurface/);
    expect(overlay).not.toMatch(/onTrack/);
  });
});
