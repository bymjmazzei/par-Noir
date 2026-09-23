/**
 * @vitest-environment jsdom
 *
 * Gate: browse Pen authorship must use durable ML-DSA from handoff — no ephemeral fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mlKem768Keygen, mlDsa65Keygen, bytesToBase64 } from '@par-noir/pqc-crypto';
import { PN_MESSAGING_OAUTH_HANDOFF_STORAGE } from '@par-noir/oauth-ui';
import {
  applyDmSessionHandoff,
  clearDmIdentity,
  hasSigningKeys,
  isBrowseUnlockCryptoReady,
  isDmIdentityReady,
  resolveBrowseSigningKeys,
} from './dmIdentitySession';
import { applyMessagingOAuthHandoff } from './messagingOAuthHandoff';

function kemPair() {
  const kem = mlKem768Keygen();
  return {
    mlKemSecretKey: bytesToBase64(kem.secretKey),
    mlKemPublicKey: bytesToBase64(kem.publicKey),
  };
}

describe('browse signing keys gate', () => {
  beforeEach(() => {
    clearDmIdentity();
    localStorage.clear();
  });

  afterEach(() => {
    clearDmIdentity();
    localStorage.clear();
  });

  it('throws without mlDsa keys', () => {
    applyDmSessionHandoff(kemPair());
    expect(isDmIdentityReady()).toBe(true);
    expect(hasSigningKeys()).toBe(false);
    expect(isBrowseUnlockCryptoReady()).toBe(false);
    expect(() => resolveBrowseSigningKeys()).toThrow(/signing_keys_required/);
  });

  it('throws with only public key', () => {
    applyDmSessionHandoff({
      ...kemPair(),
      mlDsaPublicKey: 'only-pk',
    });
    expect(() => resolveBrowseSigningKeys()).toThrow(/signing_keys_required/);
  });

  it('retains DSA from handoff and resolves stable keys', () => {
    const kem = kemPair();
    const kp = mlDsa65Keygen();
    const pk = bytesToBase64(kp.publicKey);
    const sk = bytesToBase64(kp.secretKey);
    applyDmSessionHandoff({
      ...kem,
      mlDsaPublicKey: pk,
      mlDsaSecretKey: sk,
    });
    expect(hasSigningKeys()).toBe(true);
    expect(isBrowseUnlockCryptoReady()).toBe(true);
    const a = resolveBrowseSigningKeys();
    const b = resolveBrowseSigningKeys();
    expect(a.ephemeral).toBe(false);
    expect(b.ephemeral).toBe(false);
    expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey));
    expect(Array.from(a.publicKey)).toEqual(Array.from(kp.publicKey));
  });

  it('merges DSA from stash when session payload is KEM-only', () => {
    const kem = kemPair();
    const kp = mlDsa65Keygen();
    const pk = bytesToBase64(kp.publicKey);
    const sk = bytesToBase64(kp.secretKey);
    localStorage.setItem(
      PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
      JSON.stringify({
        v: 1,
        session: {
          mlKemSecretKey: kem.mlKemSecretKey,
          mlDsaPublicKey: pk,
          mlDsaSecretKey: sk,
        },
        timestamp: Date.now(),
      })
    );
    applyMessagingOAuthHandoff({
      v: 1,
      timestamp: Date.now(),
      session: kem,
    });
    expect(hasSigningKeys()).toBe(true);
    expect(isBrowseUnlockCryptoReady()).toBe(true);
    const resolved = resolveBrowseSigningKeys();
    expect(resolved.ephemeral).toBe(false);
    expect(Array.from(resolved.publicKey)).toEqual(Array.from(kp.publicKey));
  });

  it('merges DSA onto existing KEM-only memory when handoff repeats with DSA', () => {
    const kem = kemPair();
    const kp = mlDsa65Keygen();
    const pk = bytesToBase64(kp.publicKey);
    const sk = bytesToBase64(kp.secretKey);
    applyDmSessionHandoff(kem);
    expect(hasSigningKeys()).toBe(false);
    applyDmSessionHandoff({
      ...kem,
      mlDsaPublicKey: pk,
      mlDsaSecretKey: sk,
    });
    expect(hasSigningKeys()).toBe(true);
    expect(Array.from(resolveBrowseSigningKeys().publicKey)).toEqual(Array.from(kp.publicKey));
  });

  it('clears DSA on clearDmIdentity', () => {
    const kem = kemPair();
    const kp = mlDsa65Keygen();
    applyDmSessionHandoff({
      ...kem,
      mlDsaPublicKey: bytesToBase64(kp.publicKey),
      mlDsaSecretKey: bytesToBase64(kp.secretKey),
    });
    clearDmIdentity();
    expect(isDmIdentityReady()).toBe(false);
    expect(hasSigningKeys()).toBe(false);
    expect(() => resolveBrowseSigningKeys()).toThrow(/signing_keys_required/);
  });
});
