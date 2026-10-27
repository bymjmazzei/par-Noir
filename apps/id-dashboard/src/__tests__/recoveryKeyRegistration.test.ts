const registerRecoveryFailsafe = jest.fn(async () => undefined);
jest.mock('../services/recoveryApiService', () => ({
  hashRecoveryKey: jest.fn(async (k: string) => `hash(${k})`),
  registerRecoveryFailsafe: (...args: unknown[]) => registerRecoveryFailsafe(...(args as [])),
}));
jest.mock('../services/recoveryRelayFlows', () => ({
  ensureRecoveryDriveProof: jest.fn(async () => 'drive-proof-hash'),
}));
const decryptRecoverySessionIdentity = jest.fn();
const signRecoverySetupChallenge = jest.fn();
jest.mock('../services/recoverySetupProof', () => ({
  decryptRecoverySessionIdentity: (...args: unknown[]) => decryptRecoverySessionIdentity(...args),
  signRecoverySetupChallenge: (...args: unknown[]) => signRecoverySetupChallenge(...args),
}));
const encryptKeyRecoveryEnvelope = jest.fn();
jest.mock('@par-noir/recovery-crypto', () => ({
  buildRecoveryPayload: (input: unknown) => input,
  encryptKeyRecoveryEnvelope: (...args: unknown[]) => encryptKeyRecoveryEnvelope(...args),
}));

import { registerRecoveryKey } from '../services/recoveryKeyRegistration';

const auth = {
  encryptedIdentity: {
    publicKey: 'pk',
    mlKemPublicKey: 'kem-pk',
    encryptedData: 'e',
    iv: 'i',
    salt: 's',
    recoveryEnvelope: { version: 1 as const, iv: 'mi', ciphertext: 'mc' },
  },
  key1: 'old-key-one',
  key2: 'old-key-two',
  expiresAt: Date.now() + 60_000,
};

describe('registerRecoveryKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    decryptRecoverySessionIdentity.mockResolvedValue({
      id: 'did:key:x',
      pqcSecrets: { mlDsaSecretKey: 'dsa-sk', mlKemSecretKey: 'kem-sk' },
      recoveryConfig: { threshold: 2, totalShares: 5 },
    });
    signRecoverySetupChallenge.mockResolvedValue({ challengeId: 'c', publicKey: 'pk', signature: 'sig' });
    encryptKeyRecoveryEnvelope.mockResolvedValue({ kind: 'recovery-key', marker: true });
  });

  it('without custodians on an unkeyed device, sends a key envelope and the owner proof', async () => {
    const result = await registerRecoveryKey({
      apiToken: 'tok',
      pnIdentifier: 'pn-x',
      auth,
      recoveryKey: 'recovery-abc',
      custodiansConfigured: false,
      isKeyedSession: false,
    });

    expect(result.mode).toBe('key_only');
    const [key, payload] = encryptKeyRecoveryEnvelope.mock.calls[0];
    expect(key).toBe('recovery-abc');
    expect(payload).toEqual(
      expect.objectContaining({
        publicKey: 'pk',
        mlKemPublicKey: 'kem-pk',
        mlKemSecretKey: 'kem-sk',
        mlDsaSecretKey: 'dsa-sk',
        identityId: 'did:key:x',
      })
    );
    expect(payload).not.toHaveProperty('key1');
    expect(JSON.stringify(payload)).not.toContain('old-key-one');
    expect(signRecoverySetupChallenge).toHaveBeenCalledWith('tok', auth, expect.objectContaining({ id: 'did:key:x' }));
    expect(decryptRecoverySessionIdentity).toHaveBeenCalledTimes(1);
    expect(registerRecoveryFailsafe).toHaveBeenCalledWith('tok', {
      userPnIdentifier: 'pn-x',
      publicKey: 'pk',
      envelope: auth.encryptedIdentity.recoveryEnvelope,
      keyEnvelope: { kind: 'recovery-key', marker: true },
      keyHash: 'hash(recovery-abc)',
      driveProofHash: 'drive-proof-hash',
      ownerProof: { challengeId: 'c', publicKey: 'pk', signature: 'sig' },
    });
  });

  it('with custodians on a keyed device, sends neither a key envelope nor a proof', async () => {
    const result = await registerRecoveryKey({
      apiToken: 'tok',
      pnIdentifier: 'pn-x',
      auth,
      recoveryKey: 'recovery-abc',
      custodiansConfigured: true,
      isKeyedSession: true,
    });
    expect(result.mode).toBe('custodians');
    expect(encryptKeyRecoveryEnvelope).not.toHaveBeenCalled();
    expect(decryptRecoverySessionIdentity).not.toHaveBeenCalled();
    expect(registerRecoveryFailsafe).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ keyEnvelope: undefined, ownerProof: undefined })
    );
  });

  it('explains when custodians appeared since the tab loaded', async () => {
    registerRecoveryFailsafe.mockRejectedValueOnce(new Error('custodians_configured'));
    await expect(
      registerRecoveryKey({
        apiToken: 'tok',
        pnIdentifier: 'pn-x',
        auth,
        recoveryKey: 'recovery-abc',
        custodiansConfigured: false,
        isKeyedSession: true,
      })
    ).rejects.toThrow('Custodians are set up');
  });
});
