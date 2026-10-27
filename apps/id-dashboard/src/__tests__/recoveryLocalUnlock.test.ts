const authenticateIdentity = jest.fn();

jest.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: {
    authenticateIdentity: (...args: unknown[]) => authenticateIdentity(...args),
  },
}));

import { unlockRecoveryLocally } from '../services/recoveryLocalUnlock';

const OWNER_PK = 'owner-public-key';
const ENVELOPE = { version: 1, iv: 'env-iv', ciphertext: 'env-ct' };
const SEALED = { version: 1, iv: 'seal-iv', ciphertext: 'seal-ct' };

function pnFile(row: Record<string, unknown>): File {
  return { text: async () => JSON.stringify(row) } as unknown as File;
}

const ownerRow = {
  publicKey: OWNER_PK,
  encryptedData: 'enc',
  iv: 'iv',
  salt: 'salt',
  recoveryEnvelope: ENVELOPE,
  recoverySharesSealed: SEALED,
};

beforeEach(() => {
  authenticateIdentity.mockReset();
});

describe('Recovery tab local unlock', () => {
  it('returns a recovery session with the envelope, sealed shares, Key 1 and Key 2', async () => {
    authenticateIdentity.mockResolvedValue({ id: 'did:pn:owner' });

    const session = await unlockRecoveryLocally({
      file: pnFile(ownerRow),
      key1: 'Key1-Value!',
      key2: 'Key2-Value!',
      expectedPublicKey: OWNER_PK,
    });

    expect(authenticateIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ publicKey: OWNER_PK }),
      'Key2-Value!',
      'Key1-Value!'
    );
    expect(session.encryptedIdentity.recoveryEnvelope).toEqual(ENVELOPE);
    expect(session.encryptedIdentity.recoverySharesSealed).toEqual(SEALED);
    expect(session.key1).toBe('Key1-Value!');
    expect(session.key2).toBe('Key2-Value!');
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects wrong keys', async () => {
    authenticateIdentity.mockRejectedValue(new Error('decrypt failed'));

    await expect(
      unlockRecoveryLocally({
        file: pnFile(ownerRow),
        key1: 'wrong',
        key2: 'wrong',
        expectedPublicKey: OWNER_PK,
      })
    ).rejects.toThrow('Incorrect Key 1 or Key 2');
  });

  it("rejects another pN's file before checking keys", async () => {
    await expect(
      unlockRecoveryLocally({
        file: pnFile({ ...ownerRow, publicKey: 'someone-else' }),
        key1: 'Key1-Value!',
        key2: 'Key2-Value!',
        expectedPublicKey: OWNER_PK,
      })
    ).rejects.toThrow('different pN than the one signed in');
    expect(authenticateIdentity).not.toHaveBeenCalled();
  });
});
