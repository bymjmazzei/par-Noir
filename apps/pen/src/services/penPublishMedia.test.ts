import { describe, expect, it, vi, beforeEach } from 'vitest';

const ensurePenMediaUrl = vi.hoisted(() => vi.fn());
vi.mock('@par-noir/pen-media', async (orig) => ({
  ...(await orig<typeof import('@par-noir/pen-media')>()),
  ensurePenMediaUrl
}));

import { ensurePublishPlaybackBytes } from './penPublishMedia';

const session = { pnIdentifier: 'pn', accessToken: 't' } as never;
const sections = [
  {
    slug: 'body',
    doc: { type: 'doc' as const, content: [] },
    layers: [
      { id: 'v1', kind: 'video' as const, x: 0, y: 0, w: 100, h: 100, videoSrc: 'penmedia:clip' },
      { id: 'i1', kind: 'image' as const, x: 0, y: 0, w: 100, h: 100, imageSrc: 'https://x/y.png' }
    ]
  }
];

describe('ensurePublishPlaybackBytes', () => {
  beforeEach(() => {
    ensurePenMediaUrl.mockReset();
  });

  it('hydrates each Pen media ref and skips plain URLs', async () => {
    ensurePenMediaUrl.mockResolvedValue('blob:clip');
    await ensurePublishPlaybackBytes({
      session,
      docId: 'doc-1',
      sections,
      pagePresentation: { backgroundVideo: 'penlocal:bg' } as never
    });
    expect(ensurePenMediaUrl.mock.calls.map((c) => c[0].src)).toEqual(['penmedia:clip', 'penlocal:bg']);
  });

  it('fails publish when a ref cannot be made playable', async () => {
    ensurePenMediaUrl.mockResolvedValue(null);
    await expect(
      ensurePublishPlaybackBytes({ session, docId: 'doc-1', sections })
    ).rejects.toThrow('publish_media_missing');
  });
});
