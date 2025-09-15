import { cryptoWorkerManager } from './cryptoWorkerManager';
// Re-export all modular crypto functionality
export { IdentityCrypto } from './identityCrypto';
export { DIDManager } from './didManager';
export { RecoveryKeyManager } from './recoveryKeyManager';
export { PasscodeManager } from './passcodeManager';
export { EncryptionManager } from './encryptionManager';
export { TokenManager } from './tokenManager';
export { IdentityManager } from './identityManager';

// Re-export types
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
    DecryptionParameters
} from '../types/crypto';
