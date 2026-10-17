/**
 * Social toggle + 2 TOC pages (video + action-only) → feed collection publish.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LocalDocBundle } from './penLocalStore';
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});

vi.mock('./penFeedPagePublish', () => ({
  composePageVideoWithoutActions: vi.fn(async () => ({
    videoBlob: new Blob([1, 2, 3], { type: 'video/mp4' }),
    posterBlob: new Blob([9], { type: 'image/jpeg' }),
    videoContentType: 'video/mp4',
    width: 360,
    height: 640,
    durationMs: 5000
  })),
  composeTimelineEncodeOpts: vi.fn(() => ({
    clockDurationSec: 5,
    allowInertOnly: true,
    onSample: vi.fn()
  })),
  penFeedPageForSection: vi.fn(),
  penPresentationFields: vi.fn(() => ({}))
}));

vi.mock('./penGalleryPreview', () => ({
  findComposeExportRoot: () => ({}) as HTMLElement,
  waitForUntaintedComposeVideos: async (el: HTMLElement) => el
}));

vi.mock('./playbackMode', () => ({
  setPlaybackMode: vi.fn()
}));

import { writeSocialTocCollectionHandoff } from './penPublish';

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
  it('builds video + raster pages and indexes collection parent', async () => {
    vi.useFakeTimers();
    const doc = bundle();
    const raster = new Blob([7, 8], { type: 'image/png' });
    const handoffPromise = writeSocialTocCollectionHandoff(doc, {
      activateSection: vi.fn(),
      resolveExportRoot: vi.fn(async () => ({}) as HTMLElement),
      rasterizeSection: vi.fn(async () => raster),
      canPublishPublicTemplate: false
    });
    await vi.runAllTimersAsync();
    const handoff = await handoffPromise;
    vi.useRealTimers();
    expect(handoff.contentClass).toBe('collection');
    expect(handoff.pages.map((p) => p.kind)).toEqual(['video', 'video']);
    expect(handoff.videos).toHaveLength(2);
    expect(handoff.videos[0]?.slug).toBe('page-1');
  });
});
