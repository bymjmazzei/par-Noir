import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChatKey, isPenMediaHeader } from '@par-noir/dm-crypto';

const drive = vi.hoisted(() => ({
  files: new Map<string, Blob>(),
  uploads: 0,
  downloads: 0,
  failNext: 0,
  noToken: false,
  gate: null as Promise<void> | null
}));

vi.mock('@par-noir/device-cloud-credentials', () => ({
  getCloudAccessTokenFromSession: vi.fn(() => (drive.noToken ? null : 'google-at')),
  deviceDriveDownloadBlobForSession: vi.fn(async (p: { fileId: string }) => {
    drive.downloads += 1;
    const hit = drive.files.get(p.fileId);
    if (!hit) throw new Error('drive_download_404');
    return hit;
  })
}));

vi.mock('@par-noir/device-cloud-credentials/drive-upload-stream', () => ({
  deviceDriveUploadStream: vi.fn(
    async (p: {
      accessToken: string;
      totalBytes: number;
      segments: AsyncIterable<Uint8Array>;
      signal?: AbortSignal;
      onProgress?: (sent: number, total: number) => void;
    }) => {
      expect(p.accessToken).toBe('google-at');
      if (drive.failNext > 0) {
        drive.failNext -= 1;
        throw new Error('drive_upload_piece_503');
      }
      const parts: Uint8Array[] = [];
      let sent = 0;
      for await (const seg of p.segments) {
        if (drive.gate) await drive.gate;
        p.signal?.throwIfAborted();
        parts.push(seg);
        sent += seg.length;
        p.onProgress?.(sent, p.totalBytes);
      }
      expect(sent).toBe(p.totalBytes);
      drive.uploads += 1;
      const id = `f${drive.uploads}`;
      drive.files.set(id, new Blob(parts));
      return { id };
    }
  )
}));

