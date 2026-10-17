/// <reference lib="webworker" />
import { decryptPenMedia, encryptPenMedia } from '@par-noir/dm-crypto';
import type { CryptoRequest, CryptoResponse } from './crypto';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<CryptoRequest>) => {
  const req = event.data;
  let res: CryptoResponse;
  try {
    const blob =
      req.op === 'encrypt'
        ? await encryptPenMedia(req.blob, req.keyB64)
        : await decryptPenMedia(req.blob, req.keyB64, req.mime);
    res = { id: req.id, ok: true, blob };
  } catch (e) {
    res = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  scope.postMessage(res);
};
