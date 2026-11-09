/**
 * Registry-signed handle receipts. Each claim, proof, rename, move and transfer yields one;
 * `prevReceiptHash` chains a handle's history so its priority date can be shown to travel.
 * Anyone holding the registry public key can check a receipt offline.
 */

import { sha3_384 } from '@noble/hashes/sha3.js';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Sign, mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';

export const HANDLE_RECEIPT_VERSION = 1 as const;
const RECEIPT_DOMAIN = 'PN-HANDLE-RECEIPT-V1';

export type HandleProofType = 'claim' | 'youtube' | 'dns';

export type HandleReceiptEvent =
  | 'claim'
  | 'prove'
  | 'rename'
  | 'move'
  | 'transfer'
  | 'supersede'
  | 'release'
  | 'expire';

const EVENTS: readonly HandleReceiptEvent[] = [
  'claim',
  'prove',
  'rename',
  'move',
  'transfer',
  'supersede',
  'release',
  'expire',
];

export interface HandleReceipt {
  v: typeof HANDLE_RECEIPT_VERSION;
  handle: string;
  ownerPn: string;
  proofType: HandleProofType;
  strength: number;
  priorityAt: string;
  event: HandleReceiptEvent;
  prevReceiptHash: string | null;
  issuedAt: string;
}

export interface SignedHandleReceipt {
  receipt: HandleReceipt;
  signature: string;
  hash: string;
}

/** Proof ladder: a first-come claim, a YouTube channel, a domain. */
export function proofStrength(proofType: HandleProofType): number {
  return proofType === 'dns' ? 3 : proofType === 'youtube' ? 2 : 1;
}

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return null;
  return new Date(v).toISOString();
}

export function parseHandleReceipt(raw: unknown): HandleReceipt | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== HANDLE_RECEIPT_VERSION) return null;
  if (typeof r.handle !== 'string' || !r.handle) return null;
  if (typeof r.ownerPn !== 'string' || !r.ownerPn) return null;
  if (r.proofType !== 'claim' && r.proofType !== 'youtube' && r.proofType !== 'dns') return null;
  if (typeof r.strength !== 'number' || !Number.isInteger(r.strength)) return null;
  if (!EVENTS.includes(r.event as HandleReceiptEvent)) return null;
  const priorityAt = iso(r.priorityAt);
  const issuedAt = iso(r.issuedAt);
  if (!priorityAt || !issuedAt) return null;
  const prev = r.prevReceiptHash;
  if (prev !== null && (typeof prev !== 'string' || !/^[0-9a-f]{96}$/.test(prev))) return null;
  return {
    v: HANDLE_RECEIPT_VERSION,
    handle: r.handle,
    ownerPn: r.ownerPn,
    proofType: r.proofType,
    strength: r.strength,
    priorityAt,
    event: r.event as HandleReceiptEvent,
    prevReceiptHash: prev as string | null,
    issuedAt,
  };
}

export function canonicalHandleReceiptBytes(r: HandleReceipt): Uint8Array {
  const ordered = {
    v: r.v,
    handle: r.handle,
    ownerPn: r.ownerPn,
    proofType: r.proofType,
    strength: r.strength,
    priorityAt: r.priorityAt,
    event: r.event,
    prevReceiptHash: r.prevReceiptHash,
    issuedAt: r.issuedAt,
  };
  return new TextEncoder().encode(`${RECEIPT_DOMAIN}\n${JSON.stringify(ordered)}`);
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** SHA3-384 of the canonical bytes; the next receipt's `prevReceiptHash`. */
export function handleReceiptHash(r: HandleReceipt): string {
  return toHex(sha3_384(canonicalHandleReceiptBytes(r)));
}

export function buildHandleReceipt(
  args: Omit<HandleReceipt, 'v' | 'issuedAt'> & { issuedAt?: string },
  registrySecretKey: Uint8Array
): SignedHandleReceipt {
  const receipt = parseHandleReceipt({
    v: HANDLE_RECEIPT_VERSION,
    ...args,
    issuedAt: args.issuedAt ?? new Date().toISOString(),
  });
  if (!receipt) throw new Error('Invalid handle receipt');
  const signature = bytesToBase64(mlDsa65Sign(canonicalHandleReceiptBytes(receipt), registrySecretKey));
  return { receipt, signature, hash: handleReceiptHash(receipt) };
}

export function verifyHandleReceipt(
  raw: unknown,
  signatureB64: string,
  registryPublicKeyB64: string
): boolean {
  const receipt = parseHandleReceipt(raw);
  if (!receipt || typeof signatureB64 !== 'string' || !signatureB64) return false;
  try {
    return mlDsa65Verify(
      base64ToBytes(signatureB64),
      canonicalHandleReceiptBytes(receipt),
      base64ToBytes(registryPublicKeyB64)
    );
  } catch {
    return false;
  }
}

/**
 * Oldest first. Every receipt verifies and points at the one before it. Within a chain the
 * priority date only changes on a rename (a new handle starts a new date).
 */
export function verifyHandleReceiptChain(
  entries: ReadonlyArray<{ receipt: unknown; signature: string }>,
  registryPublicKeyB64: string
): boolean {
  let prev: HandleReceipt | null = null;
  for (const entry of entries) {
    if (!verifyHandleReceipt(entry.receipt, entry.signature, registryPublicKeyB64)) return false;
    const receipt = parseHandleReceipt(entry.receipt)!;
    if (prev === null) {
      if (receipt.prevReceiptHash !== null) return false;
    } else {
      if (receipt.prevReceiptHash !== handleReceiptHash(prev)) return false;
      if (receipt.event !== 'rename' && receipt.priorityAt !== prev.priorityAt) return false;
    }
    prev = receipt;
  }
  return entries.length > 0;
}
