import { describe, expect, it } from 'vitest';
import {
  partitionSectionsForPublish,
  sectionHasVisibleVideoLayer,
  shouldPublishAsMixedPages,
  shouldPublishAsSingleComposedVideo
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

function proseDoc(text: string) {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text }]
      }
    ]
  };
}

describe('composeVideo per-page', () => {
  it('sectionHasVisibleVideoLayer requires kind video, src, and visible', () => {
    expect(sectionHasVisibleVideoLayer({ slug: 'b', doc: emptyTipTapDoc(), layers: [videoLayer()] })).toBe(
      true
    );
    expect(
      sectionHasVisibleVideoLayer({
        slug: 'b',
        doc: emptyTipTapDoc(),
        layers: [videoLayer({ visible: false })]
      })
    ).toBe(false);
  });

  it('single video page → single composed video; text sibling → mixed', () => {
    const videoOnly: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [videoLayer()]
    };
    const textPage: PenSectionContent = {
      slug: 'intro',
      doc: proseDoc('Hello'),
      layers: []
    };
    const videoWithProse: PenSectionContent = {
      slug: 'reel',
      doc: proseDoc('Caption'),
      layers: [videoLayer()]
    };

    expect(shouldPublishAsSingleComposedVideo([videoOnly])).toBe(true);
    expect(shouldPublishAsMixedPages([videoOnly])).toBe(false);

    expect(shouldPublishAsSingleComposedVideo([textPage, videoWithProse])).toBe(false);
    expect(shouldPublishAsMixedPages([textPage, videoWithProse])).toBe(true);

    const part = partitionSectionsForPublish([textPage, videoWithProse]);
    expect(part.noteSections.map((s) => s.slug)).toEqual(['intro']);
    expect(part.videoSections.map((s) => s.slug)).toEqual(['reel']);
  });

  it('two video pages without note pages → mixed (multi-video)', () => {
    const a: PenSectionContent = {
      slug: 'a',
      doc: emptyTipTapDoc(),
      layers: [videoLayer({ id: 'v1' })]
    };
    const b: PenSectionContent = {
      slug: 'b',
      doc: emptyTipTapDoc(),
      layers: [videoLayer({ id: 'v2' })]
    };
    expect(shouldPublishAsSingleComposedVideo([a, b])).toBe(false);
    expect(shouldPublishAsMixedPages([a, b])).toBe(true);
  });
});
