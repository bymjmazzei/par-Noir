/**
 * Identity Synchronization System
 *
 * Local secure storage sync. IPFS/OrbitDB paths were removed;
 * Drive + API is the product storage story.
 */

export { IdentitySync } from './identitySync/identitySync';
export * from './types/identitySync';
export { SyncManager } from './identitySync/syncManager';
export { EncryptionManager } from './identitySync/encryptionManager';
export { DIDDocumentManager } from './identitySync/didDocumentManager';
export { StorageManager } from './identitySync/storageManager';
export { SecurityManager } from './identitySync/securityManager';
export { IdentitySync as default } from './identitySync/identitySync';
