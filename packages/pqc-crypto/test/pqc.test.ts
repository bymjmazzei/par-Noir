import { describe, expect, it } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/post-quantum/utils.js';
import {
  createIdentityBlobV1,
  decodeIdentityBlobV1,
  deriveCanonicalPnIdentifier,
  deriveDidFromPublicKey,
  mlDsa65Keygen,
  mlDsa65Sign,
  mlDsa65Verify,
  mlKem768Decapsulate,
  mlKem768Encapsulate,
  mlKem768Keygen,
  sha3_384_digest,
  signOauthUnlockProof,
  signRecoverySetupProof,
  verifyOauthUnlockProof,
  verifyRecoverySetupProof,
  bytesToBase64,
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

  it('OAuth unlock proof roundtrips and rejects tampering', () => {
    const dsa = mlDsa65Keygen();
    const publicKey = bytesToBase64(dsa.publicKey);
    const params = {
      challenge: 'abc123challenge',
      clientId: 'browser-app',
      redirectUri: 'https://browse.parnoir.com/oauth-callback.html',
      scope: 'openid profile',
      state: 'st',
      nonce: 'nn',
      publicKey,
    };
    const signature = signOauthUnlockProof(params, dsa.secretKey);
    expect(verifyOauthUnlockProof(signature, params, publicKey)).toBe(true);
    expect(
      verifyOauthUnlockProof(signature, { ...params, challenge: 'tampered' }, publicKey)
    ).toBe(false);
    const other = mlDsa65Keygen();
    expect(
      verifyOauthUnlockProof(signature, params, bytesToBase64(other.publicKey))
    ).toBe(false);
    expect(deriveCanonicalPnIdentifier(publicKey)).toMatch(/^pn-[0-9a-f]{12}$/);
    expect(deriveDidFromPublicKey(publicKey)).toMatch(/^did:key:[0-9a-f]{16}$/);
  });

  it('recovery setup proof binds the challenge, pN and key, and is not an unlock proof', () => {
    const dsa = mlDsa65Keygen();
    const publicKey = bytesToBase64(dsa.publicKey);
    const params = { challenge: 'setup-challenge', pnIdentifier: deriveCanonicalPnIdentifier(publicKey), publicKey };
    const signature = signRecoverySetupProof(params, dsa.secretKey);
    expect(verifyRecoverySetupProof(signature, params)).toBe(true);
    expect(verifyRecoverySetupProof(signature, { ...params, challenge: 'other' })).toBe(false);
    expect(verifyRecoverySetupProof(signature, { ...params, pnIdentifier: 'pn-000000000000' })).toBe(false);
    expect(verifyRecoverySetupProof(signature, { ...params, publicKey: bytesToBase64(mlDsa65Keygen().publicKey) })).toBe(false);
    expect(verifyRecoverySetupProof('not base64 !!', params)).toBe(false);
    const unlockSig = signOauthUnlockProof(
      { challenge: params.challenge, clientId: 'c', redirectUri: 'r', scope: 's', state: '', nonce: '', publicKey },
      dsa.secretKey
    );
    expect(verifyRecoverySetupProof(unlockSig, params)).toBe(false);
  });
});
