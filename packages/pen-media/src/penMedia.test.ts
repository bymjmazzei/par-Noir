import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChatKey, isPenMediaHeader } from '@par-noir/dm-crypto';

const drive = vi.hoisted(() => ({
  files: new Map<string, Blob>(),
  uploads: 0,
  failNext: 0
}));

vi.mock('@par-noir/device-cloud-credentials', () => ({
  deviceDriveUploadBlobForSession: vi.fn(async (p: { blob: Blob }) => {
    if (drive.failNext > 0) {
      drive.failNext -= 1;
      throw new Error('drive_upload_piece_503');
    }
    drive.uploads += 1;
    const id = `f${drive.uploads}`;
    drive.files.set(id, p.blob);
    return { id };
  }),
  deviceDriveDownloadBlobForSession: vi.fn(async (p: { fileId: string }) => {
    const hit = drive.files.get(p.fileId);
    if (!hit) throw new Error('drive_download_404');
    return hit;
  })
}));

import {
  awaitDocMedia,
  configurePenMedia,
  ensurePenMediaUrl,
  getLocalMedia,
  putLocalMedia,
  queueDocMedia,
  resetPenMediaQueueForTests,
  resolvePenMediaSrc,
  rewriteDocMediaRefs,
  UPLOAD_BACKOFF_MS
} from './index';

const MP4_HEAD = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const keys = new Map<string, string>();

function videoBlob(size = 64): Blob {
  const bytes = new Uint8Array(size);
  bytes.set(MP4_HEAD);
  for (let i = MP4_HEAD.length; i < size; i++) bytes[i] = i % 251;
  return new Blob([bytes], { type: 'video/mp4' });
}

async function bytesOf(b: Blob): Promise<number[]> {
  return [...new Uint8Array(await b.arrayBuffer())];
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  drive.files.clear();
  drive.uploads = 0;
  drive.failNext = 0;
  keys.clear();
  resetPenMediaQueueForTests();
  configurePenMedia({
    loadDocKey: (docId) => keys.get(docId) ?? null,
    mintDocKey: (docId) => {
      if (!keys.has(docId)) keys.set(docId, generateChatKey());
      return keys.get(docId)!;
    },
    resolveUploadFolder: async () => 'folder-media'
  });
});

describe('pen-media store', () => {
  it('stores the blob as-is and resolves a penlocal ref to a blob URL', async () => {
    const blob = videoBlob();
    const put = await putLocalMedia({ docId: 'd1', blob });
    expect(put.ref).toMatch(/^penlocal:m_/);
    const hit = await getLocalMedia(put.mediaId);
    expect(hit?.mime).toBe('video/mp4');
    expect(await bytesOf(hit!.blob)).toEqual(await bytesOf(blob));
    expect(await resolvePenMediaSrc(put.ref)).toBe(put.blobUrl);
  });
});

describe('pen-media queue', () => {
  it('uploads each blob once even when autosave queues it repeatedly', async () => {
    const put = await putLocalMedia({ docId: 'd2', blob: videoBlob() });
    const sections = [{ layers: [{ videoSrc: put.ref }] }];
    const rewrites: Map<string, string>[] = [];
    const job = { pnIdentifier: 'pn', docId: 'd2', sections, onRewritten: (m: Map<string, string>) => rewrites.push(m) };
    queueDocMedia(job);
    queueDocMedia(job);
    const done = await awaitDocMedia(job);
    expect(drive.uploads).toBe(1);
    expect(done.pending).toBe(0);
    expect((done.sections[0].layers[0] as { videoSrc: string }).videoSrc).toBe('penmedia:f1');
    expect(rewrites[0].get(put.ref)).toBe('penmedia:f1');

    const sealed = drive.files.get('f1')!;
    expect(isPenMediaHeader(new Uint8Array(await sealed.slice(0, 16).arrayBuffer()))).toBe(true);
    expect(await resolvePenMediaSrc('penmedia:f1')).toBe(put.blobUrl);
  });

  it('backs off after a failed upload instead of retrying on every save', async () => {
    const put = await putLocalMedia({ docId: 'd3', blob: videoBlob() });
    const job = { pnIdentifier: 'pn', docId: 'd3', sections: [{ layers: [{ imageSrc: put.ref }] }] };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    drive.failNext = 1;
    queueDocMedia(job);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    queueDocMedia(job);
    queueDocMedia(job);
    await flush();
    expect(drive.uploads).toBe(0);
    const t0 = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0 + UPLOAD_BACKOFF_MS[0] + 10);
    queueDocMedia(job);
    await vi.waitFor(() => expect(drive.uploads).toBe(1));
    now.mockRestore();
    warn.mockRestore();
  });

  it('rewrites only matching refs and keeps untouched objects', () => {
    const keep = { layers: [{ imageSrc: 'https://x/y.png' }] };
    const out = rewriteDocMediaRefs(
      [keep, { layers: [{ videoSrc: 'penlocal:a', audioTracks: [{ src: 'penlocal:b' }] }] }],
      { backgroundVideo: 'penlocal:a' },
      new Map([
        ['penlocal:a', 'penmedia:A'],
        ['penlocal:b', 'penmedia:B']
      ])
    );
    expect(out.sections[0]).toBe(keep);
    expect(out.sections[1].layers[0]).toEqual({ videoSrc: 'penmedia:A', audioTracks: [{ src: 'penmedia:B' }] });
    expect(out.pagePresentation?.backgroundVideo).toBe('penmedia:A');
  });
});

describe('pen-media download', () => {
  it('decrypts a PNM1 Drive file on a fresh device and caches it', async () => {
    const original = videoBlob(5000);
    const put = await putLocalMedia({ docId: 'd4', blob: original });
    await awaitDocMedia({ pnIdentifier: 'pn', docId: 'd4', sections: [{ layers: [{ videoSrc: put.ref }] }] });
    drive.files.set('f9', drive.files.get('f1')!);

    const url = await ensurePenMediaUrl({ src: 'penmedia:f9', docId: 'd4', pnIdentifier: 'pn' });
    expect(url).toMatch(/^blob:/);
    expect(await resolvePenMediaSrc('penmedia:f9')).toBe(url);
    const cached = await getLocalMedia('drive_f9');
    expect(cached?.mime).toBe('video/mp4');
    expect(await bytesOf(cached!.blob)).toEqual(await bytesOf(original));
  });

  it('passes raw (unencrypted) Drive media through with a sniffed type', async () => {
    drive.files.set('raw1', new Blob([videoBlob()]));
    const url = await ensurePenMediaUrl({ src: 'penmedia:raw1', docId: 'd5', pnIdentifier: 'pn' });
    expect(url).toMatch(/^blob:/);
    expect((await getLocalMedia('drive_raw1'))?.mime).toBe('video/mp4');
  });

  it('refuses PNM1 without the doc key', async () => {
    const put = await putLocalMedia({ docId: 'd6', blob: videoBlob() });
    await awaitDocMedia({ pnIdentifier: 'pn', docId: 'd6', sections: [{ layers: [{ videoSrc: put.ref }] }] });
    drive.files.set('f7', drive.files.get('f1')!);
    await expect(
      ensurePenMediaUrl({ src: 'penmedia:f7', docId: 'other-doc', pnIdentifier: 'pn' })
    ).rejects.toThrow('doc_key_required');
  });
});
