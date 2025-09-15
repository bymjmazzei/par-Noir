/**
 * Distributed Identity Manager
 * 
 * This file is now a simple re-export wrapper for the new modular distributed identity manager system.
 * All functionality has been broken down into specialized modules:
 * 
 * - types/distributedIdentityManager.ts: Interfaces and types for distributed identity management
 * - zkProofManager.ts: ZK proof generation and management
 * - operationLogger.ts: Operation logging and audit trail management
 * - didDocumentManager.ts: DID document creation, storage, and management
 * - distributedIdentityManager.ts: Main DistributedIdentityManager orchestrator class
 * - index.ts: Re-exports all modular components
 */

// Re-export the main DistributedIdentityManager class and all modular components
export { DistributedIdentityManager } from './distributedIdentityManager/distributedIdentityManager';

// Re-export types for backward compatibility
export * from './distributedIdentityManager/types/distributedIdentityManager';

// Re-export individual modules for direct access if needed
export { DistributedZKProofManager } from './distributedIdentityManager/zkProofManager';
export { OperationLogger } from './distributedIdentityManager/operationLogger';
export { DIDDocumentManager } from './distributedIdentityManager/didDocumentManager';

// Default export for backward compatibility
export { DistributedIdentityManager as default } from './distributedIdentityManager/distributedIdentityManager'; 