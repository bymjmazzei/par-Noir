import { SchnorrProofGenerator } from '../../src/encryption/zk-proofs/modules/schnorrProofGenerator';
import { PedersenProofGenerator } from '../../src/encryption/zk-proofs/modules/pedersenProofGenerator';
import { QuantumKeyGenerator } from '../../src/encryption/quantum/modules/keyGenerator';
import { QuantumSignatureManager } from '../../src/encryption/quantum/modules/signatureManager';
import { ZKStatement } from '../../src/encryption/zk-proofs/types/zkProofs';

describe('Cryptographic Security Tests', () => {
  describe('Schnorr Zero-Knowledge Proofs', () => {
    let schnorrGenerator: SchnorrProofGenerator;

    beforeEach(() => {
      schnorrGenerator = new SchnorrProofGenerator('secp256k1');
    });

    test('should generate valid Schnorr proof', async () => {
      const statement: ZKStatement = {
        type: 'discrete_log',
        description: 'Prove knowledge of discrete logarithm',
        publicInputs: {
          g: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798:483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
          y: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798:483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'
        },
        privateInputs: {
          x: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
        },
        relation: 'y = g^x'
      };

      const proof = await schnorrGenerator.generateDiscreteLogProof(statement);
      
      expect(proof).toBeDefined();
      expect(proof.commitment).toBeDefined();
      expect(proof.challenge).toBeDefined();
      expect(proof.response).toBeDefined();
      expect(proof.publicKey).toBeDefined();
      expect(proof.message).toBe('discrete_log');
      expect(proof.curve).toBe('secp256k1');
    });

    test('should verify valid Schnorr proof', async () => {
      const statement: ZKStatement = {
        type: 'discrete_log',
        description: 'Prove knowledge of discrete logarithm',
        publicInputs: {
          g: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798:483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
          y: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798:483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8'
        },
        privateInputs: {
          x: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
        },
        relation: 'y = g^x'
      };

      const proof = await schnorrGenerator.generateDiscreteLogProof(statement);
      const isValid = await schnorrGenerator.verifySchnorrProof(proof);
      
      expect(isValid).toBe(true);
    });

    test('should reject invalid Schnorr proof', async () => {
      const invalidProof = {
        commitment: 'invalid:commitment',
        challenge: 'invalid',
        response: 'invalid',
        publicKey: 'invalid:publickey',
        message: 'test',
        curve: 'secp256k1' as const,
        generator: 'invalid:generator',
        order: 'invalid'
      };

      const isValid = await schnorrGenerator.verifySchnorrProof(invalidProof);
      expect(isValid).toBe(false);
    });
  });

  describe('Pedersen Zero-Knowledge Proofs', () => {
    let pedersenGenerator: PedersenProofGenerator;

    beforeEach(() => {
      pedersenGenerator = new PedersenProofGenerator('secp256k1');
    });

    test('should generate valid Pedersen commitment proof', async () => {
      const statement: ZKStatement = {
        type: 'pedersen_commitment',
        description: 'Prove knowledge of Pedersen commitment opening',
        publicInputs: {},
        privateInputs: {
          message: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
        },
        relation: 'C = g^m * h^r'
      };

      const proof = await pedersenGenerator.generatePedersenCommitmentProof(statement);
      
      expect(proof).toBeDefined();
      expect(proof.commitment).toBeDefined();
      expect(proof.opening).toBeDefined();
      expect(proof.opening.message).toBeDefined();
      expect(proof.opening.randomness).toBeDefined();
      expect(proof.generators).toBeDefined();
      expect(proof.generators.g).toBeDefined();
      expect(proof.generators.h).toBeDefined();
      expect(proof.proofOfKnowledge).toBeDefined();
    });

    test('should verify valid Pedersen proof', async () => {
      const statement: ZKStatement = {
        type: 'pedersen_commitment',
        description: 'Prove knowledge of Pedersen commitment opening',
        publicInputs: {},
        privateInputs: {
          message: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcde'
        },
        relation: 'C = g^m * h^r'
      };

      const proof = await pedersenGenerator.generatePedersenCommitmentProof(statement);
      const isValid = await pedersenGenerator.verifyPedersenProof(proof);
      
      expect(isValid).toBe(true);
    });

    test('should generate valid range proof', async () => {
      const statement: ZKStatement = {
        type: 'range_proof',
        description: 'Prove value is within specified range',
        publicInputs: {
          range: '1000000000000000000000000000000000000000000000000000000000000000'
        },
        privateInputs: {
          value: '500000000000000000000000000000000000000000000000000000000000000'
        },
        relation: '0 <= value <= range'
      };

      const proof = await pedersenGenerator.generateRangeProof(statement);
      
      expect(proof).toBeDefined();
      expect(proof.commitment).toBeDefined();
      expect(proof.opening).toBeDefined();
      expect(proof.proofOfKnowledge).toBeDefined();
    });

    test('should reject value outside range', async () => {
      const statement: ZKStatement = {
        type: 'range_proof',
        description: 'Prove value is within specified range',
        publicInputs: {
          range: '1000000000000000000000000000000000000000000000000000000000000000000'
        },
        privateInputs: {
          value: '2000000000000000000000000000000000000000000000000000000000000000000' // Outside range
        },
        relation: '0 <= value <= range'
      };

      await expect(pedersenGenerator.generateRangeProof(statement))
        .rejects.toThrow('Value outside specified range');
    });
  });

  describe('Quantum-Resistant Cryptography', () => {
    test('should generate CRYSTALS-Kyber key pair', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('CRYSTALS-Kyber', 768);
      
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(typeof keyPair.publicKey).toBe('string');
      expect(typeof keyPair.privateKey).toBe('string');
    });

    test('should generate NTRU key pair', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('NTRU', 768);
      
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    test('should generate FALCON key pair', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('FALCON', 512);
      
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    test('should generate Dilithium key pair', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('Dilithium', 1024);
      
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });

    test('should generate SPHINCS+ key pair', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('SPHINCS+', 256);
      
      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
    });
  });

  describe('Quantum-Resistant Signatures', () => {
    test('should create and verify CRYSTALS-Kyber signature', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('CRYSTALS-Kyber', 768);
      const message = new TextEncoder().encode('Test message for quantum signature');
      
      const signature = await QuantumSignatureManager.createQuantumSignature(
        keyPair.privateKey,
        message,
        'CRYSTALS-Kyber'
      );
      
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
      
      const isValid = await QuantumSignatureManager.verifyQuantumSignature(
        keyPair.publicKey,
        signature,
        message,
        'CRYSTALS-Kyber'
      );
      
      expect(isValid).toBe(true);
    });

    test('should create and verify FALCON signature', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('FALCON', 512);
      const message = new TextEncoder().encode('Test message for FALCON signature');
      
      const signature = await QuantumSignatureManager.createQuantumSignature(
        keyPair.privateKey,
        message,
        'FALCON'
      );
      
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
      
      const isValid = await QuantumSignatureManager.verifyQuantumSignature(
        keyPair.publicKey,
        signature,
        message,
        'FALCON'
      );
      
      expect(isValid).toBe(true);
    });

    test('should create and verify SPHINCS+ signature', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('SPHINCS+', 256);
      const message = new TextEncoder().encode('Test message for SPHINCS+ signature');
      
      const signature = await QuantumSignatureManager.createQuantumSignature(
        keyPair.privateKey,
        message,
        'SPHINCS+'
      );
      
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
      
      const isValid = await QuantumSignatureManager.verifyQuantumSignature(
        keyPair.publicKey,
        signature,
        message,
        'SPHINCS+'
      );
      
      expect(isValid).toBe(true);
    });

    test('should reject signature with wrong message', async () => {
      const keyPair = await QuantumKeyGenerator.generateQuantumKeyPair('CRYSTALS-Kyber', 768);
      const originalMessage = new TextEncoder().encode('Original message');
      const wrongMessage = new TextEncoder().encode('Wrong message');
      
      const signature = await QuantumSignatureManager.createQuantumSignature(
        keyPair.privateKey,
        originalMessage,
        'CRYSTALS-Kyber'
      );
      
      const isValid = await QuantumSignatureManager.verifyQuantumSignature(
        keyPair.publicKey,
        signature,
        wrongMessage,
        'CRYSTALS-Kyber'
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('Cryptographic Randomness', () => {
    test('should generate cryptographically secure random values', () => {
      const random1 = crypto.getRandomValues(new Uint8Array(32));
      const random2 = crypto.getRandomValues(new Uint8Array(32));
      
      expect(random1).toBeDefined();
      expect(random2).toBeDefined();
      expect(random1.length).toBe(32);
      expect(random2.length).toBe(32);
      
      // Very unlikely to be identical
      const isIdentical = random1.every((byte, index) => byte === random2[index]);
      expect(isIdentical).toBe(false);
    });

    test('should generate different random values each time', () => {
      const randomValues = Array(10).fill(null).map(() => 
        crypto.getRandomValues(new Uint8Array(16))
      );
      
      // Check that all values are different
      for (let i = 0; i < randomValues.length; i++) {
        for (let j = i + 1; j < randomValues.length; j++) {
          const isIdentical = randomValues[i].every((byte, index) => 
            byte === randomValues[j][index]
          );
          expect(isIdentical).toBe(false);
        }
      }
    });
  });
});