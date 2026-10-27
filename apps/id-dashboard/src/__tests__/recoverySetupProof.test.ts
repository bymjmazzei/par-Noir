import { TextDecoder, TextEncoder } from 'util';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  deriveCanonicalPnIdentifier,
  verifyRecoverySetupProof,
} from '@par-noir/pqc-crypto/oauth-unlock-proof';

const decryptData = jest.fn();
jest.mock('@par-noir/identity-crypto', () => ({
  IdentityCrypto: { decryptData: (...args: unknown[]) => decryptData(...args) },
}));

const fetchRecoverySetupChallenge = jest.fn();
jest.mock('../services/recoveryApiService', () => ({
  fetchRecoverySetupChallenge: (...args: unknown[]) => fetchRecoverySetupChallenge(...args),
}));

import { signRecoverySetupChallenge } from '../services/recoverySetupProof';

Object.assign(globalThis, { TextEncoder, TextDecoder });

describe('signRecoverySetupChallenge', () => {
  it('signs the server challenge with the .pn signing key, using the keys from the Recovery unlock', async () => {
    const dsa = mlDsa65Keygen();
    const publicKey = bytesToBase64(dsa.publicKey);
    decryptData.mockResolvedValue(
      JSON.stringify({ id: 'did:key:x', pqcSecrets: { mlDsaSecretKey: bytesToBase64(dsa.secretKey) } })
    );
    fetchRecoverySetupChallenge.mockResolvedValue({ challengeId: 'cid', challenge: 'chal', expiresAt: 0 });
    const auth = {
      encryptedIdentity: { publicKey, encryptedData: 'e', iv: 'i', salt: 's' },
      pnName: 'key-one',
      passcode: 'key-two',
      expiresAt: Date.now() + 60_000,
    };

    const proof = await signRecoverySetupChallenge('api-token', auth);

    expect(fetchRecoverySetupChallenge).toHaveBeenCalledWith('api-token');
    expect(decryptData).toHaveBeenCalledWith({ encrypted: 'e', iv: 'i', salt: 's' }, 'key-one', 'key-two');
    expect(proof).toEqual(expect.objectContaining({ challengeId: 'cid', publicKey }));
    expect(
      verifyRecoverySetupProof(proof.signature, {
        challenge: 'chal',
        pnIdentifier: deriveCanonicalPnIdentifier(publicKey),
        publicKey,
      })
    ).toBe(true);
  });

  it('explains when the .pn has no signing key', async () => {
    decryptData.mockResolvedValue(JSON.stringify({ id: 'did:key:x' }));
    await expect(
      signRecoverySetupChallenge('t', {
        encryptedIdentity: { publicKey: 'pk', encryptedData: 'e', iv: 'i', salt: 's' },
        pnName: 'a',
        passcode: 'b',
        expiresAt: Date.now() + 1000,
      })
    ).rejects.toThrow('no signing key');
  });
});
