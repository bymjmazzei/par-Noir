/// <reference lib="webworker" />
import { decryptPenMedia } from '@par-noir/dm-crypto/pen-media';
import type { WorkerRequest, WorkerResponse } from './crypto';
import { runUploadJob } from './uploadJob';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const aborts = new Map<number, AbortController>();

function errorText(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return 'upload_cancelled';
  return e instanceof Error ? e.message : String(e);
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.op === 'cancel') {
    aborts.get(req.id)?.abort();
    return;
  }
  let res: WorkerResponse;
  try {
    if (req.op === 'decrypt') {
      const blob = await decryptPenMedia(req.blob, req.keyB64, req.mime);
      res = { id: req.id, type: 'done', ok: true, blob };
    } else {
      const controller = new AbortController();
      aborts.set(req.id, controller);
      const fileId = await runUploadJob(req.job, {
        signal: controller.signal,
        onProgress: (sent, total) =>
          scope.postMessage({ id: req.id, type: 'progress', sent, total } satisfies WorkerResponse)
      });
      res = { id: req.id, type: 'done', ok: true, fileId };
    }
  } catch (e) {
    res = { id: req.id, type: 'done', ok: false, error: errorText(e) };
  } finally {
    aborts.delete(req.id);
  }
  scope.postMessage(res);
};
