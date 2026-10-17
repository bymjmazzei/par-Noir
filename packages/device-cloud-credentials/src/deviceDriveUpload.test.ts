import { describe, expect, it, vi } from 'vitest';
import { deviceDriveUploadBlob } from './deviceDriveUpload';

const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc';

function fakeGoogle(opts?: { failPiece?: number }) {
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
    const body = init?.body as Blob;
    const range = headers.get('Content-Range') || '';
    pieces.push({ range, size: body.size });
    if (opts?.failPiece === pieces.length) return new Response('nope', { status: 503 });
    const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/)!;
    const end = Number(match[2]);
    const total = Number(match[3]);
    if (end + 1 < total) {
      return new Response(null, { status: 308, headers: { Range: `bytes=0-${end}` } });
    }
    return new Response(JSON.stringify({ id: 'file-1', name: 'x.penmedia' }), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, pieces };
}

describe('deviceDriveUploadBlob', () => {
  it('sends raw bytes in pieces to a resumable session and returns the file id', async () => {
    const google = fakeGoogle();
    const blob = new Blob([new Uint8Array(25)]);
    const progress: number[] = [];
    const file = await deviceDriveUploadBlob({
      accessToken: 'google-at',
      blob,
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

  it('refuses an upload without a parent folder', async () => {
    const google = fakeGoogle();
    await expect(
      deviceDriveUploadBlob({
        accessToken: 'google-at',
        blob: new Blob([new Uint8Array(4)]),
        fileName: 'x',
        parents: [],
        fetchImpl: google.fetchImpl
      })
    ).rejects.toThrow('drive_parent_required');
  });

  it('fails loudly when a piece is rejected', async () => {
    const google = fakeGoogle({ failPiece: 2 });
    await expect(
      deviceDriveUploadBlob({
        accessToken: 'google-at',
        blob: new Blob([new Uint8Array(25)]),
        fileName: 'x',
        parents: ['p'],
        pieceBytes: 10,
        fetchImpl: google.fetchImpl
      })
    ).rejects.toThrow('drive_upload_piece_503');
  });
});
