import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  buildHandleReceipt,
  handleBoundToKey,
  handleReceiptHash,
  proofStrength,
  verifyHandleReceipt,
  verifyHandleReceiptChain,
} from './receipts';

const registry = mlDsa65Keygen(new Uint8Array(32).fill(11));
const REGISTRY_PK = bytesToBase64(registry.publicKey);
const other = mlDsa65Keygen(new Uint8Array(32).fill(12));
const ALICE_KEY = bytesToBase64(mlDsa65Keygen(new Uint8Array(32).fill(13)).publicKey);
const BOB_KEY = bytesToBase64(mlDsa65Keygen(new Uint8Array(32).fill(14)).publicKey);

const PRIORITY = '2026-01-02T03:04:05.000Z';

function claim() {
  return buildHandleReceipt(
    {
      handle: 'bymjmazzei',
      signingKey: ALICE_KEY,
      proofType: 'claim',
      strength: proofStrength('claim'),
      priorityAt: PRIORITY,
      event: 'claim',
      prevReceiptHash: null,
      issuedAt: PRIORITY,
    },
    registry.secretKey
  );
}

function next(prev: string | null, over: Record<string, unknown> = {}) {
  return buildHandleReceipt(
    {
      handle: 'bymjmazzei',
      signingKey: BOB_KEY,
      proofType: 'claim',
      strength: 1,
      priorityAt: PRIORITY,
      event: 'transfer',
      prevReceiptHash: prev,
      ...over,
    },
    registry.secretKey
  );
}

describe('handle receipts', () => {
  it('verifies against the registry key', () => {
    const { receipt, signature, hash } = claim();
    expect(verifyHandleReceipt(receipt, signature, REGISTRY_PK)).toBe(true);
    expect(hash).toBe(handleReceiptHash(receipt));
  });

  it('fails when tampered with or signed by another key', () => {
    const { receipt, signature } = claim();
    expect(verifyHandleReceipt({ ...receipt, priorityAt: '2027-01-01T00:00:00.000Z' }, signature, REGISTRY_PK)).toBe(
      false
    );
    expect(verifyHandleReceipt({ ...receipt, signingKey: BOB_KEY }, signature, REGISTRY_PK)).toBe(false);
    expect(verifyHandleReceipt(receipt, signature, bytesToBase64(other.publicKey))).toBe(false);
  });

  it('refuses a receipt without a real signing key', () => {
    expect(() => next(null, { signingKey: 'pn-alice' })).toThrow('Invalid handle receipt');
  });

  it('chains from claim to transfer to rekey with the priority date travelling', () => {
    const first = claim();
    const transfer = next(first.hash);
    const rekey = next(transfer.hash, { event: 'rekey', signingKey: ALICE_KEY });
    expect(verifyHandleReceiptChain([first, transfer, rekey], REGISTRY_PK)).toBe(true);
  });

  it('rejects a broken link or a transfer that changes the priority date', () => {
    const first = claim();
    expect(verifyHandleReceiptChain([first, next(null)], REGISTRY_PK)).toBe(false);
    const redated = next(first.hash, { priorityAt: '2020-01-01T00:00:00.000Z' });
    expect(verifyHandleReceiptChain([first, redated], REGISTRY_PK)).toBe(false);
  });
});

describe('key binding', () => {
  it('binds the handle to the key the receipt names, from its issue time', () => {
    const first = claim();
    expect(handleBoundToKey(first, REGISTRY_PK, ALICE_KEY)).toBe('bymjmazzei');
    expect(handleBoundToKey(first, REGISTRY_PK, ALICE_KEY, '2026-02-01T00:00:00.000Z')).toBe('bymjmazzei');
    expect(handleBoundToKey(first, REGISTRY_PK, ALICE_KEY, '2025-12-31T00:00:00.000Z')).toBeNull();
    expect(handleBoundToKey(first, REGISTRY_PK, BOB_KEY)).toBeNull();
    expect(handleBoundToKey(first, bytesToBase64(other.publicKey), ALICE_KEY)).toBeNull();
  });

  it('does not bind after the handle was released', () => {
    const released = next(claim().hash, { event: 'release', signingKey: ALICE_KEY });
    expect(handleBoundToKey(released, REGISTRY_PK, ALICE_KEY)).toBeNull();
  });
});