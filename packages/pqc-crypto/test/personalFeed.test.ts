import { describe, expect, it } from 'vitest';
import {
  bytesToBase64,
  deriveCanonicalPnIdentifier,
  derivePersonalFeedKeyPair,
  mlDsa65Keygen,
  mlDsa65Sign,
  mlDsa65Verify,
} from '../src/index';

function root(seedByte: number) {
  const keys = mlDsa65Keygen(new Uint8Array(32).fill(seedByte));
  return { ...keys, pn: deriveCanonicalPnIdentifier(bytesToBase64(keys.publicKey)) };
}

describe('derivePersonalFeedKeyPair', () => {
  it('is deterministic for the same root', () => {
    const r = root(1);
    const a = derivePersonalFeedKeyPair(r.secretKey, r.pn);
    const b = derivePersonalFeedKeyPair(r.secretKey, r.pn);
    expect(a.publicKeyB64).toBe(b.publicKeyB64);
    expect(a.subjectPnIdentifier).toBe(b.subjectPnIdentifier);
  });

  it('differs across roots and never equals the root key', () => {
    const r1 = root(1);
    const r2 = root(2);
    const f1 = derivePersonalFeedKeyPair(r1.secretKey, r1.pn);
    const f2 = derivePersonalFeedKeyPair(r2.secretKey, r2.pn);
    expect(f1.subjectPnIdentifier).not.toBe(f2.subjectPnIdentifier);
    expect(f1.subjectPnIdentifier).not.toBe(r1.pn);
    expect(f1.publicKeyB64).not.toBe(bytesToBase64(r1.publicKey));
  });

  it('subject is the canonical pN id of the feed key and the key signs', () => {
    const r = root(3);
    const f = derivePersonalFeedKeyPair(r.secretKey, r.pn);
    expect(f.subjectPnIdentifier).toBe(deriveCanonicalPnIdentifier(f.publicKeyB64));
    const msg = new TextEncoder().encode('post');
    expect(mlDsa65Verify(mlDsa65Sign(msg, f.secretKey), msg, f.publicKey)).toBe(true);
  });

  it('rejects missing inputs', () => {
    const r = root(4);
    expect(() => derivePersonalFeedKeyPair(new Uint8Array(0), r.pn)).toThrow();
    expect(() => derivePersonalFeedKeyPair(r.secretKey, '')).toThrow();
  });
});
