import { describe, expect, it } from 'vitest';
import {
  downloadKindForSections,
  feedPagePlainText,
  partitionSectionsForPublish,
  sectionHasVisibleVideoLayer,
  sectionIsFeedPage,
  shouldPublishAsMixedPages,
  shouldPublishAsSingleComposedVideo,
  shouldPublishSocialAsCollection
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

  it('download kind is video, image, or doc', () => {
    const videoOnly: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [videoLayer()]
    };
    const still: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [
        {
          id: 'img',
          kind: 'image',
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          zIndex: 1,
          imageSrc: 'https://example.com/a.jpg'
        }
      ]
    };
    const writing: PenSectionContent = {
      slug: 'body',
      doc: proseDoc('A letter'),
      layers: []
    };
    expect(downloadKindForSections([videoOnly])).toBe('video');
    expect(downloadKindForSections([still])).toBe('image');
    expect(downloadKindForSections([writing])).toBe('doc');
    expect(downloadKindForSections([writing, { ...writing, slug: 'next' }])).toBe('doc');
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

  it('a text layer without body prose is still a feed page', () => {
    const page: PenSectionContent = {
      slug: 'page-2',
      doc: emptyTipTapDoc(),
      layers: [
        {
          id: 't1',
          kind: 'text',
          x: 0,
          y: 0,
          w: 80,
          h: 24,
          zIndex: 1,
          textDoc: proseDoc('On the layer')
        }
      ]
    };
    expect(sectionIsFeedPage(page)).toBe(true);
    expect(feedPagePlainText(page)).toBe('On the layer');
    expect(sectionIsFeedPage({ slug: 'empty', doc: emptyTipTapDoc(), layers: [] })).toBe(false);
  });

  it('multipage social posts publish as collections; a note template stays a note', () => {
    const body: PenSectionContent = { slug: 'body', doc: proseDoc('One'), layers: [] };
    const added: PenSectionContent = { slug: 'page-2', doc: proseDoc('Two'), layers: [] };
    expect(
      shouldPublishSocialAsCollection({
        classId: 'social.note',
        publishContentClass: 'note',
        templateSectionSlugs: ['body'],
        sections: [body]
      })
    ).toBe(false);
    expect(
      shouldPublishSocialAsCollection({
        classId: 'social.note',
        publishContentClass: 'note',
        templateSectionSlugs: ['body'],
        sections: [body, added]
      })
    ).toBe(true);
    expect(
      shouldPublishSocialAsCollection({
        classId: 'social.note',
        publishContentClass: 'note',
        templateSectionSlugs: ['title', 'body'],
        sections: [
          { slug: 'title', doc: proseDoc('Title'), layers: [] },
          { slug: 'body', doc: proseDoc('Body'), layers: [] }
        ]
      })
    ).toBe(false);
    expect(
      shouldPublishSocialAsCollection({
        classId: 'social.collection',
        publishContentClass: 'collection',
        templateSectionSlugs: ['slide-1', 'slide-2'],
        sections: [
          { slug: 'slide-1', doc: proseDoc('A'), layers: [] },
          { slug: 'slide-2', doc: proseDoc('B'), layers: [] }
        ]
      })
    ).toBe(true);
    expect(
      shouldPublishSocialAsCollection({
        classId: 'library.doc',
        publishContentClass: 'note',
        templateSectionSlugs: ['body'],
        sections: [body, added]
      })
    ).toBe(false);
  });
});
