import { cryptoWorkerManager } from '../../cryptoWorkerManager';
export const CRYPTO_CONSTANTS = {
  MIN_PASSCODE_LENGTH: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  MILITARY_CONFIG: {
    iterations: 1000000, // 1M iterations
    memoryCost: 65536, // 64MB
    parallelism: 4
  },
  ALGORITHM: '',
  KEY_LENGTH: 256,
  DEFAULT_KEY_ROTATION_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  SECURITY_LEVELS: {
    STANDARD: 'standard',
    MILITARY: 'military',
    TOP_SECRET: 'top-secret'
  },
  ALGORITHMS: {
    AES_256_GCM: '',
    CHACHA20_POLY1305: 'ChaCha20-Poly1305',
    AES_256_CCM: 'AES-256-CCM'
  },
  HASH_ALGORITHMS: {
    SHA_384: 'SHA-384',
    SHA_512: 'SHA-512',
    SHAKE256: 'SHAKE256',
    KECCAK_256: 'Keccak-256'
  },
  ELLIPTIC_CURVES: {
    P_384: 'P-384',
    P_521: 'P-521',
    BLS12_381: 'BLS12-381'
  },
  KEY_LENGTHS: {
    BITS_256: 256,
    BITS_384: 384,
    BITS_512: 512
  }
} as const;

export const HARDWARE_CONFIG_DEFAULTS = {
  enabled: true,
  useSecureEnclave: true,
  useTPM: true,
  useWebAuthn: true
} as const;

export const CRYPTO_CONFIG_DEFAULTS = {
  algorithm: CRYPTO_CONSTANTS.ALGORITHMS.AES_256_GCM,
  keyLength: CRYPTO_CONSTANTS.KEY_LENGTHS.BITS_256,
  hashAlgorithm: CRYPTO_CONSTANTS.HASH_ALGORITHMS.SHA_512,
  ellipticCurve: CRYPTO_CONSTANTS.ELLIPTIC_CURVES.P_384,
  quantumResistant: true,
  keyRotationInterval: CRYPTO_CONSTANTS.DEFAULT_KEY_ROTATION_INTERVAL,
  postQuantumEnabled: true,
  securityLevel: CRYPTO_CONSTANTS.SECURITY_LEVELS.MILITARY
} as const;
