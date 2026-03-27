import { describe, expect, it } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/post-quantum/utils.js';
import {
  createIdentityBlobV1,
  decodeIdentityBlobV1,
  mlDsa65Keygen,
  mlDsa65Sign,
  mlDsa65Verify,
  mlKem768Decapsulate,
  mlKem768Encapsulate,
  mlKem768Keygen,
  sha3_384_digest,
} from '../src/index';

describe('@par-noir/pqc-crypto', () => {
  it('ML-DSA-65 roundtrip matches @noble/post-quantum', () => {
    const seed = randomBytes(32);
    const nobleKeys = ml_dsa65.keygen(seed);
    const wrapped = mlDsa65Keygen(seed);
    expect(wrapped.publicKey).toEqual(nobleKeys.publicKey);
    expect(wrapped.secretKey).toEqual(nobleKeys.secretKey);
    const msg = new TextEncoder().encode('par-noir identity message');
    const sig = mlDsa65Sign(msg, wrapped.secretKey);
    expect(mlDsa65Verify(sig, msg, wrapped.publicKey)).toBe(true);
    expect(ml_dsa65.verify(sig, msg, wrapped.publicKey)).toBe(true);
  });

  it('ML-KEM-768 roundtrip matches @noble/post-quantum', () => {
    const seed = randomBytes(64);
    const nobleKeys = ml_kem768.keygen(seed);
    const wrapped = mlKem768Keygen(seed);
    expect(wrapped.publicKey).toEqual(nobleKeys.publicKey);
    expect(wrapped.secretKey).toEqual(nobleKeys.secretKey);
    // Encapsulate is probabilistic — compare only decaps(shared) vs encaps output.
    const { cipherText, sharedSecret: bob } = mlKem768Encapsulate(wrapped.publicKey);
    const alice = mlKem768Decapsulate(cipherText, wrapped.secretKey);
    expect(alice).toEqual(bob);
    const nobleEnc = ml_kem768.encapsulate(wrapped.publicKey);
    expect(ml_kem768.decapsulate(nobleEnc.cipherText, wrapped.secretKey)).toEqual(nobleEnc.sharedSecret);
  });

  it('SHA3-384 produces 48-byte digest', () => {
    const d = sha3_384_digest(new TextEncoder().encode('test'));
    expect(d.length).toBe(48);
  });

  it('identity blob v1 roundtrips CBOR', () => {
    const dsa = mlDsa65Keygen();
    const kem = mlKem768Keygen();
    const bytes = createIdentityBlobV1(dsa.publicKey, kem.publicKey, { pn: 'test' });
    const back = decodeIdentityBlobV1(bytes);
    expect(back.mlDsaPublicKey).toEqual(dsa.publicKey);
    expect(back.mlKemPublicKey).toEqual(kem.publicKey);
    expect(back.metadata?.pn).toBe('test');
  });
});
