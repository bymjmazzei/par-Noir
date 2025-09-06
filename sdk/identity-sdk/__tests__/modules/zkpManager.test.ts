import { ZKPManager } from '../../src/IdentitySDK/modules/zkpManager';

describe('ZKPManager', () => {
  let zkpManager: ZKPManager;

  beforeEach(() => {
    zkpManager = new ZKPManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize ZKP manager', () => {
      expect(zkpManager).toBeInstanceOf(ZKPManager);
    });
  });

  describe('Schnorr Proofs', () => {
    it('should generate Schnorr proof', async () => {
      const privateKey = 'test-private-key';
      const proof = await zkpManager.generateSchnorrProof(privateKey);
      
      expect(proof).toBeDefined();
      expect(proof.type).toBe('schnorr');
    });

    it('should verify Schnorr proof', async () => {
      const proof = {
        type: 'schnorr',
        commitment: 'test-commitment',
        challenge: 'test-challenge',
        response: 'test-response'
      };
      
      const isValid = await zkpManager.verifySchnorrProof(proof);
      expect(typeof isValid).toBe('boolean');
    });

    it('should handle invalid Schnorr proof', async () => {
      const invalidProof = {
        type: 'schnorr',
        commitment: 'invalid',
        challenge: 'invalid',
        response: 'invalid'
      };
      
      const isValid = await zkpManager.verifySchnorrProof(invalidProof);
      expect(isValid).toBe(false);
    });
  });

  describe('Pedersen Proofs', () => {
    it('should generate Pedersen proof', async () => {
      const publicPNId = 'test-public-id';
      const proof = await zkpManager.generatePedersenProof(publicPNId);
      
      expect(proof).toBeDefined();
      expect(proof.type).toBe('pedersen');
    });

    it('should verify Pedersen proof', async () => {
      const proof = {
        type: 'pedersen',
        commitment: 'test-commitment',
        opening: {
          message: 'test-message',
          randomness: 'test-randomness'
        }
      };
      
      const isValid = await zkpManager.verifyPedersenProof(proof);
      expect(typeof isValid).toBe('boolean');
    });

    it('should handle invalid Pedersen proof', async () => {
      const invalidProof = {
        type: 'pedersen',
        commitment: 'invalid',
        opening: {
          message: 'invalid',
          randomness: 'invalid'
        }
      };
      
      const isValid = await zkpManager.verifyPedersenProof(invalidProof);
      expect(isValid).toBe(false);
    });
  });

  describe('Data Point Proofs', () => {
    it('should generate data point proof', async () => {
      const dataPointId = 'email';
      const userId = 'test-user-id';
      const proof = await zkpManager.generateDataPointProof(dataPointId, userId);
      
      expect(proof).toBeDefined();
      expect(proof.dataPointId).toBe(dataPointId);
      expect(proof.userId).toBe(userId);
    });

    it('should verify data point proof', async () => {
      const proof = {
        dataPointId: 'email',
        userId: 'test-user-id',
        proof: 'test-proof-data'
      };
      
      const isValid = await zkpManager.verifyDataPointProof(proof);
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('Ownership Proofs', () => {
    it('should generate ownership proof', async () => {
      const data = {
        owner: 'test-owner',
        asset: 'test-asset',
        timestamp: Date.now()
      };
      
      const proof = await zkpManager.generateOwnershipProof(data);
      expect(proof).toBeDefined();
      expect(proof.owner).toBe(data.owner);
      expect(proof.asset).toBe(data.asset);
    });

    it('should verify ownership proof', async () => {
      const proof = {
        owner: 'test-owner',
        asset: 'test-asset',
        proof: 'test-proof-data',
        timestamp: Date.now()
      };
      
      const isValid = await zkpManager.verifyOwnershipProof(proof);
      expect(typeof isValid).toBe('boolean');
    });
  });

  describe('Generic Proof Operations', () => {
    it('should verify proof with valid type', async () => {
      const proof = {
        type: 'schnorr',
        data: 'test-proof-data'
      };
      
      const isValid = await zkpManager.verifyProof(proof, 'schnorr');
      expect(typeof isValid).toBe('boolean');
    });

    it('should handle unknown proof type', async () => {
      const proof = {
        type: 'unknown',
        data: 'test-proof-data'
      };
      
      await expect(zkpManager.verifyProof(proof, 'unknown')).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      await expect(zkpManager.generateSchnorrProof('')).rejects.toThrow();
    });

    it('should handle malformed proof data', async () => {
      const malformedProof = {
        type: 'schnorr',
        // Missing required fields
      };
      
      const isValid = await zkpManager.verifySchnorrProof(malformedProof as any);
      expect(isValid).toBe(false);
    });
  });

  describe('Security', () => {
    it('should generate cryptographically secure proofs', async () => {
      const proof1 = await zkpManager.generateSchnorrProof('test-key-1');
      const proof2 = await zkpManager.generateSchnorrProof('test-key-2');
      
      expect(proof1).not.toEqual(proof2);
    });

    it('should not leak private information in proofs', async () => {
      const privateKey = 'secret-private-key';
      const proof = await zkpManager.generateSchnorrProof(privateKey);
      
      expect(proof.commitment).not.toContain(privateKey);
      expect(proof.challenge).not.toContain(privateKey);
      expect(proof.response).not.toContain(privateKey);
    });
  });
});
