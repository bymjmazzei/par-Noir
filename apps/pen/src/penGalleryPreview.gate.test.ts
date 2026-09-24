/**
 * Gate: resolveGalleryMedia prefers committed galleryPreviewRef over layer media.
 * Video-layer docs require gallery video compose (IR), not soft-skip.
 */

import { describe, expect, it } from 'vitest';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import {
  docRequiresGalleryVideoCompose,
  resolveGalleryMedia
} from './services/penGalleryPreview';
import { isUntaintedMediaUrl } from './services/composePageVideoEncode';

function baseManifest(over: Partial<PenDocManifest> = {}): PenDocManifest {
  return {
    docId: 'doc_test',
    title: 'Test',
    docType: 'note',
    classId: 'social.note',
    templateId: 't',
    templateVersion: '1',
    toc: ['body'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over
  };
}

const sectionsWithVideo: PenSectionContent[] = [
  {
    slug: 'body',
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
    layers: [
      {
        id: 'v1',
        kind: 'video',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        zIndex: 1,
        videoSrc: 'penmedia:layerVideoFile'
      }
    ]
  }
];

const sectionsTextOnly: PenSectionContent[] = [
  {
    slug: 'body',
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
    layers: []
  }
];

describe('resolveGalleryMedia', () => {
  it('prefers galleryPreviewRef over layer videoSrc', () => {
    const media = resolveGalleryMedia(
      baseManifest({
        galleryPreviewRef: 'penmedia:composedPreview',
        galleryPreviewKind: 'video'
      }),
      sectionsWithVideo
    );
    expect(media).toEqual({ src: 'penmedia:composedPreview', kind: 'video' });
  });

  it('falls back to layer media when gallery preview unset', () => {
    const media = resolveGalleryMedia(baseManifest(), sectionsWithVideo);
    expect(media).toEqual({ src: 'penmedia:layerVideoFile', kind: 'video' });
  });

  it('uses image kind for still gallery preview', () => {
    const media = resolveGalleryMedia(
      baseManifest({
        galleryPreviewRef: 'penmedia:posterOnly',
        galleryPreviewKind: 'image'
      }),
      sectionsWithVideo
    );
    expect(media).toEqual({ src: 'penmedia:posterOnly', kind: 'image' });
  });
});

describe('docRequiresGalleryVideoCompose', () => {
  it('true when section has visible video layer', () => {
    expect(docRequiresGalleryVideoCompose(sectionsWithVideo)).toBe(true);
  });

  it('false for text-only sections', () => {
    expect(docRequiresGalleryVideoCompose(sectionsTextOnly)).toBe(false);
  });

  it('true for pagePresentation.backgroundVideo', () => {
    expect(
      docRequiresGalleryVideoCompose(sectionsTextOnly, {
        backgroundVideo: 'penmedia:bg'
      })
    ).toBe(true);
  });
});

describe('untainted media URLs', () => {
  it('only blob and data are safe to draw', () => {
    expect(isUntaintedMediaUrl('blob:https://x/1')).toBe(true);
    expect(isUntaintedMediaUrl('data:video/mp4;base64,aa')).toBe(true);
    expect(isUntaintedMediaUrl('https://cdn.example/v.mp4')).toBe(false);
    expect(isUntaintedMediaUrl('penmedia:abc')).toBe(false);
  });
});
