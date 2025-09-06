// Military-Grade Cryptographic Operations - Now exported from the modular system
export { MilitaryGradeCrypto } from './crypto/militaryGradeCrypto';
export { CoreCryptoManager as CryptoManager } from './crypto/coreCryptoManager';

// The MilitaryGradeCrypto class is now exported from the modular crypto system
// All functionality has been broken down into specialized modules:
// - types/crypto.ts: Interfaces and types for crypto operations
// - constants/cryptoConstants.ts: Crypto constants and configuration defaults
// - coreCryptoManager.ts: Core crypto management functionality
// - hsmManager.ts: Hardware Security Module integration
// - keyManager.ts: Key generation and management
// - cryptoOperationsManager.ts: Core cryptographic operations
// - securityManager.ts: Security and authentication management
// - complianceManager.ts: Compliance and reporting functionality
// - militaryGradeCrypto.ts: Main orchestrator class

// Re-export types for backward compatibility
export * from './crypto/types/crypto'; 