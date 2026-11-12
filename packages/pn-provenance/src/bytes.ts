import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';

export { base64ToBytes, bytesToBase64 };

/**
 * Bytes as c2pa libraries hand them over: Uint8Array, number[], plain base64, or the reader's
 * `b64'…'` JSON form.
 */
export function toBytes(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0 && n < 256)) {
    return new Uint8Array(v as number[]);
  }
  if (typeof v === 'string') {
    const m = /^b64'(.*)'$/s.exec(v);
    try {
      return base64ToBytes(m ? m[1]! : v);
    } catch {
      return null;
    }
  }
  return null;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
