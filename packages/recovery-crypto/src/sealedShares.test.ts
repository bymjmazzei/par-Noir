import { describe, it, expect } from 'vitest';
import { splitSecret, generateRecoveryMaster } from './shamir';
import { sealRecoveryShares, unsealRecoveryShares } from './sealedShares';

describe('sealedRecoveryShares', () => {
  it('round-trips shares with correct credentials', async () => {
    const master = generateRecoveryMaster(32);
    const shares = splitSecret(master, 2, 5);
    const sealed = await sealRecoveryShares(shares, 'alice', 'SecretPass1!');
    const out = await unsealRecoveryShares(sealed, 'alice', 'SecretPass1!');
    expect(out).toHaveLength(5);
    expect(out.map((s) => s.index).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(out[0].share).toBe(shares[0].share);
  });

  it('fails with wrong passcode', async () => {
    const master = generateRecoveryMaster(16);
    const shares = splitSecret(master, 2, 5);
    const sealed = await sealRecoveryShares(shares, 'alice', 'SecretPass1!');
    await expect(unsealRecoveryShares(sealed, 'alice', 'wrong')).rejects.toThrow(/unseal recovery shares/);
  });
});
