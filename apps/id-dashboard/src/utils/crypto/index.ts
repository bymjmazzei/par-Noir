/** @deprecated Import from `@par-noir/identity-crypto` instead. */
export {
  IdentityCrypto,
  VolumeIdGenerator,
  EncryptionManager,
  cryptoWorkerManager,
  SecureCredentialManager,
  MemorySecurity,
} from '@par-noir/identity-crypto';
export type {
  KeyPair,
  DIDResult,
  IdentityData,
  EncryptedData,
  EncryptedIdentity,
  AuthenticationResult,
  RecoveryKeyData,
  TokenPayload,
  TokenHeader,
  DecryptionParameters,
  AuthSession,
  DIDKeyPair,
  IdentityCreationResult,
  VolumeIdParams,
} from '@par-noir/identity-crypto';

// Legacy modular managers still local to the dashboard
export { DIDManager } from './didManager';
export { RecoveryKeyManager } from './recoveryKeyManager';
export { PasscodeManager } from './passcodeManager';
export { TokenManager } from './tokenManager';
export { IdentityManager } from './identityManager';
