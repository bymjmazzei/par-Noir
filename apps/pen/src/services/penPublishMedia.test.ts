import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensurePublishPlaybackBytes } from './penPublishMedia';
import * as penAttach from './penAttach';
import * as penLocalMedia from './penLocalMedia';

describe('ensurePublishPlaybackBytes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to editor proxy bytes when master penmedia is missing on Drive', async () => {
    vi.spyOn(penLocalMedia, 'resolvePenMediaSrc').mockImplementation(async (src) => {
      if (src === 'penlocal:proxy') return 'blob:proxy';
      return null;
    });
    vi.spyOn(penAttach, 'downloadCloudMediaBlob').mockRejectedValue(new Error('404'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 })
    );
    const putSpy = vi.spyOn(penLocalMedia, 'putLocalMediaForDriveFile').mockResolvedValue({
      mediaId: 'm1',
      ref: 'penlocal:m1',
      blobUrl: 'blob:cached',
      mime: 'video/mp4'
    });

    await ensurePublishPlaybackBytes({
      session: { pnIdentifier: 'pn', accessToken: 't' } as never,
      docId: 'doc-1',
      sections: [
        {
          slug: 'body',
          doc: { type: 'doc', content: [] },
          layers: [
            {
              id: 'v1',
              kind: 'video',
              x: 0,
              y: 0,
              w: 100,
              h: 100,
              videoSrc: 'penmedia:dead',
              editProxySrc: 'penlocal:proxy'
            }
          ]
        }
      ]
    });

    expect(fetchSpy).toHaveBeenCalledWith('blob:proxy');
    expect(putSpy).toHaveBeenCalled();
  });
});
