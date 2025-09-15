/**
 * IndexedDB storage layer for the Identity Protocol
 * 
 * This file is now a simple re-export wrapper for the new modular IndexedDB storage system.
 * All functionality has been broken down into specialized modules:
 *
 * - indexeddb/types/indexeddb.ts: Interfaces and types for IndexedDB storage
 * - indexeddb/modules/databaseManager.ts: Database connection and management
 * - indexeddb/modules/didManager.ts: DID CRUD operations and validation
 * - indexeddb/modules/indexedDBStorage.ts: Main IndexedDB storage orchestrator
 * - indexeddb/index.ts: Re-exports all modular components
 */

// Re-export the main IndexedDB storage and all modular components
export { IndexedDBStorage } from './indexeddb/modules/indexedDBStorage';

// Re-export types for backward compatibility
export * from './indexeddb/types/indexeddb';

// Re-export individual modules for direct access if needed
export { DatabaseManager } from './indexeddb/modules/databaseManager';
export { DIDManager } from './indexeddb/modules/didManager';

// Default export for backward compatibility
export { IndexedDBStorage as default } from './indexeddb/modules/indexedDBStorage';
