/**
 * APM (Application Performance Monitoring) Service
 * 
 * This file is now a simple re-export wrapper for the new modular APM system.
 * All functionality has been broken down into specialized modules:
 *
 * - apm/types/apm.ts: Interfaces and types for APM service
 * - apm/modules/transactionManager.ts: Transaction and span management
 * - apm/modules/errorManager.ts: Error capture and management
 * - apm/modules/queueManager.ts: Queue management and flushing
 * - apm/modules/apmService.ts: Main APM service orchestrator
 * - apm/index.ts: Re-exports all modular components
 */

// Re-export the main APM service and all modular components
export { APMService, apmService } from './apm';

// Re-export types for backward compatibility
export * from './apm/types/apm';

// Re-export individual modules for direct access if needed
export { TransactionManager } from './apm/modules/transactionManager';
export { ErrorManager } from './apm/modules/errorManager';
export { QueueManager } from './apm/modules/queueManager';

// Default export for backward compatibility
export { APMService as default } from './apm';
