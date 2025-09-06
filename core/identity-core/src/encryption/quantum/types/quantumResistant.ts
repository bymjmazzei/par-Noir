import { cryptoWorkerManager } from '../../cryptoWorkerManager';
import { CryptoKeyPair } from '../../crypto';

export interface QuantumResistantConfig {
  enabled: boolean;
  algorithm: 'CRYSTALS-Kyber' | 'NTRU' | 'SABER' | 'FALCON' | 'Dilithium' | 'SPHINCS+';
  hybridMode: boolean; // Use both classical and quantum-resistant
  keySize: 512 | 768 | 1024 | 2048;
  fallbackToClassical: boolean;
  securityLevel: '128' | '192' | '256'; // Security level in bits
}

export interface QuantumKeyPair {
  classicalPublicKey: string;
  classicalPrivateKey: string;
  quantumPublicKey: string;
  quantumPrivateKey: string;
  hybridSignature: string;
  algorithm: string;
  createdAt: string;
  quantumResistant: boolean;
  securityLevel: string;
  keySize: number;
}

// Real lattice-based cryptography parameters
export interface LatticeParams {
  n: number; // Lattice dimension
  q: bigint; // Modulus
  sigma: number; // Standard deviation for Gaussian sampling
  k: number; // Number of samples
}

// Algorithm-specific parameters
export interface AlgorithmParams {
  CRYSTALS_Kyber: Record<string, LatticeParams>;
  NTRU: Record<string, LatticeParams>;
  SABER: LatticeParams;
  FALCON: LatticeParams;
  Dilithium: LatticeParams;
  SPHINCS_Plus: LatticeParams;
}

// Signature verification result
export interface SignatureVerificationResult {
  isValid: boolean;
  algorithm: string;
  verificationTime: number;
  error?: string;
}

// Key generation result
export interface KeyGenerationResult {
  success: boolean;
  keyPair?: QuantumKeyPair;
  algorithm: string;
  generationTime: number;
  error?: string;
}

// Security level information
export interface SecurityLevelInfo {
  classical: string;
  quantum: string;
  hybrid: string;
  algorithm: string;
  keySize: number;
  quantumResistant: boolean;
}
