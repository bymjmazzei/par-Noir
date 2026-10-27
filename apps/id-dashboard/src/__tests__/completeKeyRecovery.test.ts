const decryptKeyRecoveryEnvelope = jest.fn();
jest.mock('@par-noir/recovery-crypto', () => ({
  decryptKeyRecoveryEnvelope: (...args: unknown[]) => decryptKeyRecoveryEnvelope(...args),
  combineShares: jest.fn(),
  decryptRecoveryEnvelope: jest.fn(),
  normalizeShare: jest.fn(),
  sealRecoveryShares: jest.fn(),
}));
const restoreIdentity = jest.fn();
jest.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: { restoreIdentity: (...args: unknown[]) => restoreIdentity(...args) },
}));

import { completeKeyRecovery } from '../services/recoveryService';

const keyEnvelope = { version: 1 as const, kind: 'recovery-key' as const, salt: 's', iv: 'i', ciphertext: 'c' };
const payload = {
  publicKey: 'pk',
  mlKemPublicKey: 'kem-pk',
  mlKemSecretKey: 'kem-sk',
  mlDsaSecretKey: 'dsa-sk',
  identityId: 'did:key:x',
  key1: '',
  recoveryConfig: { threshold: 2, totalShares: 5, version: 1 as const, createdAt: 'now' },
};
const NEW_KEY_1 = 'Brand-New-Key-One-2026!';
const NEW_KEY_2 = 'Brand-New-Key-Two-2026!';

describe('completeKeyRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    decryptKeyRecoveryEnvelope.mockResolvedValue(payload);
    restoreIdentity.mockResolvedValue({ identity: { publicKey: 'pk', encryptedData: 'new' } });
  });

  it('opens the key envelope with the recovery key and re-seals under the new keys', async () => {
    const result = await completeKeyRecovery({
      keyEnvelope,
      recoveryKey: 'recovery-abc',
      newKey1: ` ${NEW_KEY_1} `,
      newKey2: NEW_KEY_2,
      expectedPublicKey: 'pk',
    });
    expect(decryptKeyRecoveryEnvelope).toHaveBeenCalledWith('recovery-abc', keyEnvelope);
    expect(restoreIdentity).toHaveBeenCalledWith({ payload, key1: NEW_KEY_1, key2: NEW_KEY_2 });
    expect(result).toEqual({ identity: { publicKey: 'pk', encryptedData: 'new' }, key1: NEW_KEY_1 });
  });

  it('refuses recovery data for another pN', async () => {
    await expect(
      completeKeyRecovery({
        keyEnvelope,
        recoveryKey: 'recovery-abc',
        newKey1: NEW_KEY_1,
        newKey2: NEW_KEY_2,
        expectedPublicKey: 'other-pk',
      })
    ).rejects.toThrow('does not match');
    expect(restoreIdentity).not.toHaveBeenCalled();
  });

  it('requires both new keys before opening anything', async () => {
    await expect(
      completeKeyRecovery({
        keyEnvelope,
        recoveryKey: 'recovery-abc',
        newKey1: '  ',
        newKey2: NEW_KEY_2,
        expectedPublicKey: 'pk',
      })
    ).rejects.toThrow();
    expect(decryptKeyRecoveryEnvelope).not.toHaveBeenCalled();
  });
});
