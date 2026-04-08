import { sha3_384 } from '@noble/hashes/sha3.js';
import { STARK_FIELD_MODULUS } from './constants';

const SEP = '\u001e';

export function sortKeysDeep(x: unknown): unknown {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  const o = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

export function stablePublicInputsJson(publicInputs: Record<string, unknown>): string {
  return JSON.stringify(sortKeysDeep(publicInputs));
}

/** UTF-8 bytes of binding string per ZK_PROOF_V2.md */
export function bindingUtf8(
  publicInputs: Record<string, unknown>,
  context: string,
  nonce: string
): Uint8Array {
  const s = stablePublicInputsJson(publicInputs) + SEP + context + SEP + nonce;
  return new TextEncoder().encode(s);
}

export function bindingDigest384(
  publicInputs: Record<string, unknown>,
  context: string,
  nonce: string
): Uint8Array {
  return sha3_384(bindingUtf8(publicInputs, context, nonce));
}

/** Six STARK public limbs from 48-byte SHA3-384 digest. */
export function digestToStarkLimbs(digest48: Uint8Array): bigint[] {
  if (digest48.length !== 48) {
    throw new Error('binding digest must be 48 bytes (SHA3-384)');
  }
  const p = STARK_FIELD_MODULUS;
  const limbs: bigint[] = [];
  for (let i = 0; i < 6; i++) {
    let v = 0n;
    for (let j = 0; j < 8; j++) {
      v = (v << 8n) | BigInt(digest48[i * 8 + j]!);
    }
    limbs.push(v % p);
  }
  return limbs;
}

function modField(x: bigint): bigint {
  const p = STARK_FIELD_MODULUS;
  let y = x % p;
  if (y < 0n) y += p;
  return y;
}

/** Deterministic final register-0 value for assertions (must match AIR). */
export function computeStarkFinalR0(w: bigint, limbs: bigint[]): bigint {
  if (limbs.length !== 6) throw new Error('expected 6 limbs');
  const b0 = limbs[0]!;
  const sum = limbs.reduce((a, b) => modField(a + b), 0n);
  let r0 = modField(w + sum);
  const r1 = modField(b0);
  for (let i = 1; i <= 63; i++) {
    r0 = modField(r0 + r0 + r0 + r1);
  }
  return r0;
}

/** Uniform non-zero witness in F_p (reject 0). */
export function randomWitnessScalar(): bigint {
  const p = STARK_FIELD_MODULUS;
  const buf = new Uint8Array(16);
  globalThis.crypto.getRandomValues(buf);
  let w = 0n;
  for (let i = 0; i < buf.length; i++) w = (w << 8n) | BigInt(buf[i]!);
  w = modField(w);
  if (w === 0n) w = 1n;
  return w;
}
