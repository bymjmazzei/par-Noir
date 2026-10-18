import * as Y from 'yjs';
import { openBytes, sealBytes } from './crypto.js';

/** Durable live state: docKey envelope of a compacted Yjs update, tagged with its key epoch. */
export interface PenLiveSealedSnapshot {
  v: 1;
  keyEpoch: number;
  savedAt: string;
  ciphertext: string;
}

/** One merged update holding the whole doc (deleted content already GC'd). */
export function compactPenLiveState(ydoc: Y.Doc): Uint8Array {
  const fresh = new Y.Doc();
  Y.applyUpdate(fresh, Y.encodeStateAsUpdate(ydoc));
  const out = Y.encodeStateAsUpdate(fresh);
  fresh.destroy();
  return out;
}

export async function sealPenLiveSnapshot(
  ydoc: Y.Doc,
  docKey: string,
  keyEpoch: number
): Promise<PenLiveSealedSnapshot> {
  return {
    v: 1,
    keyEpoch,
    savedAt: new Date().toISOString(),
    ciphertext: await sealBytes(compactPenLiveState(ydoc), docKey)
  };
}

export function isPenLiveSealedSnapshot(value: unknown): value is PenLiveSealedSnapshot {
  const v = value as PenLiveSealedSnapshot | null;
  return Boolean(v && v.v === 1 && typeof v.keyEpoch === 'number' && typeof v.ciphertext === 'string');
}

/** Returns the Yjs update, or null when the snapshot belongs to another key epoch. */
export async function openPenLiveSnapshot(
  sealed: PenLiveSealedSnapshot,
  docKey: string,
  keyEpoch: number
): Promise<Uint8Array | null> {
  if (sealed.keyEpoch !== keyEpoch) return null;
  return openBytes(sealed.ciphertext, docKey);
}
