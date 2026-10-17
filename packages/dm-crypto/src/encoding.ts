type NativeBase64Bytes = Uint8Array & { toBase64?: () => string };
type NativeBase64Ctor = typeof Uint8Array & { fromBase64?: (b64: string) => Uint8Array };

/** Binary-string chunk size; String.fromCharCode.apply argument limits sit well above this. */
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  const native = bytes as NativeBase64Bytes;
  if (typeof native.toBase64 === 'function') return native.toBase64();
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(''));
}

export function base64ToBytes(b64: string): Uint8Array {
  const ctor = Uint8Array as NativeBase64Ctor;
  if (typeof ctor.fromBase64 === 'function') {
    try {
      return ctor.fromBase64(b64);
    } catch {
      /* lenient decoders below accept whitespace and missing padding */
    }
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function bytesToUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}
