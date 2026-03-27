import { sha3_384 } from '@noble/hashes/sha3.js';
import { G_HEX, P_HEX, Q_HEX, RFC5114_GROUP_ID, hexToBigInt } from './rfc5114';
import { mod, modMul, modPow } from './bigintMod';

const P = hexToBigInt(P_HEX);
const Q = hexToBigInt(Q_HEX);
const G = hexToBigInt(G_HEX);

function getWebCrypto(): Crypto {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c;
  throw new Error('crypto.getRandomValues is not available');
}

function randomBelow(max: bigint): bigint {
  const bytes = new Uint8Array(64);
  getWebCrypto().getRandomValues(bytes);
  let x = 0n;
  for (let i = 0; i < bytes.length; i++) x = (x << 8n) | BigInt(bytes[i]!);
  return x % max === 0n ? 1n : x % max;
}

function randomScalar(): bigint {
  return randomBelow(Q - 1n) + 1n;
}

function challengeToBigInt(digest: Uint8Array): bigint {
  let c = 0n;
  for (let i = 0; i < digest.length; i++) c = (c << 8n) | BigInt(digest[i]!);
  return mod(c, Q);
}

export function computeChallenge(params: {
  context: string;
  nonce: string;
  publicInputsJson: string;
  yHex: string;
  tHex: string;
}): bigint {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(params.context),
    new Uint8Array([0]),
    enc.encode(params.yHex),
    new Uint8Array([0]),
    enc.encode(params.tHex),
    new Uint8Array([0]),
    enc.encode(params.publicInputsJson),
    new Uint8Array([0]),
    enc.encode(params.nonce),
  ];
  const total = parts.reduce((a, b) => a + b.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return challengeToBigInt(sha3_384(buf));
}

export interface SigmaProof {
  group: typeof RFC5114_GROUP_ID;
  y_hex: string;
  t_hex: string;
  s_hex: string;
  challenge_hex: string;
}

export function generateSigmaProof(params: {
  context: string;
  nonce: string;
  publicInputs: Record<string, unknown>;
}): SigmaProof {
  const publicInputsJson = stableStringify(params.publicInputs);
  const x = randomScalar();
  const k = randomScalar();
  const Y = modPow(G, x, P);
  const T = modPow(G, k, P);
  const yHex = Y.toString(16);
  const tHex = T.toString(16);
  const c = computeChallenge({
    context: params.context,
    nonce: params.nonce,
    publicInputsJson,
    yHex,
    tHex,
  });
  const s = mod(k + mod(c * x, Q), Q);
  return {
    group: RFC5114_GROUP_ID,
    y_hex: yHex,
    t_hex: tHex,
    s_hex: s.toString(16),
    challenge_hex: c.toString(16),
  };
}

export function verifySigmaProof(params: {
  context: string;
  nonce: string;
  publicInputs: Record<string, unknown>;
  sigma: SigmaProof;
}): boolean {
  try {
    if (params.sigma.group !== RFC5114_GROUP_ID) return false;
    const publicInputsJson = stableStringify(params.publicInputs);
    const Y = BigInt(`0x${params.sigma.y_hex}`);
    const T = BigInt(`0x${params.sigma.t_hex}`);
    const s = BigInt(`0x${params.sigma.s_hex}`);
    const cExpected = computeChallenge({
      context: params.context,
      nonce: params.nonce,
      publicInputsJson,
      yHex: params.sigma.y_hex,
      tHex: params.sigma.t_hex,
    });
    const cClaimed = BigInt(`0x${params.sigma.challenge_hex}`);
    if (cExpected !== cClaimed) return false;
    const left = modPow(G, s, P);
    const right = modMul(T, modPow(Y, cExpected, P), P);
    return left === right;
  } catch {
    return false;
  }
}

/** Deterministic JSON for challenge binding. */
export function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(x: unknown): unknown {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(sortKeys);
  const o = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) {
    out[k] = sortKeys(o[k]);
  }
  return out;
}
