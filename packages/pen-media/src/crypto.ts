/**
 * Media worker client: PNM1 decrypt and encrypt+upload run off the main thread.
 * Falls back to inline when Worker is unavailable (Node tests).
 */

import { decryptPenMedia } from '@par-noir/dm-crypto/pen-media';
import { trackActivity } from './activity';
import { runUploadJob, type UploadJob, type UploadProgress } from './uploadJob';

export type WorkerRequest =
  | { id: number; op: 'decrypt'; blob: Blob; keyB64: string; mime: string }
  | { id: number; op: 'upload'; job: UploadJob }
  | { id: number; op: 'cancel' };

export type WorkerResponse =
  | { id: number; type: 'progress'; sent: number; total: number }
  | { id: number; type: 'done'; ok: true; blob?: Blob; fileId?: string }
  | { id: number; type: 'done'; ok: false; error: string };

type Pending = {
  resolve: (res: { blob?: Blob; fileId?: string }) => void;
  reject: (e: Error) => void;
  onProgress?: UploadProgress;
};

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const p = pending.get(res.id);
    if (!p) return;
    if (res.type === 'progress') {
      p.onProgress?.(res.sent, res.total);
      return;
    }
    pending.delete(res.id);
    if (res.ok) p.resolve(res);
    else p.reject(new Error(res.error));
  };
  worker.onerror = (event) => {
    workerBroken = true;
    worker = null;
    const err = new Error(event.message || 'pen_media_worker_failed');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  return worker;
}

function post(
  w: Worker,
  req: Exclude<WorkerRequest, { op: 'cancel' }>,
  onProgress?: UploadProgress
): Promise<{ blob?: Blob; fileId?: string }> {
  return new Promise((resolve, reject) => {
    pending.set(req.id, { resolve, reject, onProgress });
    w.postMessage(req);
  });
}

export function openMedia(blob: Blob, keyB64: string, mime: string): Promise<Blob> {
  return trackActivity('decrypt', async () => {
    const w = getWorker();
    if (!w) return decryptPenMedia(blob, keyB64, mime);
    const res = await post(w, { id: nextId++, op: 'decrypt', blob, keyB64, mime });
    return res.blob!;
  });
}

/** Encrypt with PNM1 and stream to Drive in the worker. Resolves with the Drive file id. */
export function uploadInWorker(
  job: UploadJob,
  opts?: { onProgress?: UploadProgress; signal?: AbortSignal }
): Promise<string> {
  return trackActivity('upload', async () => {
    opts?.signal?.throwIfAborted();
    const w = getWorker();
    if (!w) {
      try {
        return await runUploadJob(job, opts);
      } catch (e) {
        if (opts?.signal?.aborted) throw new Error('upload_cancelled');
        throw e;
      }
    }
    const id = nextId++;
    const onAbort = () => {
      w.postMessage({ id, op: 'cancel' } satisfies WorkerRequest);
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      p.reject(new Error('upload_cancelled'));
    };
    opts?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await post(w, { id, op: 'upload', job }, opts?.onProgress);
      return res.fileId!;
    } finally {
      opts?.signal?.removeEventListener('abort', onAbort);
    }
  });
}
