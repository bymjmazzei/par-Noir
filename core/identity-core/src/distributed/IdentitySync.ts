/**
 * Identity Synchronization System
 * 
 * This file is now a simple re-export wrapper for the new modular identity sync system.
 * All functionality has been broken down into specialized modules:
 * 
 * - types/identitySync.ts: Interfaces and types for identity synchronization
 * - syncManager.ts: Core synchronization logic and device management
 * - encryptionManager.ts: Encryption operations for identity sync
 * - ipfsManager.ts: IPFS operations and gateway management
 * - didDocumentManager.ts: DID document management for sync
 * - storageManager.ts: Secure storage functionality for identity sync
 * - securityManager.ts: Security-related functionality for identity sync
 * - identitySync.ts: Main IdentitySync orchestrator class
 * - index.ts: Re-exports all modular components
 */

// Re-export the main IdentitySync class and all modular components
export { IdentitySync } from './identitySync/identitySync';

// Re-export types for backward compatibility
export * from './types/identitySync';

// Re-export individual modules for direct access if needed
export { SyncManager } from './identitySync/syncManager';
export { EncryptionManager } from './identitySync/encryptionManager';
export { IPFSManager } from './identitySync/ipfsManager';
export { DIDDocumentManager } from './identitySync/didDocumentManager';
export { StorageManager } from './identitySync/storageManager';
export { SecurityManager } from './identitySync/securityManager';

// Default export for backward compatibility
export { IdentitySync as default } from './identitySync/identitySync'; 