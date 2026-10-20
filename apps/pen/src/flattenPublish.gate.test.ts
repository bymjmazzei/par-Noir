/**
 * Gate: every shared page is one flattened background under the action layer.
 * A page with video encodes frame by frame; any other page is one image.
 * Share, Download and the gallery preview all go through the same two functions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('flatten on publish', () => {
  const controller = read('pages/docEditor/useDocEditorController.ts');
  const publish = read('services/penPublish.ts');
  const gallery = read('services/penGalleryPreview.ts');
  const encode = read('services/encodePageVideo.ts');

  it('Share and Download flatten through flattenPage / encodePageVideo', () => {
    expect(controller).toMatch(/composePageStill\(root, pageContext\(slug\)/);
    expect(controller).toMatch(/encodePageVideo\(root, pageContext\(slug\)/);
    expect(controller).toMatch(/flattenSection: \(slug\) => flattenPage\(slug\)/);
    expect(controller).toMatch(/image: \{ slug: page\.slug, posterBlob: await flattenPage\(page\.slug\) \}/);
    expect(controller).toMatch(/saveDownload\(await flattenPage\(slug, 'image\/png'\)/);
    expect(gallery).toMatch(/encodePageVideo\(root, page\)/);
    expect(gallery).toMatch(/composePageStill\(root, page\)/);
  });

  it('collection pages are only video or raster', () => {
    const union = publish.slice(publish.indexOf('export type MixedPublishPage'));
    const body = union.slice(0, union.indexOf(';\n'));
    expect(body).toMatch(/kind: 'video'/);
    expect(body).toMatch(/kind: 'raster'/);
    expect(body).not.toMatch(/kind: '(still|note)'/);
  });

  it('the old per-surface paths and companion audio uploads are gone', () => {
    const sources = [controller, publish, gallery, read('services/composePageVideoEncode.ts')];
    for (const src of sources) {
      expect(src).not.toMatch(
        /composePageToVideo|rasterizeSection|minimalOverlayStillBlob|uploadCompanionAudio|buildTestMedia/
      );
    }
  });

  it('action layers never reach the flattened background', () => {
    expect(encode).toMatch(/partitionLayersForCompose\([^)]*\)\.inert/);
  });

  it('browsers without WebCodecs get a clear update message', () => {
    expect(encode).toMatch(/typeof VideoEncoder === 'undefined'/);
    expect(controller).toMatch(/Update your browser to share video posts\./);
  });
});
