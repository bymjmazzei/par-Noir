import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from './encoding.js';
import {
  decryptPenMedia,
  encryptPenMedia,
  isPenMediaHeader,
  penMediaEncryptedSize
} from './penMedia.js';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) {
    globalThis.crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  }
  return out;
}

const key = bytesToBase64(randomBytes(32));
const otherKey = bytesToBase64(randomBytes(32));
const CHUNK = 1024;

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('pen media PNM1 format', () => {
  for (const size of [0, 1, CHUNK, CHUNK + 1, CHUNK * 3 + 7]) {
    it(`round trips ${size} bytes`, async () => {
      const plain = randomBytes(size);
      const sealed = await encryptPenMedia(new Blob([plain]), key, { chunkSize: CHUNK });
      expect(sealed.size).toBe(penMediaEncryptedSize(size, CHUNK));
      expect(isPenMediaHeader(await bytesOf(sealed.slice(0, 4)))).toBe(true);
      const opened = await decryptPenMedia(sealed, key, 'video/mp4');
      expect(opened.type).toBe('video/mp4');
      expect(await bytesOf(opened)).toEqual(plain);
    });
  }

  it('contains no base64 expansion', async () => {
    const plain = randomBytes(CHUNK * 4);
    const sealed = await encryptPenMedia(new Blob([plain]), key, { chunkSize: CHUNK });
    expect(sealed.size).toBe(16 + plain.length + 4 * 28);
  });

  it('rejects the wrong key', async () => {
    const sealed = await encryptPenMedia(new Blob([randomBytes(50)]), key, { chunkSize: CHUNK });
    await expect(decryptPenMedia(sealed, otherKey)).rejects.toThrow();
  });

  it('rejects a tampered chunk', async () => {
    const sealed = await bytesOf(
      await encryptPenMedia(new Blob([randomBytes(CHUNK * 2)]), key, { chunkSize: CHUNK })
    );
    sealed[16 + 12 + 5] ^= 0xff;
    await expect(decryptPenMedia(new Blob([sealed]), key)).rejects.toThrow();
  });

  it('rejects swapped chunks', async () => {
    const sealed = await bytesOf(
      await encryptPenMedia(new Blob([randomBytes(CHUNK * 2)]), key, { chunkSize: CHUNK })
    );
    const each = 12 + CHUNK + 16;
    const first = sealed.slice(16, 16 + each);
    const second = sealed.slice(16 + each, 16 + 2 * each);
    sealed.set(second, 16);
    sealed.set(first, 16 + each);
    await expect(decryptPenMedia(new Blob([sealed]), key)).rejects.toThrow();
  });

  it('rejects a truncated file', async () => {
    const sealed = await encryptPenMedia(new Blob([randomBytes(CHUNK * 2)]), key, {
      chunkSize: CHUNK
    });
    await expect(decryptPenMedia(sealed.slice(0, sealed.size - 10), key)).rejects.toThrow(
      'pen_media_size_mismatch'
    );
  });

  it('rejects a non-PNM1 file', async () => {
    await expect(decryptPenMedia(new Blob([randomBytes(64)]), key)).rejects.toThrow(
      'pen_media_not_pnm1'
    );
  });
});
