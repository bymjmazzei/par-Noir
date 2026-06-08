import secrets from 'secrets.js-grempe';

secrets.init(8);

export interface ShamirShare {
  /** Share index 1..n (from secrets.js encoding) */
  index: number;
  /** Full secrets.js share string — pass directly to combineShares */
  share: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** With init(8), share id is the third character of the share string. */
function shareIndex(share: string): number {
  return parseInt(share.charAt(2), 16);
}

export function splitSecret(secret: Uint8Array, threshold: number, totalShares: number): ShamirShare[] {
  if (threshold < 2 || threshold > 5) throw new Error('threshold must be 2..5');
  if (totalShares < threshold || totalShares > 5) throw new Error('totalShares must be threshold..5');
  if (secret.length === 0) throw new Error('secret must not be empty');
  const hex = bytesToHex(secret);
  const shareStrings = secrets.share(hex, totalShares, threshold);
  return shareStrings.map((share) => ({
    index: shareIndex(share),
    share
  }));
}

export function combineShares(shares: ShamirShare[]): Uint8Array {
  if (shares.length < 2) throw new Error('need at least 2 shares');
  const indices = shares.map((s) => s.index);
  if (new Set(indices).size !== indices.length) throw new Error('duplicate share indices');
  const combined = secrets.combine(shares.map((s) => s.share));
  return hexToBytes(combined);
}

export function generateRecoveryMaster(length = 32): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @deprecated Legacy JSON used `data` — normalize on read */
export function normalizeShare(raw: { index: number; data?: string; share?: string }): ShamirShare {
  if (raw.share) {
    return { index: raw.index, share: raw.share };
  }
  if (raw.data) {
    return { index: raw.index, share: raw.data };
  }
  throw new Error('Invalid Shamir share');
}