import {
  attachMediaFile,
  collectLocalMediaRefs,
  configurePenMedia,
  deleteLocalMedia,
  ensurePenMediaUrl,
  getLocalMedia,
  penMediaActivity,
  putLocalMedia,
  resolvePenMediaSrc,
  uploadStoredMedia
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

beforeEach(async () => {
  for (let i = 1; i <= 3; i++) await deleteLocalMedia(`drive_f${i}`);
  drive.files.clear();
  drive.uploads = 0;
  drive.downloads = 0;
  drive.failNext = 0;
  drive.noToken = false;
  drive.gate = null;
  keys.clear();
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

describe('pen-media attach (upload first)', () => {
  it('uploads PNM1 to Drive before returning, then caches the file once', async () => {
    const file = videoBlob(3000);
    const progress: number[] = [];
    const out = await attachMediaFile({
      pnIdentifier: 'pn',
      docId: 'a1',
      file,
      onProgress: (sent) => progress.push(sent)
    });
    expect(out.ref).toBe('penmedia:f1');
    expect(out.mime).toBe('video/mp4');
    expect(drive.uploads).toBe(1);
    expect(progress.length).toBeGreaterThan(0);
    const sealed = drive.files.get('f1')!;
    expect(isPenMediaHeader(new Uint8Array(await sealed.slice(0, 16).arrayBuffer()))).toBe(true);
    const cached = await getLocalMedia('drive_f1');
    expect(cached?.driveFileId).toBe('f1');
    expect(await bytesOf(cached!.blob)).toEqual(await bytesOf(file));
    expect(await resolvePenMediaSrc(out.ref)).toBe(out.blobUrl);
    expect(penMediaActivity()).toEqual({});
  });

  it('stores nothing when the upload fails, and a retry succeeds', async () => {
    drive.failNext = 1;
    await expect(attachMediaFile({ pnIdentifier: 'pn', docId: 'a2', file: videoBlob() })).rejects.toThrow(
      'drive_upload_piece_503'
    );
    expect(await getLocalMedia('drive_f1')).toBeNull();
    const out = await attachMediaFile({ pnIdentifier: 'pn', docId: 'a2', file: videoBlob() });
    expect(out.ref).toBe('penmedia:f1');
  });

  it('refuses without a device cloud token', async () => {
    drive.noToken = true;
    await expect(attachMediaFile({ pnIdentifier: 'pn', docId: 'a3', file: videoBlob() })).rejects.toThrow(
      'cloud_on_device'
    );
    expect(drive.uploads).toBe(0);
  });

  it('cancels mid-upload and stores nothing; activity shows the upload while it runs', async () => {
    let release!: () => void;
    drive.gate = new Promise<void>((r) => (release = r));
    const controller = new AbortController();
    const job = attachMediaFile({ pnIdentifier: 'pn', docId: 'a4', file: videoBlob(), signal: controller.signal });
    await vi.waitFor(() => expect(penMediaActivity().upload).toBe(1));
    controller.abort();
    release();
    await expect(job).rejects.toThrow('upload_cancelled');
    expect(drive.uploads).toBe(0);
    expect(await getLocalMedia('drive_f1')).toBeNull();
    expect(penMediaActivity()).toEqual({});
  });

  it('uploads a stored offline blob later and moves it to its Drive id', async () => {
    const put = await putLocalMedia({ docId: 'a5', blob: videoBlob() });
    const fileId = await uploadStoredMedia({ pnIdentifier: 'pn', docId: 'a5', mediaId: put.mediaId });
    expect(fileId).toBe('f1');
    expect(await getLocalMedia(put.mediaId)).toBeNull();
    expect((await getLocalMedia('drive_f1'))?.mime).toBe('video/mp4');
    expect(await uploadStoredMedia({ pnIdentifier: 'pn', docId: 'a5', mediaId: 'drive_f1' })).toBe('f1');
    expect(drive.uploads).toBe(1);
    expect(await getLocalMedia('drive_f1')).not.toBeNull();
  });

  it('lists penlocal refs left in a doc', () => {
    expect(
      collectLocalMediaRefs(
        [{ layers: [{ videoSrc: 'penlocal:a', audioTracks: [{ src: 'penlocal:b' }, { src: 'penmedia:c' }] }] }],
        { backgroundImage: 'penlocal:a', backgroundVideo: 'penmedia:d' }
      )
    ).toEqual(['penlocal:a', 'penlocal:b']);
  });
});

describe('pen-media download', () => {
  it('decrypts a PNM1 Drive file on a fresh device and caches it', async () => {
    const original = videoBlob(5000);
    await attachMediaFile({ pnIdentifier: 'pn', docId: 'd4', file: original });
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
    await attachMediaFile({ pnIdentifier: 'pn', docId: 'd6', file: videoBlob() });
    drive.files.set('f7', drive.files.get('f1')!);
    await expect(
      ensurePenMediaUrl({ src: 'penmedia:f7', docId: 'other-doc', pnIdentifier: 'pn' })
    ).rejects.toThrow('doc_key_required');
  });

  it('downloads PNM1 once when the doc key lands after the first try', async () => {
    const original = videoBlob(4000);
    await attachMediaFile({ pnIdentifier: 'pn', docId: 'd8', file: original });
    drive.files.set('f8', drive.files.get('f1')!);
    const params = { src: 'penmedia:f8', docId: 'late-key-doc', pnIdentifier: 'pn' };

    await expect(ensurePenMediaUrl(params)).rejects.toThrow('doc_key_required');
    await expect(ensurePenMediaUrl(params)).rejects.toThrow('doc_key_required');
    keys.set('late-key-doc', keys.get('d8')!);
    const url = await ensurePenMediaUrl(params);

    expect(url).toMatch(/^blob:/);
    expect(drive.downloads).toBe(1);
    expect(await bytesOf((await getLocalMedia('drive_f8'))!.blob)).toEqual(await bytesOf(original));
  });
});
