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

  it('rasterizes the zoomed preview at layout size so the still lines up with the action layer', () => {
    const raster = read('services/rasterizePagePoster.ts');
    expect(raster).toMatch(/w: Math\.max\(1, Math\.round\(el\.offsetWidth/);
    const punch = raster.slice(raster.indexOf('export function punchVideoHolesFromLive'));
    expect(punch.slice(0, punch.indexOf('\n}\n'))).toMatch(/visualScale\(liveRoot\)/);
    const compose = read('services/composePageVideoEncode.ts');
    const still = compose.slice(compose.indexOf('export async function composePageStill'));
    expect(still.slice(0, still.indexOf('\n}\n'))).toMatch(/visualScale\(root\)/);
    expect(read('pages/docEditor/DocEditorShell.tsx')).toMatch(/pageView === 'screen' && !captureLayers/);
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
