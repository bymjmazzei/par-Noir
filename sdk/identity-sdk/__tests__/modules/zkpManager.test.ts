import { ZKPManager } from '../../src/IdentitySDK/modules/zkpManager';
import { ZKP_PROOF_TYPES } from '../../src/IdentitySDK/constants/sdkConstants';

describe('ZKPManager', () => {
  let zkpManager: ZKPManager;

  const mockPrivateKey = {} as CryptoKey;

  beforeEach(() => {
    zkpManager = new ZKPManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes', () => {
    expect(zkpManager).toBeInstanceOf(ZKPManager);
  });

  describe('Schnorr', () => {
    it('generates Schnorr-shaped proof (R, c, s)', async () => {
      const proof = await zkpManager.generateSchnorrProof(mockPrivateKey);
      expect(proof.R).toMatch(/^[0-9a-f]+$/);
      expect(proof.c).toMatch(/^[0-9a-f]+$/);
      expect(proof.s).toMatch(/^[0-9a-f]+$/);
    });

    it('verifies Schnorr proof via verifyProof', async () => {
      const proof = await zkpManager.generateSchnorrProof(mockPrivateKey);
      await expect(zkpManager.verifyProof(proof, ZKP_PROOF_TYPES.SCHNORR)).resolves.toBe(true);
    });
  });

  describe('Pedersen', () => {
    it('generates Pedersen-shaped proof', async () => {
      const proof = await zkpManager.generatePedersenProof('pn-test');
      expect(proof.commitment).toMatch(/^[0-9a-f]+$/);
      expect(proof.proof).toMatch(/^[0-9a-f]+$/);
    });

    it('verifies Pedersen proof via verifyProof', async () => {
      const proof = await zkpManager.generatePedersenProof('pn-test');
      await expect(zkpManager.verifyProof(proof, ZKP_PROOF_TYPES.PEDERSEN)).resolves.toBe(true);
    });
  });

  describe('Data point & ownership', () => {
    it('generates data point proof payload', async () => {
      const proof = await zkpManager.generateDataPointProof('email', 'user-1');
      expect(proof.dataPointId).toBe('email');
      expect(proof.userId).toBe('user-1');
      expect(proof.type).toBe('data_point_access');
    });

    it('generates ownership proof payload', async () => {
      const proof = await zkpManager.generateOwnershipProof({ owner: 'a', asset: 'b' });
      expect(proof.proof).toBeDefined();
      expect(proof.metadata?.algorithm).toBe('schnorr');
    });
  });

  describe('verifyProof', () => {
    it('returns false for unknown proof type (no throw)', async () => {
      await expect(zkpManager.verifyProof({ x: 1 }, 'unknown-type')).resolves.toBe(false);
    });

    it('returns false for malformed Schnorr proof', async () => {
      await expect(zkpManager.verifyProof({ R: '' }, ZKP_PROOF_TYPES.SCHNORR)).resolves.toBe(false);
    });
  });

  describe('Security', () => {
    it('generates distinct Schnorr proofs across calls', async () => {
      const a = await zkpManager.generateSchnorrProof(mockPrivateKey);
      const b = await zkpManager.generateSchnorrProof(mockPrivateKey);
      expect(a).not.toEqual(b);
    });
  });
});
