/**
 * Gate: Pen promote/genesis must use durable ML-DSA from handoff — no ephemeral fallback.
 */

import { describe, it, expect } from 'vitest';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { resolveSigningKeys } from './services/penKeys';
import type { PenSession } from './services/penSession';

function baseSession(over: Partial<PenSession> = {}): PenSession {
  return {
    accessToken: 'tok',
    pnIdentifier: 'pn_test',
    ...over
  };
}

describe('penKeys gate', () => {
  it('throws without mlDsa keys', () => {
    expect(() => resolveSigningKeys(baseSession())).toThrow(/signing_keys_required/);
    expect(() =>
      resolveSigningKeys(baseSession({ mlDsaPublicKey: 'only-pk' }))
    ).toThrow(/signing_keys_required/);
  });

  it('succeeds with stable keys (same pubkey bytes)', () => {
    const kp = mlDsa65Keygen();
    const session = baseSession({
      mlDsaPublicKey: bytesToBase64(kp.publicKey),
      mlDsaSecretKey: bytesToBase64(kp.secretKey)
    });
    const a = resolveSigningKeys(session);
    const b = resolveSigningKeys(session);
    expect(a.ephemeral).toBe(false);
    expect(b.ephemeral).toBe(false);
    expect(Array.from(a.publicKey)).toEqual(Array.from(b.publicKey));
    expect(Array.from(a.publicKey)).toEqual(Array.from(kp.publicKey));
  });
});
