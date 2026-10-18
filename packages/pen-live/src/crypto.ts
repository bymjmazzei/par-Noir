import { decryptMediaBytes, encryptMediaBytes } from '@par-noir/dm-crypto';
import { mlDsa65Sign, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import type { PenLiveBatch } from '@par-noir/pen-protocol';

export { base64ToBytes, bytesToBase64 };

/** AES-GCM docKey envelope (same format as Pen sections and group DMs). */
export function sealBytes(bytes: Uint8Array, docKeyB64: string): Promise<string> {
  return encryptMediaBytes(bytes, docKeyB64);
}

export function openBytes(envelope: string, docKeyB64: string): Promise<Uint8Array> {
  return decryptMediaBytes(envelope, docKeyB64);
}

/** Canonical bytes covered by a live batch signature. */
export function penLiveSigningBytes(batch: Omit<PenLiveBatch, 'signature'>): Uint8Array {
  return new TextEncoder().encode(
    [
      'pen-live/v1',
      batch.docId,
      String(batch.keyEpoch),
      batch.authorPnHash,
      String(batch.clientId),
      String(batch.seq),
      batch.type,
      batch.ciphertext
    ].join('|')
  );
}

export function signBatch(
  unsigned: Omit<PenLiveBatch, 'signature'>,
  mlDsaSecretKey: Uint8Array
): PenLiveBatch {
  const signature = bytesToBase64(mlDsa65Sign(penLiveSigningBytes(unsigned), mlDsaSecretKey));
  return { ...unsigned, signature };
}

export function verifyBatchSignature(batch: PenLiveBatch, mlDsaPublicKeyB64: string): boolean {
  try {
    const { signature, ...unsigned } = batch;
    return mlDsa65Verify(
      base64ToBytes(signature),
      penLiveSigningBytes(unsigned),
      base64ToBytes(mlDsaPublicKeyB64)
    );
  } catch {
    return false;
  }
}
