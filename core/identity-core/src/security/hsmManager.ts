/**
 * Hardware Security Module (HSM) Manager
 * 
 * This file is now a simple re-export wrapper for the new modular HSM manager system.
 * All functionality has been broken down into specialized modules:
 *
 * - hsmManager/types/hsmManager.ts: Interfaces and types for HSM management
 * - hsmManager/modules/providerManager.ts: HSM provider connection management
 * - hsmManager/modules/operationsManager.ts: HSM cryptographic operations
 * - hsmManager/modules/hsmManager.ts: Main HSM manager orchestrator
 * - hsmManager/index.ts: Re-exports all modular components
 */

// Re-export the main HSM manager and all modular components
export { HSMManager } from './hsmManager/modules/hsmManager';

// Re-export types for backward compatibility
export * from './hsmManager/types/hsmManager';

// Re-export individual modules for direct access if needed
export { ProviderManager } from './hsmManager/modules/providerManager';
export { OperationsManager } from './hsmManager/modules/operationsManager';

// Default export for backward compatibility
export { HSMManager as default } from './hsmManager/modules/hsmManager';
