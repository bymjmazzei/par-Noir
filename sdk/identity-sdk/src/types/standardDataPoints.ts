// Standardized Data Points System for SDK
// 
// This file is now a simple re-export wrapper for the new modular standard data points system.
// All functionality has been broken down into specialized modules:
//
// - standardDataPoints/types/standardDataPoints.ts: Interfaces and types for standard data points
// - standardDataPoints/constants/dataPointRegistry.ts: Standard data points registry and constants
// - standardDataPoints/modules/zkpGenerator.ts: Zero-knowledge proof generation for data points
// - standardDataPoints/modules/dataPointProposalManager.ts: Data point proposal and voting management
// - standardDataPoints/modules/standardDataPoints.ts: Main standard data points orchestrator
// - standardDataPoints/index.ts: Re-exports all modular components
//

// Re-export the main standard data points and all modular components
export { StandardDataPoints } from './standardDataPoints';

// Re-export types for backward compatibility
export * from './standardDataPoints/types/standardDataPoints';

// Re-export constants for backward compatibility
export { STANDARD_DATA_POINTS } from './standardDataPoints/constants/dataPointRegistry';

// Re-export individual modules for direct access if needed
export { ZKPGenerator } from './standardDataPoints/modules/zkpGenerator';
export { DataPointProposalManager } from './standardDataPoints/modules/dataPointProposalManager';

// Default export for backward compatibility
export { StandardDataPoints as default } from './standardDataPoints';
