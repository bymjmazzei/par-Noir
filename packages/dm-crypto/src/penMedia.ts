/**
 * Pen media file format: binary, chunked AES-256-GCM. No base64.
 *
 * Header (16 bytes): "PNM1" | uint32 chunkSize | uint64 plaintextLength (big-endian).
 * Body: ceil(len / chunkSize) chunks (at least one), each iv(12) | ciphertext | tag(16).
 * Every chunk authenticates header + chunk index + final flag, so reorder, drop,
 * truncation and header edits all fail decryption.
 */

import { base64ToBytes } from './encoding.js';

export const PEN_MEDIA_MAGIC = 'PNM1';
export const PEN_MEDIA_HEADER_BYTES = 16;
export const PEN_MEDIA_CHUNK_BYTES = 4 * 1024 * 1024;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto subtle API is not available');
  return s;
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyB64);
  if (raw.length !== 32) throw new Error('pen_media_key_length');
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function writeHeader(chunkSize: number, length: number): Uint8Array {
  const header = new Uint8Array(PEN_MEDIA_HEADER_BYTES);
  header.set(new TextEncoder().encode(PEN_MEDIA_MAGIC), 0);
  const view = new DataView(header.buffer);
  view.setUint32(4, chunkSize);
  view.setUint32(8, Math.floor(length / 2 ** 32));
  view.setUint32(12, length >>> 0);
  return header;
}

function readHeader(header: Uint8Array): { chunkSize: number; length: number } {
  if (header.length < PEN_MEDIA_HEADER_BYTES || !isPenMediaHeader(header)) {
    throw new Error('pen_media_not_pnm1');
  }
  const view = new DataView(header.buffer, header.byteOffset, PEN_MEDIA_HEADER_BYTES);
  const chunkSize = view.getUint32(4);
  const length = view.getUint32(8) * 2 ** 32 + view.getUint32(12);
  if (!(chunkSize > 0)) throw new Error('pen_media_chunk_size');
  return { chunkSize, length };
}

function chunkCount(length: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(length / chunkSize));
}

function chunkAad(header: Uint8Array, index: number, final: boolean): Uint8Array {
  const aad = new Uint8Array(PEN_MEDIA_HEADER_BYTES + 5);
  aad.set(header.subarray(0, PEN_MEDIA_HEADER_BYTES), 0);
  new DataView(aad.buffer).setUint32(PEN_MEDIA_HEADER_BYTES, index);
  aad[PEN_MEDIA_HEADER_BYTES + 4] = final ? 1 : 0;
  return aad;
}

/** True when the first bytes are a PNM1 header. */
export function isPenMediaHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return new TextDecoder().decode(bytes.subarray(0, 4)) === PEN_MEDIA_MAGIC;
}

/** Size of the encrypted file for a plaintext of `length` bytes. */
export function penMediaEncryptedSize(length: number, chunkSize = PEN_MEDIA_CHUNK_BYTES): number {
  return PEN_MEDIA_HEADER_BYTES + length + chunkCount(length, chunkSize) * (IV_BYTES + TAG_BYTES);
}

/** Encrypt a file chunk by chunk. Only one chunk of plaintext is in memory at a time. */
export async function encryptPenMedia(
  source: Blob,
  keyB64: string,
  opts?: { chunkSize?: number }
): Promise<Blob> {
  const chunkSize = opts?.chunkSize ?? PEN_MEDIA_CHUNK_BYTES;
  const key = await importKey(keyB64);
  const header = writeHeader(chunkSize, source.size);
  const count = chunkCount(source.size, chunkSize);
  const parts: BlobPart[] = [header];
  for (let i = 0; i < count; i += 1) {
    const plain = new Uint8Array(
      await source.slice(i * chunkSize, Math.min(source.size, (i + 1) * chunkSize)).arrayBuffer()
    );
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const sealed = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: chunkAad(header, i, i === count - 1) },
      key,
      plain
    );
    parts.push(iv, new Uint8Array(sealed));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

/** Decrypt a PNM1 file chunk by chunk. Throws on a wrong key or any tampering. */
export async function decryptPenMedia(source: Blob, keyB64: string, mime = ''): Promise<Blob> {
  const header = new Uint8Array(await source.slice(0, PEN_MEDIA_HEADER_BYTES).arrayBuffer());
  const { chunkSize, length } = readHeader(header);
  if (source.size !== penMediaEncryptedSize(length, chunkSize)) {
    throw new Error('pen_media_size_mismatch');
  }
  const key = await importKey(keyB64);
  const count = chunkCount(length, chunkSize);
  const parts: BlobPart[] = [];
  let offset = PEN_MEDIA_HEADER_BYTES;
  for (let i = 0; i < count; i += 1) {
    const plainLen = i === count - 1 ? length - i * chunkSize : chunkSize;
    const end = offset + IV_BYTES + plainLen + TAG_BYTES;
    const sealed = new Uint8Array(await source.slice(offset, end).arrayBuffer());
    const plain = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: sealed.subarray(0, IV_BYTES),
        additionalData: chunkAad(header, i, i === count - 1)
      },
      key,
      sealed.subarray(IV_BYTES)
    );
    parts.push(new Uint8Array(plain));
    offset = end;
  }
  return new Blob(parts, { type: mime });
}
