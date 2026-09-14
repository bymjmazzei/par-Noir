/**
 * Browser-safe exports (no IdentityCrypto → recovery-crypto / secrets.js).
 * Aggregator and other L4 surfaces that only need file encryption import from here.
 */
export { MemorySecurity } from './memorySecurity';
export { cryptoWorkerManager } from './cryptoWorkerManager';
export { SecureCredentialManager } from './secureCredentialManager';
export { EncryptionManager } from './encryptionManager';
export { VolumeIdGenerator } from './volumeIdGenerator';
export type { VolumeIdParams } from './volumeIdGenerator';
export type {
  EncryptedData,
  DecryptionParameters,
  AuthSession,
  DIDKeyPair,
  EncryptedIdentity,
  IdentityCreationResult,
  KeyPair,
  DIDResult,
  IdentityData,
  AuthenticationResult,
  TokenPayload,
  TokenHeader,
} from './types';
