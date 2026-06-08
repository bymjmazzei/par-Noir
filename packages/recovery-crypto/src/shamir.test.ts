import { describe, it, expect } from 'vitest';
import {
  splitSecret,
  combineShares,
  generateRecoveryMaster,
  encryptRecoveryEnvelope,
  decryptRecoveryEnvelope,
  buildRecoveryPayload
} from './index';

describe('shamir', () => {
  it('reconstructs secret from threshold shares', () => {
    const secret = generateRecoveryMaster(32);
    const shares = splitSecret(secret, 2, 5);
    const recovered = combineShares([shares[0], shares[2]]);
    expect(Array.from(recovered)).toEqual(Array.from(secret));
  });

  it('fails with duplicate indices', () => {
    const secret = generateRecoveryMaster(8);
    const shares = splitSecret(secret, 2, 3);
    expect(() => combineShares([shares[0], shares[0]])).toThrow(/duplicate/);
  });
});

describe('recovery envelope', () => {
  it('round-trips payload', async () => {
    const master = generateRecoveryMaster();
    const payload = buildRecoveryPayload({
      publicKey: 'pk',
      mlKemPublicKey: 'kem-pk',
      mlKemSecretKey: 'kem-sk',
      mlDsaSecretKey: 'dsa-sk',
      identityId: 'did:key:abc',
      pnName: 'user',
      recoveryConfig: { threshold: 2, totalShares: 5, version: 1, createdAt: new Date().toISOString() }
    });
    const envelope = await encryptRecoveryEnvelope(master, payload);
    const out = await decryptRecoveryEnvelope(master, envelope);
    expect(out.publicKey).toBe('pk');
    expect(out.pnName).toBe('user');
  });
});
