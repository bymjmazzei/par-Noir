import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './encoding.js';

function charLoopBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) {
    globalThis.crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  }
  return out;
}

const SIZES = [0, 1, 2, 3, 0x8000 - 1, 0x8000, 0x8000 + 1, 0x8000 * 3 + 5];

describe('base64 helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('match the old char-by-char output', () => {
    for (const size of SIZES) {
      const bytes = randomBytes(size);
      expect(bytesToBase64(bytes)).toBe(charLoopBase64(bytes));
      expect(base64ToBytes(charLoopBase64(bytes))).toEqual(bytes);
    }
  });

  it('chunked browser fallback matches without Buffer', () => {
    vi.stubGlobal('Buffer', undefined);
    for (const size of SIZES) {
      const bytes = randomBytes(size);
      expect(bytesToBase64(bytes)).toBe(charLoopBase64(bytes));
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it('encodes a subarray view, not its whole buffer', () => {
    const whole = randomBytes(64);
    const view = whole.subarray(10, 20);
    expect(bytesToBase64(view)).toBe(charLoopBase64(view));
  });
});
