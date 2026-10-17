import { describe, expect, it, vi } from 'vitest';
import { deviceDriveUploadStream } from './deviceDriveUploadStream';

const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc';

function fakeGoogle(opts?: { failPiece?: number; shortConfirmPiece?: number }) {
  const pieces: Array<{ range: string; size: number }> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    expect(String(url)).not.toContain('api.parnoir.com');
    if (init?.method === 'POST') {
      const headers = new Headers(init.headers);
      expect(headers.get('Authorization')).toBe('Bearer google-at');
      expect(String(url)).toContain('uploadType=resumable');
      return new Response(null, { status: 200, headers: { Location: SESSION } });
    }
    expect(url).toBe(SESSION);
    const headers = new Headers(init?.headers);
    const body = init?.body as Uint8Array;
    const range = headers.get('Content-Range') || '';
    pieces.push({ range, size: body.length });
    if (opts?.failPiece === pieces.length) return new Response('nope', { status: 503 });
    const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/)!;
    let end = Number(match[2]);
    const total = Number(match[3]);
    if (opts?.shortConfirmPiece === pieces.length) end -= 3;
    if (end + 1 < total) {
      return new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } });
    }
    return new Response(JSON.stringify({ id: 'file-1', name: 'x.penmedia' }), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, pieces };
}

async function* segmentsOf(sizes: number[]): AsyncGenerator<Uint8Array> {
  for (const n of sizes) yield new Uint8Array(n);
}

describe('deviceDriveUploadStream', () => {
  it('cuts uneven segments into exact pieces with contiguous ranges', async () => {
    const google = fakeGoogle();
    const progress: number[] = [];
    const file = await deviceDriveUploadStream({
      accessToken: 'google-at',
      totalBytes: 25,
      segments: segmentsOf([3, 7, 1, 14]),
      fileName: 'x.penmedia',
      parents: ['folder-1'],
      pieceBytes: 10,
      fetchImpl: google.fetchImpl,
      onProgress: (sent) => progress.push(sent)
    });
    expect(file.id).toBe('file-1');
    expect(google.pieces).toEqual([
      { range: 'bytes 0-9/25', size: 10 },
      { range: 'bytes 10-19/25', size: 10 },
      { range: 'bytes 20-24/25', size: 5 }
    ]);
    expect(progress).toEqual([10, 20, 25]);
  });

  it('resends the unconfirmed tail when Google keeps fewer bytes', async () => {
    const google = fakeGoogle({ shortConfirmPiece: 1 });
    await deviceDriveUploadStream({
      accessToken: 'google-at',
      totalBytes: 20,
      segments: segmentsOf([20]),
      fileName: 'x',
      parents: ['p'],
      pieceBytes: 10,
      fetchImpl: google.fetchImpl
    });
    expect(google.pieces.map((p) => p.range)).toEqual([
      'bytes 0-9/20',
      'bytes 7-9/20',
      'bytes 10-19/20'
    ]);
  });

  it('stops when aborted', async () => {
    const google = fakeGoogle();
    const controller = new AbortController();
    await expect(
      deviceDriveUploadStream({
        accessToken: 'google-at',
        totalBytes: 30,
        segments: segmentsOf([30]),
        fileName: 'x',
        parents: ['p'],
        pieceBytes: 10,
        fetchImpl: google.fetchImpl,
        signal: controller.signal,
        onProgress: () => controller.abort()
      })
    ).rejects.toThrow();
    expect(google.pieces).toHaveLength(1);
  });

  it('fails when the stream is shorter than declared', async () => {
    const google = fakeGoogle();
    await expect(
      deviceDriveUploadStream({
        accessToken: 'google-at',
        totalBytes: 25,
        segments: segmentsOf([12]),
        fileName: 'x',
        parents: ['p'],
        pieceBytes: 10,
        fetchImpl: google.fetchImpl
      })
    ).rejects.toThrow('drive_upload_short_stream');
  });

  it('refuses an upload without a parent folder', async () => {
    const google = fakeGoogle();
    await expect(
      deviceDriveUploadStream({
        accessToken: 'google-at',
        totalBytes: 4,
        segments: segmentsOf([4]),
        fileName: 'x',
        parents: [],
        fetchImpl: google.fetchImpl
      })
    ).rejects.toThrow('drive_parent_required');
  });

  it('fails loudly when a piece is rejected', async () => {
    const google = fakeGoogle({ failPiece: 2 });
    await expect(
      deviceDriveUploadStream({
        accessToken: 'google-at',
        totalBytes: 25,
        segments: segmentsOf([25]),
        fileName: 'x',
        parents: ['p'],
        pieceBytes: 10,
        fetchImpl: google.fetchImpl
      })
    ).rejects.toThrow('drive_upload_piece_503');
  });
});
