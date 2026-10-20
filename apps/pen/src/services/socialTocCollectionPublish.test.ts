/**
 * Social toggle + 2 TOC pages (video + action-only) → feed collection publish:
 * the video page encodes, the action-only page flattens to one image.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LocalDocBundle } from './penLocalStore';
import { writeSocialTocCollectionHandoff } from './penPublish';

const encoded = {
  poster: { variant: 'poster', blob: new Blob([9], { type: 'image/jpeg' }), contentType: 'image/jpeg', byteSize: 1 },
  sd: {
    variant: 'sd',
    blob: new Blob([1, 2], { type: 'video/mp4' }),
    contentType: 'video/mp4',
    byteSize: 2,
    width: 406,
    height: 720,
    durationMs: 5000
  }
} as const;

function bundle(): LocalDocBundle {
  return {
    manifest: {
      docId: 'doc-social-toc',
      title: 'Social blank',
      docType: 'note',
      classId: 'custom.doc',
      templateId: 'blank.custom',
      templateVersion: '1',
      isSocial: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      toc: ['page-1', 'page-2'],
      ownerPnHash: 'owner'
    },
    sections: [
      {
        slug: 'page-1',
        doc: { type: 'doc', content: [] },
        layers: [
          {
            id: 'v1',
            kind: 'video',
            x: 0,
            y: 0,
            w: 200,
            h: 120,
            zIndex: 1,
            videoSrc: 'https://example.com/a.mp4'
          }
        ]
      },
      {
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
            bindDocId: 'doc-social-toc',
            label: 'Vote'
          }
        ]
      }
    ],
    chain: { docId: 'doc-social-toc', genesis: { hash: 'g' }, links: [] }
  } as unknown as LocalDocBundle;
}

describe('social TOC collection publish', () => {
  it('encodes the video page and flattens the action-only page', async () => {
    const still = new Blob([7, 8], { type: 'image/jpeg' });
    const encodeSection = vi.fn(async () => encoded);
    const flattenSection = vi.fn(async () => still);
    const handoff = await writeSocialTocCollectionHandoff(bundle(), {
      encodeSection,
      flattenSection,
      canPublishPublicTemplate: false
    });
    expect(handoff.contentClass).toBe('collection');
    expect(handoff.pages).toEqual([
      { kind: 'video', slug: 'page-1', videoIndex: 0 },
      { kind: 'raster', slug: 'page-2', posterBlob: still }
    ]);
    expect(handoff.videos.map((video) => video.slug)).toEqual(['page-1']);
    expect(encodeSection).toHaveBeenCalledWith('page-1', expect.any(Function));
    expect(flattenSection).toHaveBeenCalledWith('page-2');
  });
});
