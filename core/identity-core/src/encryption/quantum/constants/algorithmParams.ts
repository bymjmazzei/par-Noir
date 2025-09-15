import { LatticeParams } from '../types/quantumResistant';

// CRYSTALS-Kyber parameters (NIST PQC Round 3 winner)
export const KYBER_PARAMS: Record<string, LatticeParams> = {
  '512': { n: 256, q: BigInt('3329'), sigma: 2.5, k: 2 },
  '768': { n: 256, q: BigInt('3329'), sigma: 2.5, k: 3 },
  '1024': { n: 256, q: BigInt('3329'), sigma: 2.5, k: 4 }
};

// NTRU parameters
export const NTRU_PARAMS: Record<string, LatticeParams> = {
  '512': { n: 509, q: BigInt('2048'), sigma: 1.0, k: 1 },
  '768': { n: 677, q: BigInt('2048'), sigma: 1.0, k: 1 },
  '1024': { n: 821, q: BigInt('2048'), sigma: 1.0, k: 1 }
};

// SABER parameters
export const SABER_PARAMS: LatticeParams = {
  n: 256,
  q: BigInt('8192'),
  sigma: 2.0,
  k: 3
};

// FALCON parameters
export const FALCON_PARAMS: LatticeParams = {
  n: 512,
  q: BigInt('12289'),
  sigma: 1.5,
  k: 1
};

// Dilithium parameters
export const DILITHIUM_PARAMS: LatticeParams = {
  n: 256,
  q: BigInt('8380417'),
  sigma: 2.0,
  k: 4
};

// SPHINCS+ parameters
export const SPHINCS_PLUS_PARAMS: LatticeParams = {
  n: 256,
  q: BigInt('8380417'),
  sigma: 2.0,
  k: 1
};

// Default configuration
export const DEFAULT_QUANTUM_CONFIG = {
  enabled: true,
  algorithm: 'CRYSTALS-Kyber' as const,
  hybridMode: true,
  keySize: 768 as const,
  fallbackToClassical: true,
  securityLevel: '192' as const
};

// Algorithm names mapping
export const ALGORITHM_NAMES = {
  'CRYSTALS-Kyber': 'CRYSTALS-Kyber',
  'NTRU': 'NTRU',
  'SABER': 'SABER',
  'FALCON': 'FALCON',
  'Dilithium': 'Dilithium',
  'SPHINCS+': 'SPHINCS+'
} as const;

// Security level mapping
export const SECURITY_LEVELS = {
  '128': 128,
  '192': 192,
  '256': 256
} as const;

// Key size mapping
export const KEY_SIZES = {
  512: 512,
  768: 768,
  1024: 1024,
  2048: 2048
} as const;
