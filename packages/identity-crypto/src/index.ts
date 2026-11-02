/**
 * @par-noir/identity-crypto
 *
 * Canonical IdentityCrypto (create/unlock) plus EncryptionManager,
 * cryptoWorkerManager, and SecureCredentialManager. pN ids come from
 * `deriveCanonicalPnIdentifier` in `@par-noir/pqc-crypto`.
 *
 * Export leaf modules before IdentityCrypto to keep init order stable under bundlers.
 */

export { MemorySecurity } from './memorySecurity';
export { cryptoWorkerManager } from './cryptoWorkerManager';
export { default } from './cryptoWorkerManager';
export { SecureCredentialManager } from './secureCredentialManager';
export { EncryptionManager } from './encryptionManager';
export { decryptPrivateFile, decryptPrivateFileBlob } from './privateFile';
export type { PrivateFileOwner, PrivateFilePackageShape } from './privateFile';
export { safePnDisplayName } from './displayName';

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
