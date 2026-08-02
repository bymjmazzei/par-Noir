/**
 * @par-noir/identity-crypto
 *
 * Canonical IdentityCrypto (create/unlock) plus VolumeIdGenerator, EncryptionManager,
 * cryptoWorkerManager, and SecureCredentialManager.
 *
 * Export leaf modules before IdentityCrypto to keep init order stable under bundlers.
 */

export { MemorySecurity } from './memorySecurity';
export { cryptoWorkerManager } from './cryptoWorkerManager';
export { default } from './cryptoWorkerManager';
export { SecureCredentialManager } from './secureCredentialManager';
export { EncryptionManager } from './encryptionManager';
export { VolumeIdGenerator } from './volumeIdGenerator';
export type { VolumeIdParams } from './volumeIdGenerator';

export { IdentityCrypto } from './identityCrypto';
export type {
  AuthSession,
  DIDKeyPair,
  EncryptedData,
  EncryptedIdentity,
  IdentityCreationResult,
} from './types';

export type {
  KeyPair,
  DIDResult,
  IdentityData,
  AuthenticationResult,
  RecoveryKeyData,
  TokenPayload,
  TokenHeader,
  DecryptionParameters,
} from './types';
