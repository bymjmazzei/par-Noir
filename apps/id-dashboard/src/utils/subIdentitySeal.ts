/**
 * Seal sub-identity export payloads with a user passphrase (AES-GCM + PBKDF2).
 * No plaintext secrets in returned blob until user decrypts with passphrase.
 */

function bytesToB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function sealSubExportPayload(plaintextUtf8: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintextUtf8)
  );
  return JSON.stringify({
    v: 1,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct))
  });
}

export async function unsealSubExportPayload(sealedJson: string, passphrase: string): Promise<string> {
  const o = JSON.parse(sealedJson) as { v: number; salt: string; iv: string; ct: string };
  if (o.v !== 1 || !o.salt || !o.iv || !o.ct) throw new Error('Invalid sealed payload');
  const salt = b64ToBytes(o.salt);
  const iv = b64ToBytes(o.iv);
  const ct = b64ToBytes(o.ct);
  const key = await deriveAesKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}
