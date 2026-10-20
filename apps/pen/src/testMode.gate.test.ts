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

  it('renders only the action layer: page media is stripped and nothing is flattened', () => {
    const overlay = read('../../../packages/feed-tile/src/FeedTileTestOverlay.tsx');
    expect(overlay).toMatch(/posterUrl: undefined/);
    expect(overlay).toMatch(/mediaSrc: undefined, mediaKind: undefined/);
    const shell = read('pages/docEditor/DocEditorShell.tsx');
    const test = shell.slice(shell.indexOf('<FeedTileTestOverlay'));
    expect(test.slice(0, test.indexOf('/>'))).not.toMatch(/penFeedMediaBySlug/);
    expect(read('pages/docEditor/useDocEditorController.ts')).not.toMatch(/buildTestMedia/);
  });

  it('rasterizes the zoomed preview at layout size so the still lines up with the action layer', () => {
    const raster = read('services/rasterizePagePoster.ts');
    expect(raster).toMatch(/w: Math\.max\(1, Math\.round\(el\.offsetWidth/);
    const punch = raster.slice(raster.indexOf('export function punchVideoHolesFromLive'));
    expect(punch.slice(0, punch.indexOf('\n}\n'))).toMatch(/visualScale\(liveRoot\)/);
    const encode = read('services/encodePageVideo.ts');
    const slot = encode.slice(encode.indexOf('function measureSlot'));
    expect(slot.slice(0, slot.indexOf('\n}\n'))).toMatch(/visualScale\(root\)/);
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
