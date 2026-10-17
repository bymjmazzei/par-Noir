/**
 * PNM1 encrypt/decrypt off the main thread. Falls back to inline when Worker is
 * unavailable (Node tests); the crypto itself is chunked and never base64s.
 */

import { decryptPenMedia, encryptPenMedia } from '@par-noir/dm-crypto';

export type CryptoRequest =
  | { id: number; op: 'encrypt'; blob: Blob; keyB64: string }
  | { id: number; op: 'decrypt'; blob: Blob; keyB64: string; mime: string };

export type CryptoResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: string };

type Pending = { resolve: (b: Blob) => void; reject: (e: Error) => void };

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
  worker.onmessage = (event: MessageEvent<CryptoResponse>) => {
    const res = event.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.blob);
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

function run(req: Omit<CryptoRequest, 'id'>): Promise<Blob> {
  const w = getWorker();
  if (!w) {
    return req.op === 'encrypt'
      ? encryptPenMedia(req.blob, req.keyB64)
      : decryptPenMedia(req.blob, req.keyB64, req.mime);
  }
  const id = nextId++;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...req, id } as CryptoRequest);
  });
}

export function sealMedia(blob: Blob, keyB64: string): Promise<Blob> {
  return run({ op: 'encrypt', blob, keyB64 });
}

export function openMedia(blob: Blob, keyB64: string, mime: string): Promise<Blob> {
  return run({ op: 'decrypt', blob, keyB64, mime });
}
