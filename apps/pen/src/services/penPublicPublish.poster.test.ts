/**
 * Every Pen post gets a CDN poster: oversized stills are re-encoded, and an oversized
 * poster that still reaches publish fails loudly instead of indexing a post with no thumbnail.
 */
import { describe, expect, it, vi } from 'vitest';
import { FEED_PREVIEW_POSTER_MAX_BYTES } from '@par-noir/aggregator-domain';

import { posterPreview, publishPublicCloudFile } from './penPublicPublish';

const { encodePosterFromImage } = vi.hoisted(() => ({
  encodePosterFromImage: vi.fn(async (_blob: Blob) => {
    const blob = new Blob([new Uint8Array(1024)], { type: 'image/jpeg' });
    return { variant: 'poster', blob, contentType: 'image/jpeg', byteSize: blob.size, width: 360, height: 640 };
  })
}));

vi.mock('@par-noir/aggregator-domain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@par-noir/aggregator-domain')>()),
  encodePosterFromImage
}));

const oversized = () =>
  new Blob([new Uint8Array(FEED_PREVIEW_POSTER_MAX_BYTES + 1)], { type: 'image/png' });

describe('posterPreview', () => {
  it('keeps a still that already fits the poster cap', async () => {
    const still = new Blob([1, 2, 3], { type: 'image/png' });
    const preview = await posterPreview(still);
    expect(preview?.poster?.blob).toBe(still);
    expect(preview?.poster?.contentType).toBe('image/png');
    expect(encodePosterFromImage).not.toHaveBeenCalled();
  });

  it('re-encodes an oversized page raster under the cap', async () => {
    const preview = await posterPreview(oversized());
    expect(encodePosterFromImage).toHaveBeenCalledTimes(1);
    expect(preview?.poster?.contentType).toBe('image/jpeg');
    expect(preview?.poster?.blob.size).toBeLessThanOrEqual(FEED_PREVIEW_POSTER_MAX_BYTES);
  });

  it('returns nothing for an empty still', async () => {
    expect(await posterPreview(new Blob([]))).toBeUndefined();
    expect(await posterPreview(undefined)).toBeUndefined();
  });
});

describe('publishPublicCloudFile poster cap', () => {
  it('throws instead of indexing a post without its poster', async () => {
    const calls: Array<{ method: string; path: string }> = [];
    const request = async (method: string, path: string) => {
      calls.push({ method, path });
      if (path === '/api/drive/files') return new Response(JSON.stringify({ id: 'drive-1' }), { status: 200 });
      if (path.includes('/ensure-public')) {
        return new Response(
          JSON.stringify({
            publicContentRef: {
              objectId: 'drive-1',
              publicUrl: 'https://drive.google.com/uc?export=download&id=drive-1',
              backend: 'google_drive'
            }
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    };

    await expect(
      publishPublicCloudFile({
        request,
        parentFolderId: 'public-folder',
        bytes: new Uint8Array([1, 2, 3]),
        fileName: 'pen-doc.png',
        title: 'Page',
        previews: { poster: { blob: oversized(), contentType: 'image/png' } },
        metadata: { penDocId: 'doc-1', fileType: 'image' }
      })
    ).rejects.toThrow('exceeds_poster_max_bytes');
    expect(calls.some((c) => c.method === 'PUT' && c.path.includes('/metadata-index/'))).toBe(false);
  });
});
