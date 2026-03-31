import { ZKPManager } from '../../src/IdentitySDK/modules/zkpManager';
import { ZKP_PROOF_TYPES } from '../../src/IdentitySDK/constants/sdkConstants';
import { verifyZkProofEnvelopeV1 } from '@par-noir/zk-protocol-v1';

describe('ZKPManager', () => {
  let zkpManager: ZKPManager;

  beforeEach(() => {
    zkpManager = new ZKPManager();
  });

  it('initializes', () => {
    expect(zkpManager).toBeInstanceOf(ZKPManager);
  });

  it('verifies long proof string via mocked zk-protocol-v1', async () => {
    const proof = 'a'.repeat(50);
    await expect(zkpManager.verifyProof(proof, ZKP_PROOF_TYPES.SCHNORR)).resolves.toBe(true);
  });

  it('returns false for short proof string', async () => {
    await expect(zkpManager.verifyProof('short', ZKP_PROOF_TYPES.SCHNORR)).resolves.toBe(false);
  });

  it('returns false when protocol verifier rejects (downgrade/tamper)', async () => {
    (verifyZkProofEnvelopeV1 as jest.Mock).mockReturnValueOnce({ ok: false, reason: 'tampered' });
    await expect(zkpManager.verifyProof('a'.repeat(80), ZKP_PROOF_TYPES.SCHNORR)).resolves.toBe(false);
  });

  it('returns false for legacy object-shaped proof', async () => {
    await expect(zkpManager.verifyProof({ type: 'age_verification' }, ZKP_PROOF_TYPES.SCHNORR)).resolves.toBe(
      false
    );
  });

  it('generateSchnorrProof throws', async () => {
    await expect(zkpManager.generateSchnorrProof({} as CryptoKey)).rejects.toThrow(/Legacy Schnorr/);
  });

  it('generatePedersenProof throws', async () => {
    await expect(zkpManager.generatePedersenProof('pn-test')).rejects.toThrow(/Legacy Pedersen/);
  });

  it('generateDataPointProof throws', async () => {
    await expect(zkpManager.generateDataPointProof('email', 'u1')).rejects.toThrow(/not supported/);
  });

  it('generateOwnershipProof throws', async () => {
    await expect(zkpManager.generateOwnershipProof({})).rejects.toThrow(/not implemented/);
  });
});
