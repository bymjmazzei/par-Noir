/**
 * @par-noir/identity-crypto
 *
 * Canonical IdentityCrypto (create/unlock) plus VolumeIdGenerator, EncryptionManager,
 * cryptoWorkerManager, and SecureCredentialManager.
 */

export { IdentityCrypto } from './identityCrypto';
export type {
  AuthSession,
  DIDKeyPair,
  EncryptedData,
  EncryptedIdentity,
  IdentityCreationResult,
} from './identityCrypto';

export { VolumeIdGenerator } from './volumeIdGenerator';
export type { VolumeIdParams } from './volumeIdGenerator';

export { EncryptionManager } from './encryptionManager';

export { cryptoWorkerManager } from './cryptoWorkerManager';
export { default } from './cryptoWorkerManager';
export { SecureCredentialManager } from './secureCredentialManager';
export { MemorySecurity } from './memorySecurity';

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
