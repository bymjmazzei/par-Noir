import { describe, expect, it } from 'vitest';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  buildHandleReceipt,
  handleReceiptHash,
  proofStrength,
  verifyHandleReceipt,
  verifyHandleReceiptChain,
} from './receipts';

const registry = mlDsa65Keygen(new Uint8Array(32).fill(11));
const REGISTRY_PK = bytesToBase64(registry.publicKey);
const other = mlDsa65Keygen(new Uint8Array(32).fill(12));

const PRIORITY = '2026-01-02T03:04:05.000Z';

function claim() {
  return buildHandleReceipt(
    {
      handle: 'bymjmazzei',
      ownerPn: 'pn-alice',
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
    expect(verifyHandleReceipt(receipt, signature, bytesToBase64(other.publicKey))).toBe(false);
  });

  it('chains from claim to transfer with the priority date travelling', () => {
    const first = claim();
    const transfer = buildHandleReceipt(
      {
        handle: 'bymjmazzei',
        ownerPn: 'pn-bob',
        proofType: 'claim',
        strength: 1,
        priorityAt: PRIORITY,
        event: 'transfer',
        prevReceiptHash: first.hash,
      },
      registry.secretKey
    );
    expect(verifyHandleReceiptChain([first, transfer], REGISTRY_PK)).toBe(true);
  });

  it('rejects a broken link or a transfer that changes the priority date', () => {
    const first = claim();
    const unlinked = buildHandleReceipt(
      {
        handle: 'bymjmazzei',
        ownerPn: 'pn-bob',
        proofType: 'claim',
        strength: 1,
        priorityAt: PRIORITY,
        event: 'transfer',
        prevReceiptHash: null,
      },
      registry.secretKey
    );
    expect(verifyHandleReceiptChain([first, unlinked], REGISTRY_PK)).toBe(false);

    const redated = buildHandleReceipt(
      {
        handle: 'bymjmazzei',
        ownerPn: 'pn-bob',
        proofType: 'claim',
        strength: 1,
        priorityAt: '2020-01-01T00:00:00.000Z',
        event: 'transfer',
        prevReceiptHash: first.hash,
      },
      registry.secretKey
    );
    expect(verifyHandleReceiptChain([first, redated], REGISTRY_PK)).toBe(false);
  });
});
