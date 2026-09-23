import { describe, expect, it } from 'vitest';
import {
  docRequiresComposedVideoExport,
  isVisibleVideoLayer,
  sectionHasVisibleVideoLayer
} from './composeVideo.js';
import { emptyTipTapDoc } from './richDoc.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

function videoLayer(partial?: Partial<PenPageLayer>): PenPageLayer {
  return {
    id: 'v1',
    kind: 'video',
    x: 0,
    y: 0,
    w: 200,
    h: 120,
    zIndex: 1,
    videoSrc: 'https://example.com/a.mp4',
    ...partial
  };
}

describe('composeVideo detect', () => {
  it('isVisibleVideoLayer requires kind video, src, and visible', () => {
    expect(isVisibleVideoLayer(videoLayer())).toBe(true);
    expect(isVisibleVideoLayer(videoLayer({ visible: false }))).toBe(false);
    expect(isVisibleVideoLayer(videoLayer({ videoSrc: '' }))).toBe(false);
    expect(
      isVisibleVideoLayer({
        id: 't',
        kind: 'text',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        zIndex: 1
      })
    ).toBe(false);
  });

  it('docRequiresComposedVideoExport scans sections', () => {
    const withVideo: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [videoLayer()]
    };
    const hidden: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [videoLayer({ visible: false })]
    };
    const plain: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: []
    };
    expect(sectionHasVisibleVideoLayer(withVideo)).toBe(true);
    expect(docRequiresComposedVideoExport([withVideo])).toBe(true);
    expect(docRequiresComposedVideoExport([hidden])).toBe(false);
    expect(docRequiresComposedVideoExport([plain])).toBe(false);
  });
});
