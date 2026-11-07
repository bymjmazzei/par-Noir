import { describe, expect, it } from 'vitest';
import {
  actionLayerMediaRefs,
  penFeedPageForSection,
  penPresentationFields
} from './penFeedPagePublish';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';

describe('penFeedPageForSection', () => {
  it('exports action section and canvas from manifest aspect', () => {
    const section: PenSectionContent = {
      slug: 'page-2',
      doc: { type: 'doc', content: [] },
      layers: [
        {
          id: 'btn',
          kind: 'interactive',
          x: 10,
          y: 10,
          w: 120,
          h: 40,
          zIndex: 1,
          behavior: 'poll.vote',
          label: 'Vote'
        }
      ]
    };
    const manifest = {
      docId: 'd1',
      title: 'T',
      classId: 'custom.doc',
      templateId: 'blank.custom',
      galleryAspect: '9/16' as const
    } as PenDocManifest;
    const page = penFeedPageForSection(section, manifest);
    expect(page.slug).toBe('page-2');
    expect(page.canvas).toEqual({ w: 360, h: 640 });
    expect(page.contentInsetPx).toBe(40);
    expect(
      penFeedPageForSection(section, {
        ...manifest,
        pagePresentation: { padding: 16 } as PenDocManifest['pagePresentation']
      }).contentInsetPx
    ).toBe(16);
    expect(page.actionSection.layers.some((l) => l.id === 'btn')).toBe(true);
    expect(penPresentationFields({ ...manifest, pageView: 'screen' })).toEqual({
      pageView: 'screen',
      galleryAspect: '9/16'
    });
  });

  it('carries the doc font and public copies of revealed media', () => {
    const section: PenSectionContent = {
      slug: 'p',
      doc: { type: 'doc', content: [] },
      layers: [
        {
          id: 'btn',
          kind: 'interactive',
          behavior: 'widget.reveal',
          revealLayerId: 'pic',
          x: 0,
          y: 0,
          w: 100,
          h: 40,
          zIndex: 2
        },
        {
          id: 'pic',
          kind: 'image',
          imageSrc: 'penmedia:drive-1',
          visible: false,
          x: 0,
          y: 50,
          w: 100,
          h: 100,
          zIndex: 1
        },
        {
          id: 'flat',
          kind: 'image',
          imageSrc: 'penmedia:baked',
          x: 0,
          y: 200,
          w: 100,
          h: 100,
          zIndex: 1
        }
      ]
    } as PenSectionContent;
    const manifest = {
      docId: 'd1',
      title: 'T',
      classId: 'custom.doc',
      templateId: 'blank.custom',
      pagePresentation: { fontFamily: 'Bebas Neue' }
    } as PenDocManifest;

    expect(actionLayerMediaRefs([section, section], manifest)).toEqual([
      { src: 'penmedia:drive-1', kind: 'image' }
    ]);
    const page = penFeedPageForSection(section, manifest, {
      'penmedia:drive-1': { fileId: 'pub-1', kind: 'image' }
    });
    expect(page.fontFamily).toBe('Bebas Neue');
    expect(page.layerMedia).toEqual({ pic: { fileId: 'pub-1', kind: 'image' } });
    expect(penFeedPageForSection(section, manifest).layerMedia).toBeUndefined();
  });
});
