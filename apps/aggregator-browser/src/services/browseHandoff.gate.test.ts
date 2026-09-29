/**
 * @vitest-environment jsdom
 *
 * A popup result that already has messaging and signing keys is ready.
 * The unlock path must not clear the session in that case.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mlKem768Keygen, mlDsa65Keygen, bytesToBase64 } from '@par-noir/pqc-crypto';
import { clearDmIdentity, isBrowseUnlockCryptoReady } from './dmIdentitySession';
import { browseHandoffReady } from './messagingOAuthHandoff';

describe('browse unlock handoff', () => {
  beforeEach(() => {
    clearDmIdentity();
    localStorage.clear();
  });

  afterEach(() => {
    clearDmIdentity();
    localStorage.clear();
  });

  it('sets the session from the popup payload and does not require a lock', () => {
    const kem = mlKem768Keygen();
    const dsa = mlDsa65Keygen();
    const pending = {
      messagingHandoff: {
        v: 1,
        timestamp: Date.now(),
        session: {
          mlKemSecretKey: bytesToBase64(kem.secretKey),
          mlKemPublicKey: bytesToBase64(kem.publicKey),
          mlDsaPublicKey: bytesToBase64(dsa.publicKey),
          mlDsaSecretKey: bytesToBase64(dsa.secretKey),
        },
      },
    };

    const ready = browseHandoffReady(pending);
    expect(ready).toBe(true);
    expect(isBrowseUnlockCryptoReady()).toBe(true);
  });
});
