import { cryptoWorkerManager } from './encryption/cryptoWorkerManager';
/**
 * Identity Core - Main class for managing decentralized identities
 * 
 * This file is now a simple re-export wrapper for the new modular IdentityCore system.
 * All functionality has been broken down into specialized modules:
 *
 * - core/types/identityCore.ts: Interfaces and types for IdentityCore
 * - core/modules/didManager.ts: DID creation, management, and operations
 * - core/modules/authenticationManager.ts: Authentication and access control
 * - core/modules/eventManager.ts: Event handling and management
 * - core/modules/identityCore.ts: Main IdentityCore orchestrator class
 * - core/index.ts: Re-exports all modular components
 */

// Re-export the main IdentityCore class and all modular components
export { IdentityCore } from './core';

// Re-export types for backward compatibility
export * from './core/types/identityCore';

// Re-export individual modules for direct access if needed
export { DIDManager } from './core/modules/didManager';
export { AuthenticationManager } from './core/modules/authenticationManager';
export { EventManager } from './core/modules/eventManager';

// Re-export other core modules
export { CryptoManager } from './encryption/crypto';
export { IndexedDBStorage } from './storage/indexeddb';
export { PrivacyManager } from './utils/privacy-manager';
export { ZKProofManager } from './encryption/zk-proofs';
export { DIDResolver } from './distributed/DIDResolver';
export { IdentitySync } from './distributed/IdentitySync';
export { DecentralizedAuth } from './distributed/DecentralizedAuth';
export { DistributedIdentityManager } from './distributed/DistributedIdentityManager';

// Default export for backward compatibility
export { IdentityCore as default } from './core'; 