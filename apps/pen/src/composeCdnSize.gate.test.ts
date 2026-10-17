/**
 * Gate: Pen export sizes come from the publish tier (CDN ladder), not on-screen CSS px.
 * Falsifies: a 360px-wide editor sheet producing a 360px feed video, or SD falling back to the poster.
 */
import { describe, expect, it } from 'vitest';
import { getPublishTier } from '@par-noir/aggregator-domain';
import { composedMaster, composeOutputSizes } from './services/composePageVideoEncode';
import { rasterOutputSize } from './services/rasterizePagePoster';
import { publishPublicCloudFile } from './services/penPublicPublish';
import { PEN_PUBLISH_PLAN_ID } from './services/penPublishPlan';

describe('compose output follows the CDN tier', () => {
  it('a small on-screen 9:16 sheet still encodes 1080p HD and 720p SD', () => {
    const sizes = composeOutputSizes(360, 640, getPublishTier(PEN_PUBLISH_PLAN_ID));
    expect(sizes.hdOn).toBe(true);
    expect(sizes.master).toEqual({ w: 608, h: 1080 });
    expect(sizes.sd).toEqual({ w: 406, h: 720 });
  });

  it('composedMaster is HD when present, SD otherwise', () => {
    const poster = { blob: new Blob([1]), contentType: 'image/jpeg' };
    const sd = { blob: new Blob([1, 2]), contentType: 'video/mp4' };
    const hd = { blob: new Blob([1, 2, 3]), contentType: 'video/mp4' };
    expect(composedMaster({ poster, sd, hd })).toBe(hd);
    expect(composedMaster({ poster, sd })).toBe(sd);
  });

  it('raster target size upscales the backdrop to the output canvas', () => {
    expect(rasterOutputSize(360, 640, { targetWidth: 608, targetHeight: 1080 })).toEqual({
      cw: 608,
      ch: 1080,
      sx: 608 / 360,
      sy: 1080 / 640
    });
    expect(rasterOutputSize(4000, 2000, { maxEdge: 1000 }).cw).toBe(1000);
  });
});

describe('publish uploads every variant as binary', () => {
  it('sends poster, sd and hd to owner-upload and indexes sd/hd refs', async () => {
    const uploads: Array<{ path: string; body: unknown }> = [];
    let put: Record<string, unknown> | undefined;
    const request = async (method: string, path: string, body?: unknown) => {
      if (path === '/api/drive/files') {
        return new Response(JSON.stringify({ id: `drive-${uploads.length}` }), { status: 200 });
      }
      if (path === '/api/aggregator/feed-media/confirm-upload') {
        return new Response('{}', { status: 200 });
      }
      if (path.startsWith('/api/aggregator/feed-media/owner-upload')) {
        uploads.push({ path, body });
        return new Response('{}', { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        return new Response(
          JSON.stringify({
            publicContentRef: { objectId: 'drive-0', publicUrl: 'https://drive.google.com/uc?export=download&id=drive-0', backend: 'google_drive' }
          }),
          { status: 200 }
        );
      }
      if (method === 'PUT') {
        put = body as Record<string, unknown>;
        return new Response('{}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    };

    await publishPublicCloudFile({
      request,
      parentFolderId: 'public-folder',
      bytes: new Uint8Array([1, 2, 3]),
      fileName: 'pen-doc.mp4',
      title: 'Clip',
      previews: {
        poster: { blob: new Blob([9], { type: 'image/jpeg' }), contentType: 'image/jpeg' },
        sd: {
          blob: new Blob([1, 2], { type: 'video/mp4' }),
          contentType: 'video/mp4',
          width: 406,
          height: 720,
          durationMs: 5000
        },
        hd: {
          blob: new Blob([1, 2, 3], { type: 'video/mp4' }),
          contentType: 'video/mp4',
          width: 608,
          height: 1080,
          durationMs: 5000
        }
      },
      metadata: { feedIds: ['public', 'media'], contentClass: 'media', fileType: 'video' }
    });

    const variants = uploads.map((u) => new URL(u.path, 'https://api').searchParams.get('variant'));
    expect(variants.sort()).toEqual(['hd', 'poster', 'sd']);
    for (const u of uploads) {
      expect(u.body).toBeInstanceOf(Blob);
      expect((u.body as Blob).type).toBe('application/octet-stream');
    }
    expect((put?.feedPreviewHd as { height?: number } | undefined)?.height).toBe(1080);
    expect((put?.feedPreviewSd as { height?: number } | undefined)?.height).toBe(720);
  });

  it('a poster-only publish never indexes the poster as SD video', async () => {
    let put: Record<string, unknown> | undefined;
    const request = async (method: string, path: string, body?: unknown) => {
      if (path === '/api/drive/files') return new Response(JSON.stringify({ id: 'd1' }), { status: 200 });
      if (path === '/api/aggregator/feed-media/confirm-upload') {
        return new Response('{}', { status: 200 });
      }
      if (path.startsWith('/api/aggregator/feed-media/owner-upload')) {
        return new Response('{}', { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        return new Response(
          JSON.stringify({
            publicContentRef: { objectId: 'd1', publicUrl: 'https://drive.google.com/uc?export=download&id=drive-0', backend: 'google_drive' }
          }),
          { status: 200 }
        );
      }
      if (method === 'PUT') {
        put = body as Record<string, unknown>;
        return new Response('{}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    };
    await publishPublicCloudFile({
      request,
      parentFolderId: 'public-folder',
      bytes: new Uint8Array([1]),
      fileName: 'pen-doc.json',
      title: 'Note',
      previews: { poster: { blob: new Blob([9], { type: 'image/jpeg' }), contentType: 'image/jpeg' } },
      metadata: { feedIds: ['public', 'notes'], contentClass: 'note', fileType: 'note' }
    });
    expect(put?.feedPoster).toBeTruthy();
    expect(put?.feedPreviewSd).toBeUndefined();
  });
});
