/**
 * Raw-byte Drive upload from the device: Google resumable session fed by a byte stream.
 * Bytes are cut into fixed pieces and each piece is dropped once Google confirms it, so
 * memory stays at one piece regardless of file size. No imports: safe inside a worker.
 */

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

/** Google requires non-final pieces in multiples of 256 KiB. */
export const DRIVE_UPLOAD_PIECE_BYTES = 8 * 1024 * 1024;

export type DriveUploadedFile = { id: string; name?: string; mimeType?: string };

export type DeviceDriveUploadStreamParams = {
  accessToken: string;
  /** Exact byte length the stream will produce. */
  totalBytes: number;
  segments: AsyncIterable<Uint8Array>;
  fileName: string;
  parents: string[];
  mimeType?: string;
  pieceBytes?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
};

function confirmedOffset(res: Response, fallback: number): number {
  const range = res.headers.get('Range');
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : fallback;
}

function pieceReader(segments: AsyncIterable<Uint8Array>) {
  const it = segments[Symbol.asyncIterator]();
  let pending: Uint8Array | null = null;
  return async (size: number): Promise<Uint8Array> => {
    const buf = new Uint8Array(size);
    let pos = 0;
    while (pos < size) {
      if (!pending || pending.length === 0) {
        const next = await it.next();
        if (next.done) break;
        pending = next.value;
        continue;
      }
      const take = Math.min(size - pos, pending.length);
      buf.set(pending.subarray(0, take), pos);
      pending = pending.subarray(take);
      pos += take;
    }
    return pos === size ? buf : buf.subarray(0, pos);
  };
}

async function finish(res: Response): Promise<DriveUploadedFile> {
  const file = (await res.json()) as DriveUploadedFile;
  if (!file?.id) throw new Error('drive_upload_no_file_id');
  return file;
}

export async function deviceDriveUploadStream(
  params: DeviceDriveUploadStreamParams
): Promise<DriveUploadedFile> {
  const fetchImpl = params.fetchImpl || fetch;
  if (!params.parents.length) throw new Error('drive_parent_required');
  const pieceBytes = params.pieceBytes ?? DRIVE_UPLOAD_PIECE_BYTES;
  const total = params.totalBytes;
  const signal = params.signal;
  signal?.throwIfAborted();

  const start = await fetchImpl(`${UPLOAD}?uploadType=resumable&fields=id,name,mimeType`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': params.mimeType || 'application/octet-stream',
      'X-Upload-Content-Length': String(total)
    },
    body: JSON.stringify({ name: params.fileName, parents: params.parents }),
    signal
  });
  if (!start.ok) throw new Error(`drive_upload_start_${start.status}`);
  const session = start.headers.get('Location');
  if (!session) throw new Error('drive_upload_session_missing');

  if (total === 0) {
    const res = await fetchImpl(session, {
      method: 'PUT',
      headers: { 'Content-Range': 'bytes */0' },
      signal
    });
    if (res.status === 200 || res.status === 201) return finish(res);
    throw new Error(`drive_upload_piece_${res.status}`);
  }

  const readPiece = pieceReader(params.segments);
  let offset = 0;
  while (offset < total) {
    signal?.throwIfAborted();
    const want = Math.min(pieceBytes, total - offset);
    const piece = await readPiece(want);
    if (piece.length !== want) throw new Error('drive_upload_short_stream');
    const end = offset + piece.length;
    let from = 0;
    for (;;) {
      signal?.throwIfAborted();
      const res = await fetchImpl(session, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset + from}-${end - 1}/${total}` },
        body: piece.subarray(from),
        signal
      });
      if (res.status === 200 || res.status === 201) {
        params.onProgress?.(total, total);
        return finish(res);
      }
      if (res.status !== 308) throw new Error(`drive_upload_piece_${res.status}`);
      const confirmed = confirmedOffset(res, end);
      if (confirmed >= end) break;
      from = Math.max(0, confirmed - offset);
    }
    offset = end;
    params.onProgress?.(offset, total);
  }
  throw new Error('drive_upload_incomplete');
}
