import * as Y from 'yjs';
import type { PenLiveBatch } from '@par-noir/pen-protocol';
import { sealBytes, signBatch } from './crypto.js';

export interface PenLiveSigner {
  pnHash: string;
  mlDsaSecretKey: Uint8Array;
}

export async function sealPenLiveBatch(params: {
  docId: string;
  keyEpoch: number;
  docKey: string;
  signer: PenLiveSigner;
  clientId: number;
  seq: number;
  type: PenLiveBatch['type'];
  payload: Uint8Array;
}): Promise<PenLiveBatch> {
  const ciphertext = await sealBytes(params.payload, params.docKey);
  return signBatch(
    {
      docId: params.docId,
      keyEpoch: params.keyEpoch,
      authorPnHash: params.signer.pnHash,
      clientId: params.clientId,
      seq: params.seq,
      type: params.type,
      ciphertext
    },
    params.signer.mlDsaSecretKey
  );
}

/**
 * Coalesce local Yjs updates for `windowMs` so one ML-DSA signature covers many
 * keystrokes.
 */
export class PenLiveUpdateBatcher {
  private pending: Uint8Array[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly windowMs: number,
    private readonly onFlush: (merged: Uint8Array) => void
  ) {}

  push(update: Uint8Array): void {
    this.pending.push(update);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.windowMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.length) return;
    const merged = this.pending.length === 1 ? this.pending[0]! : Y.mergeUpdates(this.pending);
    this.pending = [];
    this.onFlush(merged);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = [];
  }
}
